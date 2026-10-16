"""Independent geometry check: our decoded frames against clean published images. Entry script.

Run after decode_all.py:  python -P tools/ref-decoder/geometry_check.py
Writes build/ref/geometry_check.json and build/ref/geometry_check/<frame>.png (overlays).

The clean images are NASA's "Images on the Golden Record" gallery GIFs (docs/research/images-and-audio.md
section 5), fetched by tools/fetch-sources.mjs into sources/nasa-gr-*/ (checksummed in tools/sources.json).
They are used only here, in a test. Our decode is turned upright with Barry's orientation table, then an
affine transform from the clean image to our frame is fitted:

1. Start: ORB features on both images, matched, and an affine transform fitted with RANSAC (seeded, so
   the run is deterministic).
2. Refine: the six affine parameters are adjusted to maximise the normalised cross-correlation of the
   two images (both lightly blurred) over the clean image's content, by a derivative-free optimiser.

The fitted map, expressed in our native frame axes (columns = lines, rows = time down the line), is
reduced to its metric (which no rotation or uniform scale changes): x/y scale = the true length of one
column step over one row step (1 = our aspect agrees with the clean image), shear = the cosine of the
true angle between our column and row directions (0 = square grid). The clean images may be cropped,
rotated or uniformly scaled; only the ratio and shear matter. Caveat: the clean files are 640 x 480 scans of unknown history; the gallery's own calibration
circle is fitted as well, to show whether its pixels are square.
"""
from __future__ import annotations

import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
from PIL import Image
from scipy import ndimage, optimize
from skimage.feature import ORB, match_descriptors
from skimage.measure import ransac
from skimage.transform import AffineTransform

import aspect
import barry
import tape as tapemod

ROOT = tapemod.project_root()
REF = os.path.join(ROOT, "build", "ref")
OUTDIR = os.path.join(REF, "geometry_check")
# image number on the record -> (frame id, sources/ folder). Picked for clear geometry (lead's brief):
# the calibration circle, the definition diagrams, DNA, anatomy, family, continental drift, Earth.
PAIRS = [(1, "L000", "nasa-gr-001"), (3, "L002", "nasa-gr-003"), (4, "L003", "nasa-gr-004"),
         (5, "L004", "nasa-gr-005"), (14, "L019", "nasa-gr-014"), (15, "L020", "nasa-gr-015"),
         (32, "L039", "nasa-gr-032"), (37, "L050", "nasa-gr-037"), (39, "L052", "nasa-gr-039"),
         (40, "L053", "nasa-gr-040")]
# Fewer ORB matches or RANSAC inliers than this: start from the fitted ring instead. A chosen setting.
MIN_MATCHES = 8
# Blur (pixels, Gaussian sigma) applied to both images before the correlation. A chosen setting: removes
# the decode's line-to-line streaks and the GIF dithering without blurring away the line art.
BLUR = 1.2
# The clean images sit on a black canvas with a credit line; content = pixels in the bounding box of
# the brightest region (card) shrunk by this margin (pixels). Chosen here.
CONTENT_MARGIN = 6
# Bright regions smaller than this fraction of the image are not card (credit text). A chosen setting.
CARD_MIN_FRAC = 0.01
# Seed for RANSAC (deterministic run).
SEED = 20261015


def load_clean(path):
    g = np.asarray(Image.open(path).convert("L"), float) / 255.0
    card = ndimage.binary_opening(g > 0.5, iterations=3)
    lab, n = ndimage.label(card)
    if n == 0:
        raise ValueError("no card in " + path)
    sizes = ndimage.sum(card, lab, range(1, n + 1))
    # the card may be split into several bright regions by its own line art (the circle's inside and
    # outside): take every region larger than CARD_MIN_FRAC of the image (the credit line is far smaller)
    keep = [i + 1 for i, sz in enumerate(sizes) if sz >= CARD_MIN_FRAC * g.size]
    ys, xs = np.nonzero(np.isin(lab, keep))
    box = (ys.min() + CONTENT_MARGIN, ys.max() - CONTENT_MARGIN, xs.min() + CONTENT_MARGIN, xs.max() - CONTENT_MARGIN)
    return g, box


