"""Aspect ratio from the calibration circle (frame L000, image 1).

The circle is a thin dark ring on a light card (after polarity inversion). Edge points are the ring's
centre line, found two ways so every part of the ring is sampled well:
- down each column (one image column = one line): each run of ring pixels gives a point at its
  darkness-weighted centroid (good at the top and bottom of the ring, where it crosses columns
  steeply);
- along each row: the same (good at the left and right sides).
Runs much longer than the typical ring thickness (where the ring runs tangent to the scan) are dropped,
because their centroid sits inside the true curve. Only the largest connected ring-like region is used.
An ellipse is fitted to the points by algebraic least squares (scikit-image EllipseModel), which is
deterministic. The axis ratio is reported as horizontal extent / vertical extent of the fitted ellipse
(1.00 = round); the tilt is reported too.
"""
from __future__ import annotations

import numpy as np
from scipy import ndimage
from skimage.measure import EllipseModel, label

# Size, in pixels, of the median filter that estimates the card background under the ring. Must be
# much wider than the ring (a few pixels) and much smaller than the circle (about 300 px). Chosen here.
BG_SIZE = 31
# A pixel belongs to the ring when it is darker than the background by this fraction of the ring's
# peak darkness (99.9th percentile). Half maximum: chosen here.
RING_FRAC = 0.5
# Runs longer than this multiple of the median run length are tangent runs and are dropped. Chosen here.
RUN_MAX_FACTOR = 3.0


def _runs(mask_1d):
    """(start, end) index pairs of True runs, end exclusive."""
    m = np.concatenate(([False], mask_1d, [False])).astype(np.int8)
    d = np.diff(m)
    return list(zip(np.nonzero(d == 1)[0], np.nonzero(d == -1)[0]))


def ring_points(img: np.ndarray, x_scale: float = 1.0, y_scale: float = 1.0):
    """Ring centre-line points (x, y) in pixel units of img (then scaled). img: 2-D, larger = lighter."""
    f = img.astype(np.float64)
    bg = ndimage.median_filter(f, size=BG_SIZE, mode="nearest")
    dark = np.clip(bg - f, 0, None)
    peak = np.percentile(dark, 99.9)
    mask = dark > RING_FRAC * peak
    lab = label(mask, connectivity=2)
    if lab.max() == 0:
        raise ValueError("no ring found")
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    mask = lab == int(np.argmax(sizes))
    pts, lens = [], []
    for c in range(mask.shape[1]):
        for a, b in _runs(mask[:, c]):
            w = dark[a:b, c]
            pts.append((c, a + np.sum(w * np.arange(b - a)) / np.sum(w), b - a))
    col_pts = pts
    pts = []
    for r in range(mask.shape[0]):
        for a, b in _runs(mask[r, :]):
            w = dark[r, a:b]
            pts.append((a + np.sum(w * np.arange(b - a)) / np.sum(w), r, b - a))
    row_pts = pts
    out = []
    for group in (col_pts, row_pts):
        g = np.array(group, float)
        lim = RUN_MAX_FACTOR * np.median(g[:, 2])
        out.append(g[g[:, 2] <= lim, :2])
    P = np.vstack(out)
    P[:, 0] *= x_scale
    P[:, 1] *= y_scale
    return P


def fit_ellipse(points: np.ndarray) -> dict:
    """Algebraic ellipse fit. Returns centre, semi-axes, angle, horizontal and vertical half-extents,
    the axis ratio (horizontal extent / vertical extent) and the rms radial-ish residual."""
    if hasattr(EllipseModel, "from_estimate"):
        m = EllipseModel.from_estimate(points)
        params = (m.center[0], m.center[1], m.axis_lengths[0], m.axis_lengths[1], m.theta) \
            if hasattr(m, "center") else m.params
    else:
        m = EllipseModel()
        if not m.estimate(points):
            raise ValueError("ellipse fit failed")
        params = m.params
    xc, yc, a, b, th = (float(v) for v in params)
    # half-extents of the ellipse along x and y (independent of how the library labels a, b, theta)
    hx = float(np.sqrt((a * np.cos(th)) ** 2 + (b * np.sin(th)) ** 2))
    hy = float(np.sqrt((a * np.sin(th)) ** 2 + (b * np.cos(th)) ** 2))
    res = m.residuals(points) if hasattr(m, "residuals") else np.zeros(len(points))
    major_tilt = float(np.degrees(th)) % 180.0
    return {"xc": xc, "yc": yc, "a": a, "b": b, "theta_deg": major_tilt, "half_x": hx, "half_y": hy,
            "axis_ratio": hx / hy, "axes_ratio_minor_major": min(a, b) / max(a, b),
            "rms_residual_px": float(np.sqrt(np.mean(np.asarray(res) ** 2))), "n_points": int(len(points))}


def ellipse_outline(fit: dict, n: int = 2000):
    t = np.linspace(0, 2 * np.pi, n)
    th = np.radians(fit["theta_deg"])
    x = fit["xc"] + fit["a"] * np.cos(t) * np.cos(th) - fit["b"] * np.sin(t) * np.sin(th)
    y = fit["yc"] + fit["a"] * np.cos(t) * np.sin(th) + fit["b"] * np.sin(t) * np.cos(th)
    return x, y
