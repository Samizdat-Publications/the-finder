"""Build printable relief plates (STL) of the Voyager record cover from public/media/cover/cover.svg.

Run (from the project folder):
    tools\\print\\.venv\\Scripts\\python.exe -P tools\\print\\build_plate.py

Setup (once):
    uv venv --python 3.12 tools/print/.venv
    uv pip install --python tools/print/.venv/Scripts/python.exe shapely manifold3d trimesh numpy mapbox-earcut pillow scipy

Inputs : public/media/cover/cover.svg (millimetres, 304.8 square, every element a stroked path or circle).
Outputs: print/voyager-cover-{200mm,250mm,full-305mm}.stl, previews, print/build-report.json.

Geometry (all sizes in print millimetres):
  base disc 3.0 mm thick, raised rim ring 1.2 mm wide, relief 0.8 mm above the base top.
  every stroke becomes its outline polygon at stroke-width * scale, floored at 0.6 mm
  (butt caps, round joins); dots are discs of at least 0.8 mm diameter.
  The outer edge circle (cover.edge) is skipped as relief: it becomes the rim.
Orientation as the SVG (viewed from +Z), centred on the origin, base at Z=0.
"""
import json
import math
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import manifold3d as m3d
import numpy as np
import trimesh
from shapely.geometry import LineString, Point, Polygon, MultiPolygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
SVG = ROOT / "public" / "media" / "cover" / "cover.svg"
OUT = ROOT / "print"

SVG_SIZE = 304.8
CENTRE = SVG_SIZE / 2.0
BASE_T = 3.0
RIM_W = 1.2
RELIEF_H = 0.8
MIN_LINE = 0.6
MIN_DOT_D = 0.8
SIMPLIFY = 0.01  # mm, on the finished polygons
SIZES = [("200mm", 200.0), ("250mm", 250.0), ("full-305mm", 304.8)]

NUM = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")
TOKEN = re.compile(r"([MLZ])|(" + NUM.pattern + ")")


def parse_path(d):
    """Absolute M, L, Z only (asserted). Returns list of (points, closed)."""
    subs, cur, closed = [], [], False
    nums = []
    cmd = None
    pos = 0
    d = d.strip()
    for m in re.finditer(r"([A-Za-z])|(" + NUM.pattern + ")", d):
        if m.group(1):
            c = m.group(1)
            if c not in "MLZ":
                raise ValueError("unsupported path command " + c)
            if c == "Z":
                if cur:
                    subs.append((cur, True))
                cur = []
                cmd = None
            else:
                cmd = c
                nums = []
                if c == "M" and cur:
                    subs.append((cur, False))
                    cur = []
        else:
            nums.append(float(m.group(2)))
            if len(nums) == 2:
                cur.append((nums[0], nums[1]))
                nums = []
    if cur:
        subs.append((cur, False))
    return subs


def collect(svg_path):
    """Yield dicts: kind in {line, ring, dot}, geometry in svg mm, width (svg mm)."""
    tree = ET.parse(svg_path)
    root = tree.getroot()
    items, skipped, counts = [], [], {}

    def local(tag):
        return tag.split("}")[-1]

    def walk(el):
        tag = local(el.tag)
        counts[tag] = counts.get(tag, 0) + 1
        if el.get("transform"):
            raise ValueError("transform present, not handled: " + el.get("transform"))
        if tag == "path":
            sw = float(el.get("stroke-width"))
            for pts, closed in parse_path(el.get("d")):
                items.append(dict(kind="line", pts=pts, closed=closed, w=sw,
                                  id=el.get("data-id") or "", cls=el.get("class") or ""))
        elif tag == "circle":
            cls = el.get("class") or ""
            cx, cy, r = float(el.get("cx")), float(el.get("cy")), float(el.get("r"))
            if el.get("data-id") == "cover.edge":
                skipped.append("cover.edge (circle, becomes the rim)")
            elif "dot" in cls.split():
                items.append(dict(kind="dot", c=(cx, cy), r=r, cls=cls))
            else:
                items.append(dict(kind="ring", c=(cx, cy), r=r, w=float(el.get("stroke-width")), cls=cls))
        elif tag in ("g", "svg", "title", "desc", "style"):
            pass
        else:
            raise ValueError("unhandled element " + tag)
        for ch in el:
            walk(ch)

    walk(root)
    return items, skipped, counts