def norm(a):
    a = a - a.mean()
    return a / (np.sqrt(np.mean(a * a)) + 1e-12)


def ncc_cost(params, ours_b, clean_b, ys, xs):
    """Affine maps clean (x, y) to ours: [x', y'] = M [x, y] + t. Negative NCC over the sample grid."""
    a, b, c, d, tx, ty = params
    X = a * xs + b * ys + tx
    Y = c * xs + d * ys + ty
    inside = (X >= 0) & (X <= ours_b.shape[1] - 1) & (Y >= 0) & (Y <= ours_b.shape[0] - 1)
    if inside.mean() < 0.5:
        return 1.0
    v = ndimage.map_coordinates(ours_b, [Y[inside], X[inside]], order=1)
    w = clean_b[ys[inside].astype(int), xs[inside].astype(int)]
    return -float(np.mean(norm(v) * norm(w)))


def register(ours, clean, box):
    """Fit clean -> ours affine. Returns (2x3 matrix, ncc, n_inliers)."""
    ob = ndimage.gaussian_filter(ours, BLUR)
    cb = ndimage.gaussian_filter(clean, BLUR)
    y0, y1, x0, x1 = box
    crop = cb[y0:y1, x0:x1]
    feats = []
    for img in (ob, crop):
        orb = ORB(n_keypoints=800, fast_threshold=0.05)
        orb.detect_and_extract(img)
        feats.append((orb.keypoints, orb.descriptors))
    m = match_descriptors(feats[1][1], feats[0][1], cross_check=True, max_ratio=0.85)
    start = "orb_ransac"
    ninl = 0
    model = None
    if len(m) >= MIN_MATCHES:
        src = feats[1][0][m[:, 0]][:, ::-1] + [x0, y0]  # clean (x, y)
        dst = feats[0][0][m[:, 1]][:, ::-1]  # ours (x, y)
        model, inl = ransac((src, dst), AffineTransform, min_samples=3, residual_threshold=3.0,
                            max_trials=5000, rng=SEED)
        if model is not None:
            ninl = int(np.sum(inl))
    if model is None or ninl < MIN_MATCHES:
        # Featureless line art (the calibration circle): start from the fitted ring instead (centre and
        # mean radius: translation and an isotropic scale; no rotation, no shear).
        start = "ring_fit"
        M = moment_start(ob, cb, box)
    else:
        M = model.params
    yy, xx = np.mgrid[y0:y1:2, x0:x1:2]
    ys, xs = yy.ravel().astype(float), xx.ravel().astype(float)
    p0 = [M[0, 0], M[0, 1], M[1, 0], M[1, 1], M[0, 2], M[1, 2]]
    res = optimize.minimize(ncc_cost, p0, args=(ob, cb, ys, xs), method="Powell",
                            options={"xtol": 1e-6, "ftol": 1e-7, "maxiter": 20000})
    a, b, c, d, tx, ty = res.x
    return np.array([[a, b, tx], [c, d, ty]]), -float(res.fun), ninl, -ncc_cost(p0, ob, cb, ys, xs), start


def moment_start(ob, cb, box):
    """Clean -> ours affine (3x3) for a ring figure (the calibration circle): centres and mean radii of
    ellipses fitted to the ring in each image (aspect.py). Isotropic scale, no rotation, no shear, so
    the start carries none of the geometry being measured."""
    y0, y1, x0, x1 = box
    fo = aspect.fit_ellipse(aspect.ring_points(ob * 255.0))
    fc = aspect.fit_ellipse(aspect.ring_points(cb[y0:y1, x0:x1] * 255.0))
    k = (fo["a"] + fo["b"]) / (fc["a"] + fc["b"])
    ccx, ccy = fc["xc"] + x0, fc["yc"] + y0
    return np.array([[k, 0.0, fo["xc"] - k * ccx], [0.0, k, fo["yc"] - k * ccy], [0.0, 0.0, 1.0]])


