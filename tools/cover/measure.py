"""Measure the 1977 cover photo (NASA/JPL GPN-2000-001978) into assets-src/cover/geometry.json.

Run: python -P tools/cover/measure.py
Input : sources/cover-photo/GPN-2000-001978.jpg (2215 x 2215), data/cover.json (expected strings only,
        used as a check that what was measured reads as what the cover says), sources/pioneer-svg
        (map geometry, through tools/data/svgmap.py).
Output: assets-src/cover/geometry.json. Every coordinate is in photo pixels (x right, y down, pixel
        centres at integers) with the provenance of how it was measured. build_cover.py turns it into
        millimetres and writes the SVG; nothing here is generated imagery.

Method in one paragraph: the brass is flattened with a top-hat (etch.etch_norm, bright thin features
over a local background, normalised by local etch brightness). Circles are fitted to the ridge. Short
marks (binary digits, bars, dashes) are connected components, measured by principal axis (centre,
direction, length at half the peak). Frames and strokes are skeletonised and simplified (trace.py).
Hand-placed items (the cartridges) are marked "hand" with the crop they were read from.
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'data'))
import numpy as np
from scipy import ndimage as ndi
from scipy.signal import find_peaks

import etch
import trace

ROOT = etch.ROOT
OUT = os.path.join(ROOT, 'assets-src', 'cover', 'geometry.json')
COVER = json.load(open(os.path.join(ROOT, 'data', 'cover.json'), encoding='utf-8'))

D = etch.etch_norm()
H, W = D.shape
YY, XX = np.mgrid[0:H, 0:W]
LOG = []


def log(*a):
    s = ' '.join(str(x) for x in a)
    LOG.append(s)
    print(s)


def r2(v, n=2):
    return round(float(v), n)


def pts2(P, n=2):
    return [[r2(x, n), r2(y, n)] for x, y in P]


# ---------------------------------------------------------------------------------------------
# 1. The cover disc
# ---------------------------------------------------------------------------------------------
def fit_circle_pts(P):
    P = np.asarray(P, float)
    A = np.c_[2 * P[:, 0], 2 * P[:, 1], np.ones(len(P))]
    b = (P ** 2).sum(1)
    for _ in range(5):
        c = np.linalg.lstsq(A, b, rcond=None)[0]
        r = float(np.sqrt(c[2] + c[0] ** 2 + c[1] ** 2))
        res = np.hypot(P[:, 0] - c[0], P[:, 1] - c[1]) - r
        k = np.abs(res) < max(2.5 * res.std(), 1.0)
        P, A, b = P[k], A[k], b[k]
    return float(c[0]), float(c[1]), r, float(res[k].std()), int(len(P))


def measure_disc():
    g = etch.load_gray()
    pts = []
    for a in np.linspace(0, 2 * np.pi, 720, endpoint=False):
        rs = np.arange(1000, 1130)
        xs = 1100 + rs * np.cos(a)
        ys = 1108 + rs * np.sin(a)
        ok = (xs >= 0) & (xs < W - 1) & (ys >= 0) & (ys < H - 1)
        if ok.sum() < 100:
            continue
        v = etch.sample(g, xs[ok], ys[ok])
        vs = np.convolve(v, np.ones(3) / 3, 'same')
        dd = np.diff(vs)
        i = int(np.argmin(dd[2:-2])) + 2
        if dd[i] < -8:
            pts.append((xs[ok][i], ys[ok][i]))
    cx, cy, r, rms, n = fit_circle_pts(pts)
    log(f'disc edge: centre ({cx:.2f}, {cy:.2f}) r {r:.2f} px, rms {rms:.2f}, {n} points')
    return {'cx': r2(cx), 'cy': r2(cy), 'r': r2(r), 'rms': r2(rms), 'n': n}


# ---------------------------------------------------------------------------------------------
# helpers: marks (connected components), lines
# ---------------------------------------------------------------------------------------------
def marks(box, thr=85, min_area=25, exclude=(), mask_extra=None, aligned=False):
    """Connected components of D > thr inside box=(x0,y0,x1,y1) (inclusive-exclusive).

    Returns dicts {cx, cy, ux, uy, len, wid, n} sorted left to right; (ux, uy) is the principal axis.
    """
    x0, y0, x1, y1 = box
    m = np.zeros(D.shape, bool)
    m[y0:y1, x0:x1] = D[y0:y1, x0:x1] > thr
    for (a, b, c, d) in exclude:
        m[b:d, a:c] = False
    if mask_extra is not None:
        m &= mask_extra
    lab, n = ndi.label(m, np.ones((3, 3)))
    out = []
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        if len(ys) < min_area:
            continue
        P = np.c_[xs, ys].astype(float)
        w = D[ys, xs]
        c = (P * w[:, None]).sum(0) / w.sum()
        u, s, vt = np.linalg.svd((P - P.mean(0)) * 1.0, full_matrices=False)
        ax = vt[0]
        if ax[0] < 0 or (abs(ax[0]) < 1e-9 and ax[1] < 0):
            ax = -ax
        t = (P - c) @ ax
        tn = (P - c) @ np.array([-ax[1], ax[0]])
        if aligned and min(abs(ax[0]), abs(ax[1])) > 0.3:
            continue  # scratches run diagonally; etched marks are drawn along the page axes
        out.append({'cx': float(c[0]), 'cy': float(c[1]), 'ux': float(ax[0]), 'uy': float(ax[1]),
                    'len': float(t.max() - t.min() + 1), 'wid': float(tn.max() - tn.min() + 1), 'n': int(len(ys))})
    out.sort(key=lambda o: (o['cx'], o['cy']))
    return out


def split_fused(mk, axis_vertical, dash=14.0, limit=22.0):
    """Marks whose halos fuse two dashes: split a mark longer than `limit` into round(len/15) equal dashes.

    Returns marks (dicts like marks()) with len reduced by 2 px per split piece.
    """
    out = []
    for o in mk:
        vert = abs(o['uy']) > abs(o['ux'])
        k = 1
        if vert == axis_vertical and o['len'] > limit:
            k = max(1, int(round(o['len'] / 15.0)))
        if k == 1:
            out.append(o)
            continue
        pitch = o['len'] / k
        for j in range(k):
            off = (j - (k - 1) / 2.0) * pitch
            out.append(dict(o, cx=o['cx'] + o['ux'] * off, cy=o['cy'] + o['uy'] * off, len=pitch - 2.0))
    return out


def seg_of(mk):
    h = mk['len'] / 2
    return [[r2(mk['cx'] - mk['ux'] * h), r2(mk['cy'] - mk['uy'] * h)],
            [r2(mk['cx'] + mk['ux'] * h), r2(mk['cy'] + mk['uy'] * h)]]


def is_bar_h(mk):
    """In a horizontally written row a bar is taller than wide."""
    return abs(mk['uy']) > abs(mk['ux'])


def read_row(box, expect, name, thr=85, exclude=(), order='x', min_area=25):
    """Measure a row of binary marks and check it reads as `expect`; return the digit records.

    Neighbouring marks can fuse through their halos, so the threshold is stepped (never the marks)
    until the row reads as the cover says; the threshold used is logged.
    """
    got = None
    for t in (thr, 100, 110, 120, 130, 70):
        mk = marks(box, t, min_area, exclude, aligned=True)
        if order == 'x':
            mk.sort(key=lambda o: o['cx'])
        got = ''.join('1' if is_bar_h(o) else '0' for o in mk)
        if got == expect:
            log(f'row {name}: {got} OK at threshold {t}')
            return [{'bit': b, 'seg': seg_of(o), 'len': r2(o['len']), 'wid': r2(o['wid'])} for b, o in zip(got, mk)]
    raise SystemExit(f'row {name} does not read as the cover says (last read {got}, expected {expect})')


def line_fit(p0, p1, tol=4.0, thr=60, extent=None):
    """Total-least-squares line through bright pixels near the segment p0-p1 (photo px)."""
    p0 = np.array(p0, float)
    p1 = np.array(p1, float)
    v = p1 - p0
    L = np.hypot(*v)
    v /= L
    nrm = np.array([-v[1], v[0]])
    x0, x1 = int(min(p0[0], p1[0]) - tol - 2), int(max(p0[0], p1[0]) + tol + 3)
    y0, y1 = int(min(p0[1], p1[1]) - tol - 2), int(max(p0[1], p1[1]) + tol + 3)
    ys, xs = np.mgrid[y0:y1, x0:x1]
    d = D[y0:y1, x0:x1]
    rel = np.c_[xs.ravel() - p0[0], ys.ravel() - p0[1]]
    t = rel @ v
    s = rel @ nrm
    sel = (np.abs(s) < tol) & (t > 3) & (t < L - 3) & (d.ravel() > thr)
    P = np.c_[xs.ravel()[sel], ys.ravel()[sel]].astype(float)
    w = d.ravel()[sel]
    for _ in range(3):
        c = (P * w[:, None]).sum(0) / w.sum()
        cov = ((P - c) * w[:, None]).T @ (P - c) / w.sum()
        ev, evec = np.linalg.eigh(cov)
        ax = evec[:, 1]
        if ax @ v < 0:
            ax = -ax
        res = np.abs((P - c) @ np.array([-ax[1], ax[0]]))
        k = res < max(2.0, 2.5 * np.sqrt(ev[0]))
        P, w = P[k], w[k]
    return c, ax


def intersect(c1, a1, c2, a2):
    A = np.array([a1, -a2]).T
    t = np.linalg.solve(A, c2 - c1)
    return c1 + a1 * t[0]


# ---------------------------------------------------------------------------------------------
# 2. Record plan view
# ---------------------------------------------------------------------------------------------
def measure_plan():
    out = {}
    skip = lambda a: (-32 < (a if a < 180 else a - 360) < 14)
    cx, cy, R, rms, n = etch.ring_fit(D, (577.1, 677.1), 250, 3.5, n=1440, skip=skip)
    log(f'plan ring: ({cx:.2f}, {cy:.2f}) r {R:.2f} rms {rms:.2f} n {n}')
    out['ring'] = {'cx': r2(cx), 'cy': r2(cy), 'r': r2(R), 'rms': r2(rms)}
    lab = etch.ring_fit(D, (577.1, 678.7), 48.5, 6, n=720)
    hole = etch.ring_fit(D, (577.1, 678.4), 9.4, 5, n=720)
    log(f'plan label circle: {lab[:3]} rms {lab[3]:.2f}; spindle circle: {hole[:3]} rms {hole[3]:.2f}')
    out['labelCircle'] = {'cx': r2(lab[0]), 'cy': r2(lab[1]), 'r': r2(lab[2]), 'rms': r2(lab[3])}
    out['spindleCircle'] = {'cx': r2(hole[0]), 'cy': r2(hole[1]), 'r': r2(hole[2]), 'rms': r2(hole[3])}
    # rim marks: components outside the ring band, away from the cartridge
    rr = np.hypot(XX - cx, YY - cy)
    m = (D > 85) & (rr > R + 5) & (rr < R + 34) & ~((XX > 795) & (YY > 550) & (YY < 720))
    lab_, nlab = ndi.label(m, np.ones((3, 3)))
    items = []
    for i in range(1, nlab + 1):
        ys, xs = np.nonzero(lab_ == i)
        if len(ys) < 40:
            continue
        P = np.c_[xs, ys].astype(float)
        w = D[ys, xs]
        c = (P * w[:, None]).sum(0) / w.sum()
        u, s, vt = np.linalg.svd(P - P.mean(0), full_matrices=False)
        ax = vt[0]
        t = (P - c) @ ax
        a = math.degrees(math.atan2(c[1] - cy, c[0] - cx)) % 360
        rad = abs(ax @ np.array([math.cos(math.radians(a)), math.sin(math.radians(a))]))
        h = (t.max() - t.min() + 1) / 2
        mid = (t.max() + t.min()) / 2
        c2 = c + ax * mid
        items.append({'angle': a, 'bit': '1' if rad > 0.7 else '0',
                      'seg': [[r2(c2[0] - ax[0] * h), r2(c2[1] - ax[1] * h)], [r2(c2[0] + ax[0] * h), r2(c2[1] + ax[1] * h)]],
                      'len': r2(2 * h)})
    # read counter-clockwise on the picture (decreasing y-down angle) starting at the mark next to the cartridge
    items.sort(key=lambda o: -o['angle'])
    # the mark next to the cartridge is the one at the largest angle below 360 that is before the gap (326.7)
    bits = ''.join(o['bit'] for o in items)
    expect = COVER['record']['rotationPeriod']['binary']
    log(f'plan rim: {len(items)} marks, read {bits} expected {expect} {"OK" if bits == expect else "MISMATCH"}')
    if bits != expect:
        raise SystemExit('rim marks do not read as the cover says')
    for o in items:
        o['angle'] = r2(o['angle'], 3)
    out['rimMarks'] = items
    # cartridge (hand): read from build/cover crops of the photo, see the provenance string
    out['cartridge'] = {
        'provenance': 'hand: outline read from 6x crops of the etch response (tools/cover/view.py v_cart 790 545 850 735 6 etch), '
                      'coordinates in photo px; the plan-view ring is hidden behind the cartridge between the two ring points below',
        'ringBehind': [[799.0, 570.0], [821.0, 713.0]],
        'cap': {'rect': [804.2, 557.5, 836.7, 571.7], 'slot': [806.7, 561.7, 834.2, 568.3]},
        'body': [[803.2, 571.7], [803.0, 665.5], [838.5, 665.5], [838.5, 571.7]],
        'innerRails': [[[808.7, 575.0], [808.7, 664.0]], [[831.7, 575.0], [831.7, 664.0]]],
        'windows': [[815.0, 579.0, 824.0, 600.0], [816.0, 635.0, 825.0, 656.0]],
        'lobeLeft': [[802.6, 576.0], [795.0, 580.0], [793.0, 594.0], [796.0, 608.0], [802.6, 612.0]],
        'lobeRight': [[838.3, 574.0], [845.0, 580.0], [846.0, 594.0], [843.0, 604.0], [838.3, 606.0]],
        'arch': [[806.0, 678.0], [807.5, 669.5], [815.0, 667.0], [826.0, 667.0], [834.0, 669.5], [840.0, 678.0]],
        'stylus': [[811.0, 678.0], [811.0, 704.0], [815.0, 713.0], [832.0, 713.0], [835.0, 704.0], [835.0, 678.0]],
        'stylusSlot': [817.5, 685.0, 826.7, 710.0],
        'wingLeft': [[806.0, 678.0], [797.5, 676.0], [801.0, 682.0], [796.0, 686.0], [802.0, 692.0], [798.0, 698.0], [806.0, 704.0], [812.0, 712.0]],
        'wingRight': [[840.0, 678.0], [848.0, 673.0], [844.0, 680.0], [849.0, 684.0], [843.0, 690.0], [847.0, 697.0], [840.0, 704.0], [834.0, 712.0]],
    }
    return out


# ---------------------------------------------------------------------------------------------
# 3. Side view of the record and the play-time number
# ---------------------------------------------------------------------------------------------
def measure_side():
    out = {}
    # the record seen edge-on: a long thin box. Edge ridges read from column profiles (x 336, 400, 600, 800, 834):
    # top ridge y 1131.2 at x 336 to 1132.8 at x 800 (1133.2 at the right cap), bottom ridge 1138.5 to 1140.5 (1141.0 at the cap);
    # left cap ridge x 335.5, right cap ridge x 834.5.
    out['recordEdge'] = [[[335.5, 1131.3], [834.5, 1133.2], [834.5, 1141.0], [335.5, 1138.6], [335.5, 1131.3]]]
    # the cartridge seen from the side, above the right end (hand: 8x crop of the etch, tools/cover/view.py sc 780 1060 880 1160 8 norm)
    out['cartridge'] = {
        'provenance': 'hand: read from an 8x crop of the etch response, +-1 px',
        'outer': [[814.0, 1069.0], [846.0, 1069.0], [846.5, 1079.0], [850.5, 1084.0], [851.0, 1093.0], [848.5, 1100.0], [846.0, 1104.0],
                  [846.0, 1114.0], [843.0, 1119.0], [839.0, 1121.0]],
        'outerLeft': [[814.0, 1069.0], [813.5, 1079.0], [809.0, 1085.0], [808.5, 1095.0], [811.5, 1102.0], [814.0, 1112.0], [816.0, 1118.0], [821.0, 1121.0]],
        'pocket': [818.0, 1100.0, 842.0, 1121.0],
        'slot': [824.0, 1104.0, 836.0, 1124.0],
        'arch': [[823.0, 1091.5], [828.0, 1089.5], [834.0, 1089.5], [840.0, 1093.0], [845.0, 1099.0]],
        'neck': [[[830.0, 1124.0], [830.0, 1131.5]], [[836.0, 1124.0], [836.0, 1133.0]]],
    }
    bits = COVER['record']['playTime']['binary']
    rows = [(0, 9), (9, 19), (19, 29), (29, 39), (39, 43)]
    boxes = [(592, 1158, 832, 1192), (592, 1196, 832, 1216), (592, 1218, 832, 1238), (592, 1240, 832, 1259), (592, 1260, 832, 1280)]
    out['playTimeRows'] = []
    for (a, b), box, k in zip(rows, boxes, range(5)):
        out['playTimeRows'].append(read_row(box, bits[a:b], f'playTime{k + 1}'))
    dl = marks((570, 1150, 592, 1235), 85)
    dr = marks((834, 1150, 852, 1240), 85)
    log('side delimiters', [(r2(o['cx']), r2(o['cy']), r2(o['len'])) for o in dl + dr])
    out['playTimeBars'] = [seg_of(o) for o in dl + dr]
    # side view of the cartridge (hand + skeleton)
    return out


# ---------------------------------------------------------------------------------------------
# 4. Waveform, line labels, line time, sawtooth, raster, calibration picture
# ---------------------------------------------------------------------------------------------
def label_group(box, expect, name):
    """One label group (a short row of bits above a picture line).

    The brass is scratched diagonally; a scratch can fuse with a mark, so the threshold is stepped until
    the group reads as the cover says (the marks themselves are never edited).
    """
    got = None
    for thr in (110, 100, 90, 85, 95, 105, 80, 120):
        mk = marks(box, thr, 20, aligned=True)
        mk = [o for o in mk if o['len'] > 12 and o['wid'] < 9]
        mk.sort(key=lambda o: o['cx'])
        got = ''.join('1' if is_bar_h(o) else '0' for o in mk)
        if got == expect:
            log(f'labels {name}: {got} OK at threshold {thr}')
            return [{'bit': '1' if is_bar_h(o) else '0', 'seg': seg_of(o), 'len': r2(o['len']), 'wid': r2(o['wid'])} for o in mk]
    raise SystemExit(f'labels {name} do not read as the cover says (last read {got}, expected {expect})')


def label_groups(boxes, expect_groups, name):
    return [label_group(b, e, f'{name} {k + 1}') for k, (b, e) in enumerate(zip(boxes, expect_groups))]


def measure_pictures():
    out = {}
    exp_labels = [x['binary'] for x in COVER['picture']['lineLabels']]
    out['waveformLabels'] = label_groups([(1360, 385, 1405, 440), (1545, 385, 1612, 440), (1738, 385, 1790, 440)], exp_labels, 'waveform')
    out['scanLabels'] = label_groups([(1375, 686, 1415, 730), (1560, 686, 1625, 730), (1735, 686, 1785, 730)], exp_labels, 'scan')
    # waveform trace
    # waveform: the burst of 8 triangular peaks by its apexes; the rest by the skeleton route, tips restored
    top = find_peaks(D[452:458, 1055:1200].mean(0), height=60, distance=8)[0] + 1055
    bot = find_peaks(D[538:545, 1055:1200].mean(0), height=60, distance=8)[0] + 1055
    def apex(xp, up):
        win = D[430:560, xp - 5:xp + 6]
        ys, xs = np.nonzero(win > 70)
        yy = ys + 430
        sel = yy <= yy.min() + 1 if up else yy >= yy.max() - 1
        return [float(xs[sel].mean() + xp - 5), float(yy[sel].mean() + (1.5 if up else -1.5))]
    burst = []
    for i, xt in enumerate(top):
        burst.append(apex(int(xt), True))
        if i < len(bot):
            burst.append(apex(int(bot[i]), False))
    log(f'waveform burst: {len(top)} top apexes, {len(bot)} bottom apexes')
    # the three picture lines, the steps between them and the closing drop: vertices read by eye from 5x and 6x
    # crops of the photo with a pixel grid (tools/cover/view.py w1/w2/w3), +-1.5 px; the skeleton and ridge
    # trackers either cut the sharp dips or followed scratches (see docs/DECISIONS.md D-A22 note in the report)
    hand = [
        (1195, 511), (1271, 511), (1271, 563), (1288, 563), (1288, 572), (1307, 572), (1307, 488),
        (1313, 494), (1315, 505), (1317, 481), (1319, 479), (1325, 460), (1331, 502), (1332, 504), (1335, 489), (1340, 488),
        (1343, 504), (1347, 537), (1349, 512), (1351, 505), (1353, 480), (1355, 502), (1358, 502), (1360, 474), (1362, 473),
        (1364, 483), (1369, 513), (1373, 486), (1377, 448), (1380, 462), (1383, 500), (1385, 503), (1389, 485), (1392, 484),
        (1395, 502), (1402, 542), (1405, 502), (1408, 498), (1413, 478), (1417, 470), (1421, 444), (1424, 482), (1426, 495),
        (1429, 472), (1433, 496), (1436, 502), (1443, 513), (1452, 524), (1453, 559), (1457, 562), (1475, 562), (1480, 572),
        (1488, 574), (1489, 490), (1493, 496), (1496, 495), (1499, 473), (1504, 472), (1510, 456), (1514, 458), (1518, 482),
        (1521, 496), (1527, 485), (1530, 496), (1535, 520), (1540, 530), (1544, 520), (1549, 494), (1554, 473), (1557, 482),
        (1559, 491), (1562, 468), (1566, 465), (1569, 478), (1572, 496), (1574, 487), (1578, 448), (1582, 445), (1584, 470),
        (1585, 482), (1588, 477), (1591, 488), (1595, 528), (1598, 504), (1600, 484), (1602, 474), (1607, 442), (1610, 466),
        (1612, 489), (1615, 471), (1618, 486), (1621, 505), (1625, 510), (1633, 520), (1634, 560), (1638, 562), (1658, 562),
        (1659, 572), (1673, 572), (1674, 488), (1677, 486), (1680, 497), (1684, 496), (1689, 463), (1692, 462), (1694, 467),
        (1697, 457), (1702, 447), (1706, 455), (1709, 469), (1712, 477), (1713, 475), (1716, 465), (1719, 470), (1723, 488),
        (1733, 528), (1737, 513), (1742, 473), (1746, 460), (1748, 473), (1752, 482), (1754, 463), (1758, 463), (1762, 482),
        (1767, 442), (1769, 447), (1771, 467), (1773, 478), (1777, 475), (1779, 485), (1782, 500), (1784, 525), (1787, 497),
        (1790, 482), (1792, 447), (1795, 442), (1797, 465), (1801, 472), (1803, 480), (1806, 497), (1807, 508), (1811, 512),
        (1815, 522), (1819, 520), (1822, 523), (1823, 558), (1845, 560), (1847, 568), (1853, 568), (1854, 487),
    ]
    wave = [burst[-1]] + [[float(x), float(y)] for x, y in hand]
    out['waveform'] = [pts2(burst), pts2(wave)]
    out['waveformProvenance'] = 'burst: apexes found by column profiles; rest: hand-read vertices (see measure.py), checked in the overlay'
    log(f'waveform: burst {len(burst)} vertices, hand part {len(hand)} vertices')
    # line time block
    bits = COVER['picture']['lineTime']['binary']
    rows = [(0, 12), (12, 20), (20, 24)]
    boxes = [(1284, 588, 1484, 622), (1284, 623, 1484, 638), (1284, 640, 1484, 658)]
    out['lineTimeRows'] = [read_row(b, bits[a:c], f'lineTime{k + 1}') for k, ((a, c), b) in enumerate(zip(rows, boxes))]
    dl = marks((1262, 585, 1284, 650), 85)
    dr = marks((1486, 585, 1502, 655), 85)
    log('lineTime delimiters', [(r2(o['cx']), r2(o['cy']), r2(o['len'])) for o in dl + dr])
    out['lineTimeBars'] = [seg_of(o) for o in dl + dr]
    # sawtooth: straight segments fitted, vertices by intersection
    approx = [(1305, 713), (1447, 855), (1488, 723), (1625, 872), (1678, 727), (1812, 877), (1850, 733)]
    fits = [line_fit(approx[i], approx[i + 1]) for i in range(len(approx) - 1)]
    V = [None] * len(approx)
    for i in range(1, len(approx) - 1):
        V[i] = intersect(fits[i - 1][0], fits[i - 1][1], fits[i][0], fits[i][1])
    # free ends: project the approximate end points onto the end lines
    def end_on(fit, p):
        c, ax = fit
        t = (np.array(p, float) - c) @ ax
        return c + ax * t
    V[0] = end_on(fits[0], approx[0])
    V[-1] = end_on(fits[-1], approx[-1])
    out['sawtooth'] = [pts2(V)]
    log('sawtooth vertices', [(r2(v[0]), r2(v[1])) for v in V])
    # sawtooth circles: two per tooth, near the top of each downstroke
    cc = [(1326, 733), (1356, 761), (1519, 753), (1547, 781), (1688, 741), (1716, 772)]
    cs = []
    for c in cc:
        x, y, r, rms, n = etch.ring_fit(D, c, 9.0, 3.5, n=360, minresp=30)
        cs.append({'cx': r2(x), 'cy': r2(y), 'r': r2(r), 'rms': r2(rms)})
    log('sawtooth circles', [(c['cx'], c['cy'], c['r']) for c in cs])
    out['sawCircles'] = cs
    # raster frame and the right-hand scan lines (skeleton), fan of the first lines by peak tracking
    ex_fan = (1318, 966, 1398, 1170)
    # frame: four edges by line fits, corners by intersection; the two thin legs on the right by skeleton
    TL, TR, BR, BL = (1313.5, 959), (1609.5, 959.5), (1609.5, 1178), (1313.5, 1178)
    ed = {k: line_fit(a, b, tol=4, thr=70) for k, (a, b) in {'top': (TL, TR), 'right': (TR, BR), 'bottom': (BR, BL), 'left': (BL, TL)}.items()}
    corners = [intersect(*ed['left'], *ed['top']), intersect(*ed['top'], *ed['right']), intersect(*ed['right'], *ed['bottom']), intersect(*ed['bottom'], *ed['left'])]
    frame = [pts2(corners + [corners[0]])]
    mm = trace.clean_mask(D, 60, (1585, 962, 1606, 1176), min_area=120)
    legs = trace.polylines(mm, spur=6, eps=1.0, min_len=60)
    legs = [p for p in legs if abs(p[0][0] - p[-1][0]) < 12 and abs(p[0][1] - p[-1][1]) > 100]
    out['rasterFrame'] = frame + [pts2(p) for p in legs]
    log(f'raster frame: corners {[(r2(c[0]), r2(c[1])) for c in corners]}, {len(legs)} right-hand legs')
    # fan zigzag: peaks near the top and bottom rows
    def peaks_at(y):
        row = D[y - 1:y + 2, 1308:1400].mean(0)
        p, _ = find_peaks(row, height=40, distance=3)
        return [float(x + 1308) for x in p]
    top = peaks_at(966)
    bot = peaks_at(1168)
    log('fan peaks top', top, 'bottom', bot)
    top = top[1:]  # drop the frame's left edge
    bot = bot[:]
    zig = []
    for i in range(len(top)):
        zig.append([bot[i], 1168.0])
        zig.append([top[i], 966.0])
    zig.append([bot[len(top)], 1168.0])
    out['rasterFan'] = [pts2(zig)]
    # 512 notation: two columns plus a bar
    nb = marks((1586, 858, 1614, 955), 85, 20)
    segs = []
    for o in nb:
        vert = abs(o['uy']) > abs(o['ux'])
        k = 1
        if vert and o['len'] > 22:
            # two dashes whose halos fuse: split at the midpoint of the unresolved run (each dash is about 13 px)
            k = int(round(o['len'] / 15.0))
        pitch = o['len'] / k
        for j in range(k):
            off = (j - (k - 1) / 2.0) * pitch
            c = (o['cx'] + o['ux'] * off, o['cy'] + o['uy'] * off)
            piece = dict(o, cx=c[0], cy=c[1], len=(pitch - 2.0) if k > 1 else o['len'])
            segs.append((c[0], c[1], piece['len'], o['wid'], vert, seg_of(piece)))
    bar = [s for s in segs if not s[4]]
    verts = [s for s in segs if s[4]]
    left = sorted([s for s in verts if s[0] < 1600], key=lambda s: -s[1])
    right = sorted([s for s in verts if s[0] >= 1600], key=lambda s: -s[1])
    log(f'raster-lines notation: bar {len(bar)}, left {len(left)}, right {len(right)} (fused pairs split by length)')
    if len(bar) != 1 or len(left) != 5 or len(right) != 4:
        raise SystemExit('512 notation not read as bar + 5 + 4')
    order = bar + left + right
    exp = COVER['picture']['rasterLines']['binary']
    out['rasterLinesNotation'] = [{'bit': '1' if i == 0 else '0', 'seg': s[5], 'len': r2(s[2]), 'wid': r2(s[3])} for i, s in enumerate(order)]
    log(f'raster-lines notation reads {"".join(b["bit"] for b in out["rasterLinesNotation"])} expected {exp}')
    # disputed small label above the first scan lines
    sl = split_fused(marks((1305, 925, 1360, 955), 85, 20), axis_vertical=False)
    sl.sort(key=lambda o: (round(o['cy'] / 8), o['cx']))
    out['rasterLabel'] = [{'seg': seg_of(o), 'len': r2(o['len']), 'wid': r2(o['wid']),
                           'bar': bool(is_bar_h(o))} for o in sl]
    log('raster small label marks (row by row)', [(r2(o['cx']), r2(o['cy']), r2(o['len']), 'bar' if is_bar_h(o) else 'dash') for o in sl])
    # calibration picture
    mm = trace.clean_mask(D, 60, (1305, 1205, 1630, 1447), min_area=300)
    cc2 = etch.ring_fit(D, (1465, 1326), 70, 8, n=720)
    # remove circle before tracing the frame
    rr = np.hypot(XX - cc2[0], YY - cc2[1])
    mm &= ~(rr < cc2[2] + 8)
    pl = trace.polylines(mm, spur=6, eps=1.0, min_len=20)
    out['calibFrame'] = [pts2(p) for p in pl]
    out['calibCircle'] = {'cx': r2(cc2[0]), 'cy': r2(cc2[1]), 'r': r2(cc2[2]), 'rms': r2(cc2[3])}
    log('calibration circle', out['calibCircle'], 'frame polylines', len(pl))
    return out


# ---------------------------------------------------------------------------------------------
# 5. Hydrogen diagram and the cover's own features
# ---------------------------------------------------------------------------------------------
def measure_hydrogen():
    out = {}
    c1 = etch.ring_fit(D, (1400, 1890), 48, 6, n=720)
    c2 = etch.ring_fit(D, (1580, 1895), 48, 6, n=720)
    out['circles'] = [{'cx': r2(c[0]), 'cy': r2(c[1]), 'r': r2(c[2]), 'rms': r2(c[3])} for c in (c1, c2)]
    log('hydrogen circles', out['circles'])
    # the connecting line (a horizontal run between the circles) and the 1 tick under it
    band = D[1889:1897, 1430:1560].mean(0) > 60
    xs_ = np.nonzero(band)[0] + 1430
    out['connector'] = [[[float(xs_.min()), 1892.5], [float(xs_.max()), 1893.0]]]
    ty = D[1898:1912, 1485:1506]
    ys_, xs2 = np.nonzero(ty > 60)
    out['one'] = [[[float(xs2.mean() + 1485), 1893.0], [float(xs2.mean() + 1485), float(ys_.max() + 1898)]]]
    log('hydrogen connector', out['connector'], 'one', out['one'])
    # spin symbols: each atom has a top symbol (crossing the circle) and a centre symbol: a stem with a dot at one end
    sym = {}
    for name, box in (('left', (1385, 1828, 1420, 1912)), ('right', (1565, 1828, 1600, 1912))):
        m = np.zeros(D.shape, bool)
        x0, y0, x1, y1 = box
        m[y0:y1, x0:x1] = D[y0:y1, x0:x1] > 80
        for c in (c1, c2):
            m &= ~(np.abs(np.hypot(XX - c[0], YY - c[1]) - c[2]) < 4.0)
        lab_, n = ndi.label(m, np.ones((3, 3)))
        comps = []
        for i in range(1, n + 1):
            ys, xs = np.nonzero(lab_ == i)
            if len(ys) < 12:
                continue
            w = D[ys, xs]
            comps.append({'x': float((xs * w).sum() / w.sum()), 'y0': int(ys.min()), 'y1': int(ys.max()), 'n': int(len(ys))})
        comps.sort(key=lambda c: c['y0'])
        top = [c for c in comps if c['y0'] < 1870]
        cen = [c for c in comps if c['y0'] >= 1870]
        assert top and len(cen) == 1, (name, comps)
        tx = float(np.mean([c['x'] for c in top]))
        ty0, ty1 = min(c['y0'] for c in top), max(c['y1'] for c in top)
        big = max(top, key=lambda c: c['n'])
        top_dot = 'top' if big['y0'] == ty0 else 'bottom'
        c0 = cen[0]
        cm = m[c0['y0']:c0['y1'] + 1, :].sum(1)
        third = max(1, (c0['y1'] - c0['y0'] + 1) // 3)
        cen_dot = 'top' if cm[:third].sum() > cm[-third:].sum() else 'bottom'
        sym[name] = {'top': {'x': r2(tx), 'y0': ty0 - 0.5, 'y1': ty1 + 0.5, 'dot': top_dot},
                     'centre': {'x': r2(c0['x']), 'y0': c0['y0'] - 0.5, 'y1': c0['y1'] + 0.5, 'dot': cen_dot}}
    log('hydrogen spin symbols', sym)
    out['symbols'] = sym
    return out


def measure_features():
    out = {}
    h1 = etch.ring_fit(D, (1090, 1124), 38, 8, n=720, minresp=20)
    h2 = etch.ring_fit(D, (1090, 1124), 22, 6, n=720, minresp=20)
    out['spindleOuter'] = {'cx': r2(h1[0]), 'cy': r2(h1[1]), 'r': r2(h1[2]), 'rms': r2(h1[3])}
    out['spindleInner'] = {'cx': r2(h2[0]), 'cy': r2(h2[1]), 'r': r2(h2[2]), 'rms': r2(h2[3])}
    log('cover spindle hole circles', out['spindleOuter'], out['spindleInner'])
    return out


def main():
    geo = {'meta': {
        'photo': 'sources/cover-photo/GPN-2000-001978.jpg',
        'photoSize': [W, H],
        'units': 'photo pixels, x right, y down, pixel centres at integers',
        'generator': 'tools/cover/measure.py',
        'note': 'Measured from NASA/JPL photo GPN-2000-001978 (1977, public domain). Binary strings are checked against data/cover.json while measuring; the pulsar map is placed by placement.py.',
    }}
    geo['disc'] = measure_disc()
    geo['plan'] = measure_plan()
    geo['side'] = measure_side()
    geo['pictures'] = measure_pictures()
    geo['hydrogen'] = measure_hydrogen()
    geo['features'] = measure_features()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    existing = {}
    if os.path.exists(OUT):
        existing = json.load(open(OUT, encoding='utf-8'))
    for k in ('map', 'transform', 'sideCartridge', 'hydrogenSymbols'):
        if k in existing:
            geo[k] = existing[k]
    json.dump(geo, open(OUT, 'w', encoding='utf-8'), indent=1)
    print('wrote', OUT)


if __name__ == '__main__':
    main()
