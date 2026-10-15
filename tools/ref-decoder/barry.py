"""Ron Barry's 2017 hand-made tables, read from his C++ source (never retyped).

Source: `sources/barry-frames/voyager.cpp` (foodini/voyager, 2017; images-and-audio.md section 3). It
has no licence, so this module copies no code: it parses the numbers out of three array initialisers
with a small tokenizer (no eval):

- `start_points[2][78]`: sample offsets at 384 kHz where Barry starts reading each frame. Entries are
  sums like `27*audio_sample_rate + 296562 + 3151`; the named constants are read from the same file.
- `color[2][78]`: `red`, `grn`, `blu` or `bnw` (names resolved through the file's `const u8` lines).
- `orientation[2][78]`: 0, 1 or 2.

Orientation meaning, read from the loops that write his still images (the `switch` near the end of
`decode()`): case 0 writes rows of pixels over traces unchanged; case 1 writes one output row per
trace, pixels in reverse order, which is our native frame turned 90 degrees clockwise; case 2 writes
one output row per trace from the last trace back, pixels in order, which is 90 degrees
anticlockwise. As numpy.rot90 turns: {0: 0, 1: -1, 2: +1}.

Barry's table is used ONLY to validate our own frame detection and, for the "upright" contact sheet,
as a clearly labelled reference. It never seeds detection.
"""
from __future__ import annotations

import os
import re

# numpy.rot90 k for each of Barry's orientation codes (derivation in the module docstring).
ORIENT_ROT90_K = {0: 0, 1: -1, 2: 1}


def _strip_comments(src: str) -> str:
    src = re.sub(r"/\*.*?\*/", " ", src, flags=re.S)
    return re.sub(r"//[^\n]*", " ", src)


def _constants(src: str) -> dict:
    """`const <type> name = <int>;` lines."""
    out = {}
    for m in re.finditer(r"const\s+\w+\s+(\w+)\s*=\s*(-?\d+)\s*;", src):
        out[m.group(1)] = int(m.group(2))
    return out


def _eval_expr(expr: str, consts: dict) -> int:
    """Sum of products of integers and named constants: tokens are ints, names, '*', '+', '-'."""
    toks = re.findall(r"\d+|[A-Za-z_]\w*|[*+\-]", expr)
    if "".join(toks) != re.sub(r"\s+", "", expr):
        raise ValueError(f"unexpected characters in {expr!r}")
    total, sign, prod, expect_operand = 0, 1, None, True
    for t in toks:
        if t in ("+", "-"):
            if expect_operand:
                if t == "-":
                    sign = -sign
                continue
            total += sign * prod
            sign, prod, expect_operand = (1 if t == "+" else -1), None, True
        elif t == "*":
            expect_operand = True
        else:
            v = int(t) if t.isdigit() else consts[t]
            prod = v if prod is None else prod * v
            expect_operand = False
    if prod is None:
        raise ValueError(f"dangling operator in {expr!r}")
    return total + sign * prod


def _array_body(src: str, name: str) -> str:
    m = re.search(name + r"\s*\[[^\]]*\]\s*\[[^\]]*\]\s*=\s*\{", src)
    if not m:
        raise ValueError(f"array {name} not found")
    i = m.end()
    depth = 1
    j = i
    while depth:
        c = src[j]
        depth += (c == "{") - (c == "}")
        j += 1
    return src[i:j - 1]


def _rows(body: str):
    return [r for r in re.findall(r"\{([^{}]*)\}", body)]


def _items(row: str):
    return [s.strip() for s in row.split(",") if s.strip()]


def load(path: str | None = None) -> dict:
    if path is None:
        path = os.path.join(os.path.dirname(__file__), "..", "..", "sources", "barry-frames", "voyager.cpp")
    with open(path, encoding="utf-8", errors="replace") as f:
        src = _strip_comments(f.read())
    consts = _constants(src)
    n = consts["num_images_per_channel"]
    starts = [[_eval_expr(e, consts) for e in _items(r)] for r in _rows(_array_body(src, "start_points"))]
    color_names = {v: k for k, v in consts.items() if k in ("red", "grn", "blu", "bnw")}
    colors = [[color_names[consts[e]] for e in _items(r)] for r in _rows(_array_body(src, "color"))]
    orient = [[int(e) for e in _items(r)] for r in _rows(_array_body(src, "orientation"))]
    for tbl, nm in ((starts, "start_points"), (colors, "color"), (orient, "orientation")):
        if len(tbl) != 2 or any(len(r) != n for r in tbl):
            raise ValueError(f"{nm}: expected 2 x {n}, got {[len(r) for r in tbl]}")
    return {"sample_rate": consts["audio_sample_rate"], "n_per_channel": n,
            "start_points": starts, "color": colors, "orientation": orient}


if __name__ == "__main__":
    b = load()
    print(b["sample_rate"], b["start_points"][0][:3], b["start_points"][1][:3])
    print(b["color"][0][:10], b["orientation"][0][:16])