def upright_linear(k: int):
    """Linear map from native (x, y) to upright (x, y) for numpy.rot90(img, k) (image coordinates, y down)."""
    # rot90 k=1 (anticlockwise): native (x, y) -> (y, W-1-x); k=-1 (clockwise): -> (H-1-y, x)
    return {0: np.eye(2), 1: np.array([[0, 1], [-1, 0]]), -1: np.array([[0, -1], [1, 0]])}[k]


def metric_geometry(A: np.ndarray):
    """A maps our native (x, y) to a true (undistorted) frame, up to rotation and scale. From the metric
    A^T A (rotation-free): x/y scale = length of one column step over one row step; shear = cosine of
    the true angle between our column and row directions (0 = square grid)."""
    Mt = A.T @ A
    return {"x_over_y_scale": float(np.sqrt(Mt[0, 0] / Mt[1, 1])),
            "shear": float(Mt[0, 1] / np.sqrt(Mt[0, 0] * Mt[1, 1]))}


def circle_map(fit: dict) -> np.ndarray:
    """Symmetric linear map taking a circle to the fitted ellipse (unit determinant)."""
    th = np.radians(fit["theta_deg"])
    R = np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]])
    S = R @ np.diag([fit["a"], fit["b"]]) @ R.T
    return S / np.sqrt(np.linalg.det(S))


