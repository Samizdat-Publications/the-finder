"""Place the Pioneer-derived pulsar map on the Voyager cover photo.

Run: python -P tools/cover/placement.py   (after measure.py; adds "map" to assets-src/cover/geometry.json)

The map's internal geometry (angles, lengths, breaks, ticks, digits) comes from data/cover.json and the
Pioneer vector (tools/data/svgmap.py). Only the placement is measured here: a similarity transform
(scale, rotation, translation, no reflection) from Pioneer SVG units to photo pixels, found by maximising
the etch response sampled along the model's solid lines (every line's solid part and the centre line).
Then each line's measured end in the photo is compared with the transformed model (the research found
2 to 6 percent differences between the Voyager and Pioneer artwork, cover.md 1f).
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'data'))
import numpy as np
from scipy import ndimage as ndi
from scipy.optimize import minimize

import etch
import svgmap

ROOT = etch.ROOT
GEO = os.path.join(ROOT, 'assets-src', 'cover', 'geometry.json')
SVG = os.path.join(ROOT, 'sources', 'pioneer-svg', 'Pioneer_plaque.svg')


def model_segments(m):
    """Solid line segments in SVG units: [(x0, y0, x1, y1), ...] from the extracted map."""
    o = m['origin']
    segs = []

    def pt(az, r):
        a = math.radians(az)
        return (o[0] + r * math.cos(a), o[1] - r * math.sin(a))
    gc = m['gc']
    # the Pioneer centre line runs behind the figures in pieces; the Voyager one is unbroken (cover.md 1f)
    p, q = pt(gc['azimuthDeg'], 0.0), pt(gc['azimuthDeg'], gc['lengthSvg'])
    segs.append((*p, *q))
    for ln in m['lines']:
        r0, r1 = 0.0, ln['rEnd']
        if ln['break']:
            parts = [(0.0, ln['break'][0]), (ln['break'][1], ln['rEnd'])]
        else:
            parts = [(0.0, ln['rEnd'])]
        for a, b in parts:
            p, q = pt(ln['axisDeg'], a), pt(ln['axisDeg'], b)
            segs.append((*p, *q))
    return segs


def apply(T, x, y, o):
    s, ph, tx, ty = T
    c, sn = math.cos(ph), math.sin(ph)
    dx, dy = x - o[0], y - o[1]
    return (tx + s * (c * dx - sn * dy), ty + s * (sn * dx + c * dy))


def main():
    m = svgmap.extract_map(SVG)
    o = m['origin']
    segs = model_segments(m)
    D = etch.etch_norm()
    Db = ndi.gaussian_filter(np.clip(D, 0, 200), 1.5)

    samples = []
    for (x0, y0, x1, y1) in segs:
        L = math.hypot(x1 - x0, y1 - y0)
        n = max(2, int(L / 4))
        for t in np.linspace(0, 1, n):
            samples.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
    S = np.array(samples)

    def score(T):
        s, ph, tx, ty = T
        c, sn = math.cos(ph), math.sin(ph)
        dx, dy = S[:, 0] - o[0], S[:, 1] - o[1]
        X = tx + s * (c * dx - sn * dy)
        Y = ty + s * (sn * dx + c * dy)
        v = ndi.map_coordinates(Db, [Y, X], order=1, mode='nearest')
        return -v.mean()
    # two-point start: the origin and the end tick of the centre line, both measured in the photo
    # (centre-line end tick at x 1612.5, y 1646.0: row/column profiles of the etch, 12 px tall)
    end_px = (1612.5, 1646.0)
    o_px = (683.0, 1636.8)
    gc_len = m['gc']['lengthSvg']
    s0 = math.hypot(end_px[0] - o_px[0], end_px[1] - o_px[1]) / gc_len
    ph0 = math.atan2(end_px[1] - o_px[1], end_px[0] - o_px[0]) - (-math.radians(m['gc']['azimuthDeg']))
    T0 = np.array([s0, ph0, o_px[0], o_px[1]])

    # Placement is exactly the two measured points (origin, centre-line end), because the centre-line length is the
    # unit of every map distance (cover.md 1d). Letting the line-overlap objective choose the scale instead shrinks
    # the map by the 2 to 6 percent by which the short lines differ between Voyager and Pioneer (cover.md 1f), so it
    # is only reported, for the origin refinement below (translation only, within 3 px).
    def sc_t(t):
        return score((T0[0], T0[1], t[0], t[1]))
    r = minimize(sc_t, [T0[2], T0[3]], method='Nelder-Mead', options={'xatol': 1e-4, 'fatol': 1e-6})
    tx_, ty_ = r.x
    if math.hypot(tx_ - T0[2], ty_ - T0[3]) > 3.0:
        tx_, ty_ = T0[2], T0[3]
    # keep the centre-line end exactly on its measured tick: re-derive scale and rotation from the refined origin
    s1 = math.hypot(end_px[0] - tx_, end_px[1] - ty_) / gc_len
    ph1 = math.atan2(end_px[1] - ty_, end_px[0] - tx_) + math.radians(m['gc']['azimuthDeg'])
    best = type('R', (), {'x': np.array([s1, ph1, tx_, ty_]), 'fun': score((s1, ph1, tx_, ty_))})()
    s, ph, tx, ty = best.x
    print(f'map placement: scale {s:.5f} px/unit, rotation {math.degrees(ph):.3f} deg, origin ({tx:.2f}, {ty:.2f}), mean etch along model {-best.fun:.1f}')
    # per-line check: measured outer end of each solid line along its axis, against the model
    T = best.x
    checks = []
    for ln in m['lines']:
        a = math.radians(ln['axisDeg'])
        px = [apply(T, o[0] + r * math.cos(a), o[1] - r * math.sin(a), o) for r in (0.0, ln['rEnd'])]
        # walk outward along the model line in photo space; the measured end = last point with etch above 60
        d = np.array(px[1]) - np.array(px[0])
        L = np.hypot(*d)
        u = d / L
        ts = np.arange(0, L * 1.35, 0.5)
        v = ndi.map_coordinates(Db, [px[0][1] + u[1] * ts, px[0][0] + u[0] * ts], order=1, mode='nearest')
        checks.append({'axisDeg': round(ln['axisDeg'], 3), 'modelEndPx': [round(px[1][0], 2), round(px[1][1], 2)], 'modelLenPx': round(float(L), 2)})
    geo = json.load(open(GEO, encoding='utf-8'))
    geo['map'] = {
        'transform': {'svgOrigin': [round(o[0], 4), round(o[1], 4)], 'scalePxPerUnit': round(float(s), 6),
                      'rotationRad': round(float(ph), 6), 'originPx': [round(float(tx), 3), round(float(ty), 3)]},
        'method': 'similarity fitted by maximising the blurred etch response along the Pioneer-derived solid lines (tools/cover/placement.py)',
        'meanEtch': round(float(-best.fun), 2),
        'lineChecks': checks,
    }
    json.dump(geo, open(GEO, 'w', encoding='utf-8'), indent=1)
    print('wrote map placement')


if __name__ == '__main__':
    main()