def to_plate(x, y, s):
    return ((x - CENTRE) * s, -(y - CENTRE) * s)


def build_polygons(items, s):
    """Return (relief_union, stats) in plate millimetres (not including the rim)."""
    parts = []
    stats = dict(min_line_w=1e9, floored_lines=0, lines=0, rings=0, dots=0, floored_dots=0)
    for it in items:
        if it["kind"] == "line":
            pts = [to_plate(x, y, s) for x, y in it["pts"]]
            w = it["w"] * s
            stats["lines"] += 1
            if w < MIN_LINE:
                w = MIN_LINE
                stats["floored_lines"] += 1
            stats["min_line_w"] = min(stats["min_line_w"], w)
            if it["closed"] and pts[0] != pts[-1]:
                pts = pts + [pts[0]]
            if len(pts) == 1:
                geom = Point(pts[0]).buffer(w / 2, 16)
            else:
                geom = LineString(pts).buffer(w / 2, quad_segs=8, cap_style="flat", join_style="round")
            parts.append(geom)
        elif it["kind"] == "ring":
            cx, cy = to_plate(*it["c"], s)
            r = it["r"] * s
            w = max(it["w"] * s, MIN_LINE)
            stats["rings"] += 1
            stats["min_line_w"] = min(stats["min_line_w"], w)
            outer = Point(cx, cy).buffer(r + w / 2, 64)
            inner = Point(cx, cy).buffer(max(r - w / 2, 0.0), 64)
            parts.append(outer.difference(inner))
        elif it["kind"] == "dot":
            cx, cy = to_plate(*it["c"], s)
            d = it["r"] * s * 2
            stats["dots"] += 1
            if d < MIN_DOT_D:
                d = MIN_DOT_D
                stats["floored_dots"] += 1
            parts.append(Point(cx, cy).buffer(d / 2, 32))
    u = unary_union(parts)
    return u, stats


def polys_of(g):
    if g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    if isinstance(g, MultiPolygon):
        return list(g.geoms)
    return [p for sub in g.geoms for p in polys_of(sub)]


def extrude(geom, z0, z1):
    """manifold3d solid from a shapely (multi)polygon, between z0 and z1."""
    contours = []
    for p in polys_of(geom):
        ext = np.asarray(p.exterior.coords)[:-1]
        if not p.exterior.is_ccw:
            ext = ext[::-1]
        contours.append(ext)
        for h in p.interiors:
            hc = np.asarray(h.coords)[:-1]
            if h.is_ccw:
                hc = hc[::-1]
            contours.append(hc)
    cs = m3d.CrossSection(contours, m3d.FillRule.EvenOdd)
    solid = m3d.Manifold.extrude(cs, z1 - z0)
    return solid.translate((0.0, 0.0, z0))


def mesh_stats(mesh):
    return dict(
        triangles=int(len(mesh.faces)),
        vertices=int(len(mesh.vertices)),
        watertight=bool(mesh.is_watertight),
        is_volume=bool(mesh.is_volume),
        winding_consistent=bool(mesh.is_winding_consistent),
        volume_mm3=float(mesh.volume),
        bounds_mm=[[round(float(v), 4) for v in row] for row in mesh.bounds],
    )