def main():
    os.makedirs(OUTDIR, exist_ok=True)
    B = barry.load()
    out = []
    for num, fid, src in PAIRS:
        files = glob.glob(os.path.join(ROOT, "sources", src, "*"))
        if not files:
            out.append({"image": num, "frame": fid, "error": f"sources/{src} missing (run tools/fetch-sources.mjs)"})
            continue
        clean, box = load_clean(files[0])
        native = np.asarray(Image.open(os.path.join(REF, "frames", fid + ".png")), float) / 255.0
        ch = 0 if fid[0] == "L" else 1
        k = barry.ORIENT_ROT90_K[B["orientation"][ch][int(fid[1:])]]
        up = np.rot90(native, k)
        try:
            M, ncc, ninl, ncc0, start = register(up, clean, box)
        except ValueError as err:
            out.append({"image": num, "frame": fid, "error": str(err)})
            continue
        Q = upright_linear(k)  # native -> upright
        L_native = np.linalg.inv(Q) @ M[:, :2]  # clean -> native
        rec = {"image": num, "frame": fid, "barry_rot90_k": k, "start": start, "ncc": ncc, "ncc_start": ncc0,
               "ransac_inliers": ninl, "clean_to_native": L_native.tolist()}
        out.append(rec)
        # overlay: clean warped into our upright frame (red) over our decode (grey)
        Minv = np.linalg.inv(np.vstack([M, [0, 0, 1]]))
        yy, xx = np.mgrid[0:up.shape[0], 0:up.shape[1]]
        X = Minv[0, 0] * xx + Minv[0, 1] * yy + Minv[0, 2]
        Y = Minv[1, 0] * xx + Minv[1, 1] * yy + Minv[1, 2]
        warped = ndimage.map_coordinates(clean, [Y, X], order=1, cval=1.0)
        rgb = np.stack([np.minimum(up, warped), up, up], -1)
        rgb = np.where((warped < 0.5)[..., None], [1.0, 0.1, 0.1], rgb)
        Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUTDIR, fid + ".png"))
        print(f"registered image {num:3d} {fid}: "
              f"NCC {ncc0:.3f} -> {ncc:.3f}, {ninl} inliers", flush=True)
    # the clean calibration circle itself: are the gallery's pixels square?
    cc, _box = load_clean(glob.glob(os.path.join(ROOT, "sources", "nasa-gr-001", "*"))[0])
    clean_circle = aspect.fit_ellipse(aspect.ring_points(cc * 255.0))
    S_clean = circle_map(clean_circle)
    # our own calibration circle (final decode), the same way
    ours_circle = aspect.fit_ellipse(aspect.ring_points(np.asarray(Image.open(os.path.join(REF, "frames", "L000.png")), float)))
    ours_from_circle = metric_geometry(np.linalg.inv(circle_map(ours_circle)))
    for r in out:
        if "error" in r:
            continue
        L = np.array(r["clean_to_native"])
        raw = metric_geometry(np.linalg.inv(L))
        corr = metric_geometry(np.linalg.inv(S_clean) @ np.linalg.inv(L))
        r["x_over_y_scale"] = raw["x_over_y_scale"]
        r["shear"] = raw["shear"]
        r["x_over_y_scale_gallery_circle_removed"] = corr["x_over_y_scale"]
        r["shear_gallery_circle_removed"] = corr["shear"]
        print(f"image {r['image']:3d} {r['frame']} (rot90 k={r['barry_rot90_k']:+d}): x/y {raw['x_over_y_scale']:.4f} "
              f"shear {raw['shear']:+.4f} (NCC {r['ncc']:.3f}); gallery circle removed: x/y "
              f"{corr['x_over_y_scale']:.4f} shear {corr['shear']:+.4f}")
    good = [r for r in out if "error" not in r and r["ncc"] >= MIN_NCC and r["frame"] != "L000"]
    circle_reg = next((r for r in out if r["frame"] == "L000"), None)
    xs_ = np.array([r["x_over_y_scale"] for r in good])
    sh_ = np.array([r["shear"] for r in good])
    # our circle against the gallery's circle (both fitted the same way): the circle's own geometry
    circ_vs = metric_geometry(S_clean @ np.linalg.inv(circle_map(ours_circle)))

    def stats(v):
        return {"median": float(np.median(v)), "mean": float(np.mean(v)), "std": float(np.std(v, ddof=1)),
                "sem": float(np.std(v, ddof=1) / np.sqrt(len(v))), "min": float(v.min()), "max": float(v.max())}

    summary = {
        "pairs": out,
        "used": [r["frame"] for r in good],
        "min_ncc": MIN_NCC,
        "x_over_y_scale": stats(xs_),
        "shear": stats(sh_),
        "circle_vs_gallery_circle": circ_vs,
        "circle_registration": circle_reg,
        "our_circle": {"minor_over_major": ours_circle["axes_ratio_minor_major"], "tilt_deg": ours_circle["theta_deg"],
                       "hx_over_hy": ours_circle["axis_ratio"], "geometry_if_artwork_round": ours_from_circle},
        "gallery_circle": {"hx_over_hy": clean_circle["axis_ratio"], "minor_over_major": clean_circle["axes_ratio_minor_major"],
                           "tilt_deg": clean_circle["theta_deg"]},
        "definitions": "x_over_y_scale: true length of one step along our columns (one line) over one step "
                       "down our rows, from the metric of the fitted map; 1 = our aspect agrees with the clean "
                       "image. shear: cosine of the true angle between our column and row directions (0 = square). "
                       "Values take the gallery GIF as true; '_gallery_circle_removed' first undoes the gallery "
                       "calibration circle's own ellipticity (assuming the artwork circle is round).",
        "method": "ORB + RANSAC (seeded) start, then Powell maximisation of NCC over the clean content",
    }
    with open(os.path.join(REF, "geometry_check.json"), "w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=1)
    print(f"{len(good)} images: x/y median {np.median(xs_):.4f} (mean {xs_.mean():.4f}, std {xs_.std(ddof=1):.4f}); "
          f"shear median {np.median(sh_):+.4f} (mean {sh_.mean():+.4f}, std {sh_.std(ddof=1):.4f})")
    print(f"our circle vs gallery circle: x/y {circ_vs['x_over_y_scale']:.4f}, shear {circ_vs['shear']:+.4f}; "
          f"our circle minor/major {ours_circle['axes_ratio_minor_major']:.4f} at {ours_circle['theta_deg']:.1f} deg; "
          f"gallery circle {clean_circle['axes_ratio_minor_major']:.4f} at {clean_circle['theta_deg']:.1f} deg")


# Registrations with a final NCC below this are not used (a failed match). A chosen setting: the decode's
# streaks keep good matches of line art near 0.42 to 0.55 (overlays checked by eye).
MIN_NCC = 0.4

if __name__ == "__main__":
    main()
