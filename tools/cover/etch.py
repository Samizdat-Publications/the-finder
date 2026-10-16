"""Etch-line mask of the 1977 cover photo (white top-hat), shared by the measuring scripts.

Input: sources/cover-photo/GPN-2000-001978.jpg. Output arrays only; nothing is written here.
"""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PHOTO = os.path.join(ROOT, 'sources', 'cover-photo', 'GPN-2000-001978.jpg')


def load_gray():
    im = np.asarray(Image.open(PHOTO).convert('RGB')).astype(np.float32)
    return 0.6 * im[..., 0] + 0.4 * im[..., 1]


def etch_response(g=None, sigma_bg=5.0, sigma_s=0.8):
    """Bright thin features minus local background, normalised by local level."""
    if g is None:
        g = load_gray()
    s = ndi.gaussian_filter(g, sigma_s)
    bg = ndi.grey_opening(ndi.gaussian_filter(g, 1.0), size=(9, 9))
    bg = ndi.gaussian_filter(bg, sigma_bg)
    d = s - bg
    return d


def sample(img, xs, ys):
    return ndi.map_coordinates(img, [ys, xs], order=1, mode='nearest')


def ring_fit(d, c0, r0, hw, n=720, skip=None, minresp=25.0):
    """Circle fit to the ridge of response d near radius r0 (half-width hw px) around c0.

    For each angle the sub-pixel ridge radius is the response-weighted centroid of the profile peak.
    skip(angle_deg) -> True drops an angle (cartridge, marks). Returns (cx, cy, r, rms, count).
    """
    pts = []
    rs = np.arange(r0 - hw, r0 + hw + 0.01, 0.5)
    for a in np.linspace(0, 2 * np.pi, n, endpoint=False):
        if skip is not None and skip(np.degrees(a)):
            continue
        xs = c0[0] + rs * np.cos(a)
        ys = c0[1] + rs * np.sin(a)
        v = sample(d, xs, ys)
        i = int(np.argmax(v))
        if v[i] < minresp or i < 2 or i > len(rs) - 3:
            continue
        w = np.clip(v[i - 2:i + 3] - 0.5 * v[i], 0, None)
        rr = (rs[i - 2:i + 3] * w).sum() / w.sum()
        pts.append((c0[0] + rr * np.cos(a), c0[1] + rr * np.sin(a)))
    P = np.array(pts)
    A = np.c_[2 * P[:, 0], 2 * P[:, 1], np.ones(len(P))]
    b = (P ** 2).sum(1)
    for _ in range(4):
        c = np.linalg.lstsq(A, b, rcond=None)[0]
        r = float(np.sqrt(c[2] + c[0] ** 2 + c[1] ** 2))
        res = np.hypot(P[:, 0] - c[0], P[:, 1] - c[1]) - r
        k = np.abs(res) < max(2.5 * res.std(), 0.8)
        P, A, b = P[k], A[k], b[k]
    return float(c[0]), float(c[1]), r, float(res[k].std()), int(len(P))


def etch_norm(g=None):
    """etch_response divided by the local brightness of the brass (so dim areas threshold like bright ones)."""
    if g is None:
        g = load_gray()
    d = etch_response(g)
    lvl = ndi.gaussian_filter(ndi.grey_opening(ndi.gaussian_filter(g, 1.0), size=(9, 9)), 25)
    # local etch brightness reference: a high percentile of d over 60 px windows
    ref = ndi.maximum_filter(ndi.gaussian_filter(np.clip(d, 0, None), 3), size=61)
    ref = ndi.gaussian_filter(ref, 20)
    return d / (np.maximum(ref, 40.0)) * 100.0
