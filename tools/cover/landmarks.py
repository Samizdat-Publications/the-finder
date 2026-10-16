"""Independent alignment check of cover.svg against the photo.

Run: node tools/cover/overlay.mjs; python -P tools/cover/landmarks.py

For each landmark the weighted centroid of the etch response in a small window of the PHOTO is compared with
the centroid of the SVG's ink in the same window of the rendered SVG (build/cover/render.png). Both are found
by the same centroid rule in the same window, so the numbers are a measurement of how far the drawn feature
sits from the etched one, not a re-read of the coordinates the SVG was built from. Also reports, for the pulsar
map, each line's direction in the photo against the model (the map's internal geometry is Pioneer's).
Writes build/cover/landmarks.json.
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

import etch

ROOT = etch.ROOT
GEO = json.load(open(os.path.join(ROOT, 'assets-src', 'cover', 'geometry.json'), encoding='utf-8'))
D = etch.etch_norm()
R = 255.0 - np.asarray(Image.open(os.path.join(ROOT, 'build', 'cover', 'render.png')).convert('L')).astype(float)
R = ndi.gaussian_filter(R, 1.2)  # the photo is blurred by the lens and the lighting; blur the render alike


def centroid(img, cx, cy, hw, hh, thr):
    x0, x1 = int(cx - hw), int(cx + hw)
    y0, y1 = int(cy - hh), int(cy + hh)
    w = np.clip(img[y0:y1, x0:x1] - thr, 0, None)
    if w.sum() <= 0:
        return None
    ys, xs = np.mgrid[y0:y1, x0:x1]
    return float((xs * w).sum() / w.sum()), float((ys * w).sum() / w.sum())


P = GEO['pictures']
LM = [
    ('plan label circle', 577.0, 678.7, 58, 58),
    ('plan spindle circle', 577.1, 678.4, 16, 16),
    ('cover spindle hole', 1092, 1126, 46, 46),
    ('side view left bar', 579.1, 1187, 10, 40),
    ('side view right bar', 838.9, 1192, 10, 40),
    ('line-time left bar', 1273.6, 613.6, 10, 28),
    ('line-time right bar', 1492.4, 614.3, 10, 32),
    ('calibration circle', 1464.6, 1319.9, 80, 80),
    ('calibration frame corner TL', 1319, 1219, 12, 12),
    ('calibration frame corner BR', 1611, 1432, 12, 12),
    ('raster frame corner TL', 1314, 958, 8, 8),
    ('raster frame corner BR', 1609, 1176, 10, 10),
    ('hydrogen circle left', 1403.5, 1890.3, 56, 56),
    ('hydrogen circle right', 1581.9, 1893.8, 56, 56),
    ('sawtooth valley 1', 1448.3, 857.3, 16, 12),
    ('sawtooth valley 3', 1811.7, 877.3, 16, 12),
    ('sawtooth peak 2', 1674.3, 726.5, 16, 12),
    ('waveform burst first apex', 1062, 452, 10, 10),
    ('map origin (Sun)', 683.2, 1636.7, 10, 10),
    ('map centre-line end tick', 1612.5, 1646.0, 10, 12),
    ('plan cartridge cap', 820.5, 564.5, 22, 12),
    ('rim mark next to cartridge', None, None, 14, 14),
]
rows = []
rim = GEO['plan']['rimMarks'][0]['seg']
for name, cx, cy, hw, hh in LM:
    if cx is None:
        cx = (rim[0][0] + rim[1][0]) / 2
        cy = (rim[0][1] + rim[1][1]) / 2
    a = centroid(D, cx, cy, hw, hh, 45.0)
    b = centroid(R, cx, cy, hw, hh, 40.0)
    if a is None or b is None:
        rows.append({'name': name, 'ok': False})
        continue
    dx, dy = b[0] - a[0], b[1] - a[1]
    rows.append({'name': name, 'photo': [round(a[0], 2), round(a[1], 2)], 'svg': [round(b[0], 2), round(b[1], 2)],
                 'dxPx': round(dx, 2), 'dyPx': round(dy, 2), 'errPx': round(math.hypot(dx, dy), 2)})
good = [r for r in rows if 'errPx' in r]
rms = math.sqrt(sum(r['errPx'] ** 2 for r in good) / len(good))
k = 304.8 / (2 * GEO['disc']['r'])
for r in good:
    print(f"{r['name']:34s} err {r['errPx']:5.2f} px ({r['errPx'] * k:.3f} mm)  d=({r['dxPx']:+.2f},{r['dyPx']:+.2f})")
print(f'landmarks {len(good)}, RMS misalignment {rms:.2f} px = {rms * k:.3f} mm (disc radius {GEO["disc"]["r"]} px)')

# pulsar map: direction of each line in the photo against the model
import build_cover as bc
pm = bc.COVER['pulsarMap']
to_px, scale = bc.placement()
o = bc.COVER['meta']['svgUnits']['origin']
R0 = pm['gcLine']['lengthSvg']
lines_out = []
for ln in pm['lines']:
    az = math.radians(ln['svgAzimuthDeg'])
    rend = ln['rOverR0'] * R0
    if rend * scale < 40:
        continue
    p0 = np.array(to_px(o[0], o[1]))
    p1 = np.array(to_px(o[0] + rend * math.cos(az), o[1] - rend * math.sin(az)))
    L = np.hypot(*(p1 - p0))
    u = (p1 - p0) / L
    nrm = np.array([-u[1], u[0]])
    ts = np.arange(0.25 * L, 0.95 * L, 0.5)
    pts, wts = [], []
    for t in ts:
        base = p0 + u * t
        offs = np.arange(-5, 5.1, 0.5)
        xs = base[0] + nrm[0] * offs
        ys = base[1] + nrm[1] * offs
        v = ndi.map_coordinates(D, [ys, xs], order=1)
        if v.max() > 60:
            c = (v * offs).sum() / v.sum() if v.sum() > 0 else 0
            pts.append(base + nrm * c)
            wts.append(v.max())
    if len(pts) < 20:
        continue
    Q = np.array(pts)
    c = Q.mean(0)
    u_, s_, vt = np.linalg.svd(Q - c)
    ax = vt[0] if vt[0] @ u > 0 else -vt[0]
    dang = math.degrees(math.atan2(ax[0] * u[1] - ax[1] * u[0], ax @ u))
    lines_out.append({'order': ln['order'], 'bname': ln['bname'], 'angleDevDeg': round(dang, 2), 'pixelsUsed': len(pts), 'modelLenPx': round(float(L), 1)})
    print(f"map line {ln['order']:2d} {ln['bname']:9s} photo-minus-model direction {dang:+.2f} deg ({len(pts)} ridge samples)")
devs = [abs(l['angleDevDeg']) for l in lines_out]
print(f'map lines measured: {len(devs)}, mean |dev| {np.mean(devs):.2f} deg, max {max(devs):.2f} deg')
json.dump({'landmarks': rows, 'rmsPx': round(rms, 3), 'rmsMm': round(rms * k, 4), 'mapLines': lines_out},
          open(os.path.join(ROOT, 'build', 'cover', 'landmarks.json'), 'w'), indent=1)