def build(label, diameter):
    s = diameter / SVG_SIZE
    R = diameter / 2.0
    items, skipped, counts = collect(SVG)
    relief, stats = build_polygons(items, s)
    disc = Point(0, 0).buffer(R, 360)
    rim = disc.difference(Point(0, 0).buffer(R - RIM_W, 360))
    relief_all = unary_union([relief.intersection(disc), rim]).simplify(SIMPLIFY)
    relief_all = unary_union(polys_of(relief_all))

    base = extrude(disc, 0.0, BASE_T)
    top = extrude(relief_all, BASE_T, BASE_T + RELIEF_H)
    solid = base + top  # boolean union, no internal faces
    mm = solid.to_mesh()
    mesh = trimesh.Trimesh(vertices=np.asarray(mm.vert_properties)[:, :3], faces=np.asarray(mm.tri_verts), process=True)
    mesh.merge_vertices()
    mesh.update_faces(mesh.nondegenerate_faces())
    mesh.remove_unreferenced_vertices()

    OUT.mkdir(exist_ok=True)
    stl = OUT / f"voyager-cover-{label}.stl"
    mesh.export(stl, file_type="stl")  # binary

    # round trip: reload, slice mid-relief, compare area with the 2D polygon
    back = trimesh.load(stl)
    sec = back.section(plane_origin=[0, 0, BASE_T + RELIEF_H / 2], plane_normal=[0, 0, 1])
    p2d, _ = sec.to_2D()
    area_slice = sum(p.area for p in p2d.polygons_full)
    area_poly = relief_all.area
    # reported minimum feature sizes
    rep = dict(
        file=str(stl.relative_to(ROOT)).replace("\\", "/"),
        size_bytes=stl.stat().st_size,
        diameter_mm=diameter,
        scale=round(s, 6),
        relief_polygons=len(polys_of(relief_all)),
        min_line_width_mm=round(stats["min_line_w"], 4),
        lines=stats["lines"], lines_floored_to_0_6=stats["floored_lines"],
        rings=stats["rings"], dots=stats["dots"], dots_floored_to_0_8=stats["floored_dots"],
        roundtrip_area_slice_mm2=round(area_slice, 3),
        roundtrip_area_polygon_mm2=round(area_poly, 3),
        roundtrip_area_ratio=round(area_slice / area_poly, 5),
        skipped=skipped,
        **mesh_stats(back),
    )
    return rep, relief_all, R


def preview(poly, R, label, px_per_mm):
    """Raking-light top view shaded from a height map of the relief polygons."""
    from PIL import Image, ImageDraw
    from scipy.ndimage import gaussian_filter

    n = int(round(2 * R * px_per_mm))
    cx = n / 2.0

    def pix(x, y):
        return (cx + x * px_per_mm, cx - y * px_per_mm)

    img = np.zeros((n, n), dtype=np.uint8)
    for p in polys_of(poly):
        # draw each polygon (with its holes) on its own layer, then take the max,
        # so a hole of one polygon (the rim) never erases another polygon
        layer = Image.new("L", (n, n), 0)
        dr = ImageDraw.Draw(layer)
        dr.polygon([pix(x, y) for x, y in p.exterior.coords], fill=255)
        for hole in p.interiors:
            dr.polygon([pix(x, y) for x, y in hole.coords], fill=0)
        img = np.maximum(img, np.asarray(layer))
    h = img.astype(np.float32) / 255.0 * RELIEF_H
    h = gaussian_filter(h, 0.6)
    gy, gx = np.gradient(h, 1.0 / px_per_mm)
    # light from top-left, low angle
    lx, ly, lz = -0.7, 0.7, 0.35
    nrm = np.sqrt(gx ** 2 + gy ** 2 + 1.0)
    # surface normal (-dh/dx, -dh/dy, 1); image y points down so flip gy
    shade = (-gx * lx + gy * ly + lz) / nrm / math.sqrt(lx * lx + ly * ly + lz * lz)
    shade = np.clip(shade, 0, 1)
    flat = (lz / math.sqrt(lx * lx + ly * ly + lz * lz))
    base_col = np.array([0.80, 0.62, 0.22])  # gold-ish
    k = np.clip(shade / flat, 0, 1.6)[..., None]
    rgb = np.clip(base_col * k * 0.9 + 0.04, 0, 1)
    yy, xx = np.mgrid[0:n, 0:n]
    outside = (xx - cx) ** 2 + (yy - cx) ** 2 > (R * px_per_mm) ** 2
    rgb[outside] = 0.08
    out = OUT / f"voyager-cover-{label}-preview.png"
    Image.fromarray((rgb * 255).astype(np.uint8)).save(out, optimize=True)
    return out


def main():
    reports = {}
    for label, d in SIZES:
        rep, poly, R = build(label, d)
        ppm = {"200mm": 12, "250mm": 10, "full-305mm": 8}[label]
        pv = preview(poly, R, label, ppm)
        rep["preview"] = str(pv.relative_to(ROOT)).replace("\\", "/")
        reports[label] = rep
        print(json.dumps(rep, indent=1))
    items, skipped, counts = collect(SVG)
    reports["_svg_elements"] = counts
    (OUT / "build-report.json").write_text(json.dumps(reports, indent=1))


if __name__ == "__main__":
    sys.exit(main())
