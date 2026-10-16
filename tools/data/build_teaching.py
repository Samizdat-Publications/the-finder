"""Build data/teaching.json: where each symbol, number and table cell the player reads sits on the decoded
teaching frames (L002, L003, L004, L005, L039), and what each holds.

Run: python -P tools/data/build_teaching.py   (needs build/ref/frames/, from tools/ref-decoder/decode_all.py)

The regions are MEASURED on our own reference decode, by ink: each entry names a coarse search window (a
cell of the frame's visible layout: a row of the counting table, a cell of the planets table), and the
region is the tight box round the dark connected components whose centres fall inside that window. The
values are the readings of docs/research/teaching-frames.md (cited per entry), never read by this script:
the script only finds where they are and checks that ink is there. Two things are measured as checks of
those readings: the number of dots in each of L002's dot rows (one to six), and the number of characters in
each digit cell (one, and two for "10").

Standard library only (a small PNG reader for the 8-bit greyscale frames the reference decoder writes).
"""
import os
import struct
import sys
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import ROOT, write_json  # noqa: E402

FRAMES = os.path.join(ROOT, 'build', 'ref', 'frames')
RESEARCH = 'docs/research/teaching-frames.md'

# A pixel is ink when it is darker than this fraction of its window's median grey (the card). The card reads
# 200 on L002 and 240 on L004 (each frame has its own level stretch); strokes read 12 to 110 and the faint
# ring of Mercury's circle 134 to 170 (on a 240 card): 0.72 of the card takes them all and leaves the
# decode's faint vertical streaks (about 0.85 of the card) out.
INK_FRAC = 0.72
# Components smaller than this (pixels) are tape noise, not strokes or dots (a dot of L002 is 4 to 9 pixels).
MIN_PX = 3
# Pixels added round a measured box, so a crop shows the whole stroke and a little card.
PAD = 2


def read_png(path):
    """8-bit greyscale, non-interlaced PNG to (width, height, rows of ints)."""
    with open(path, 'rb') as f:
        b = f.read()
    if b[:8] != b'\x89PNG\r\n\x1a\n':
        raise SystemExit(f'{path}: not a PNG')
    i, idat, w, h = 8, b'', 0, 0
    while i < len(b):
        n = struct.unpack('>I', b[i:i + 4])[0]
        t = b[i + 4:i + 8]
        body = b[i + 8:i + 8 + n]
        if t == b'IHDR':
            w, h, depth, ctype, _c, _f, inter = struct.unpack('>IIBBBBB', body)
            if depth != 8 or ctype != 0 or inter != 0:
                raise SystemExit(f'{path}: expected 8-bit greyscale, non-interlaced')
        elif t == b'IDAT':
            idat += body
        i += 12 + n
    raw = zlib.decompress(idat)
    rows, prev = [], [0] * w
    for y in range(h):
        ft = raw[y * (w + 1)]
        line = list(raw[y * (w + 1) + 1:(y + 1) * (w + 1)])
        for x in range(w):
            a = line[x - 1] if x else 0
            c = prev[x - 1] if x else 0
            up = prev[x]
            if ft == 1:
                line[x] = (line[x] + a) & 255
            elif ft == 2:
                line[x] = (line[x] + up) & 255
            elif ft == 3:
                line[x] = (line[x] + (a + up) // 2) & 255
            elif ft == 4:
                p = a + up - c
                pa, pb, pc = abs(p - a), abs(p - up), abs(p - c)
                pr = a if pa <= pb and pa <= pc else (up if pb <= pc else c)
                line[x] = (line[x] + pr) & 255
        rows.append(line)
        prev = line
    return w, h, rows


def components(img, win):
    """8-connected ink components inside a window (x0, y0, x1, y1, exclusive ends): lists of (x, y)."""
    _w, _h, rows = img
    x0, y0, x1, y1 = win
    vals = sorted(rows[y][x] for y in range(y0, y1) for x in range(x0, x1))
    ink = INK_FRAC * vals[len(vals) // 2]
    seen = set()
    out = []
    for y in range(y0, y1):
        for x in range(x0, x1):
            if (x, y) in seen or rows[y][x] >= ink:
                continue
            stack, comp = [(x, y)], []
            seen.add((x, y))
            while stack:
                cx, cy = stack.pop()
                comp.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if x0 <= nx < x1 and y0 <= ny < y1 and (nx, ny) not in seen and rows[ny][nx] < ink:
                            seen.add((nx, ny))
                            stack.append((nx, ny))
            if len(comp) >= MIN_PX:
                out.append(comp)
    return out


def box(pts):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return [min(xs), min(ys), max(xs) + 1, max(ys) + 1]


def region(img, win):
    """The padded box round all ink in the window, and its ink pixel count. Fails if the window is empty."""
    comps = components(img, win)
    if not comps:
        raise SystemExit(f'no ink in window {win}')
    pts = [p for c in comps for p in c]
    b = box(pts)
    w, h, _ = img
    return [max(0, b[0] - PAD), max(0, b[1] - PAD), min(w, b[2] + PAD), min(h, b[3] + PAD)], len(pts)


def characters(img, win):
    """Ink components merged into characters by overlapping columns, left to right: (box, pixels)."""
    comps = sorted((box(c), len(c)) for c in components(img, win))
    chars = []
    for b, n in comps:
        if chars and b[0] <= chars[-1][0][2]:
            cb, cn = chars[-1]
            chars[-1] = ([min(cb[0], b[0]), min(cb[1], b[1]), max(cb[2], b[2]), max(cb[3], b[3])], cn + n)
        else:
            chars.append((b, n))
    return chars


def entry(img, win, value, cite, **extra):
    reg, ink = region(img, win)
    return {'region': reg, 'ink': ink, 'value': value, 'cite': cite, **extra}


# ---- L002, Mathematical definitions ------------------------------------------------------------------
# Row centres of the counting table (one to ten), measured once on the decode by eye and refined by ink below;
# each row window is 24 px tall (the rows are 31 to 32 px apart).
L002_ROWS = [32, 64, 96, 127, 159, 191, 224, 255, 284, 312]
L002_DOTS_X = (25, 104)     # the dots, left of the first '='
L002_BIN_X = (113, 160)     # the cover's binary, between the two '=' signs (rows 1 to 6)
L002_BIN_X_LONG = (96, 160)  # rows 7 to 10 have no dots and no first '=': their binary starts further left
L002_DIGIT_X = (176, 206)   # '= d': the digit after the second '='
CITE_L002 = f'{RESEARCH} "L002, Mathematical definitions"'


def build_l002(img):
    digits, dots, binary = [], [], []
    for n, cy in enumerate(L002_ROWS, start=1):
        y0, y1 = cy - 12, cy + 12
        if n <= 6:
            comps = components(img, (L002_DOTS_X[0], y0, L002_DOTS_X[1], y1))
            # a dot is a small blob: at most 8 px across either way (the dots measure 3 to 7)
            blobs = [c for c in comps if (box(c)[2] - box(c)[0]) <= 8 and (box(c)[3] - box(c)[1]) <= 8]
            if len(blobs) != n:
                raise SystemExit(f'L002 row {n}: {len(blobs)} dots measured, the research reads {n}')
            reg, ink = region(img, (L002_DOTS_X[0], y0, L002_DOTS_X[1], y1))
            dots.append({'row': n, 'count': len(blobs), 'region': reg, 'ink': ink, 'cite': CITE_L002})
        bx = L002_BIN_X if n <= 6 else L002_BIN_X_LONG
        binary.append(entry(img, (bx[0], y0, bx[1], y1), format(n, 'b'), CITE_L002, row=n))
        chars = characters(img, (L002_DIGIT_X[0], y0, L002_DIGIT_X[1], y1))
        tall = max(b[3] - b[1] for b, _ in chars)
        # the '=' sign is two short bars: lower than 60% of the digits' height
        glyphs = [(b, k) for b, k in chars if (b[3] - b[1]) >= 0.6 * tall]
        want = len(str(n))
        if len(glyphs) != want:
            raise SystemExit(f'L002 row {n}: {len(glyphs)} digit characters measured, "{n}" has {want}')
        if n <= 9:
            digits.append(dict(glyph=n - 1, value=n, row=n, **pad(img, glyphs[0])))
        else:
            # "10": its second character is the senders' zero (the only digit with no row of its own)
            digits.append(dict(glyph=9, value=0, row=n, **pad(img, glyphs[1])))
    for d in digits:
        d['cite'] = CITE_L002
    sums = [
        entry(img, (236, 152, 324, 184), '2 + 3 = 5', CITE_L002, terms=[2, 3], total=5, op='+'),
        entry(img, (236, 184, 330, 214), '8 + 17 = 25', CITE_L002, terms=[8, 17], total=25, op='+'),
        entry(img, (352, 252, 485, 284), '13 x 28 = 364', CITE_L002, terms=[13, 28], total=364, op='x'),
    ]
    larger = [
        entry(img, (354, 20, 392, 48), '12', CITE_L002, number=12),
        entry(img, (354, 52, 392, 80), '24', CITE_L002, number=24),
        entry(img, (354, 84, 402, 112), '100', CITE_L002, number=100),
        entry(img, (354, 116, 420, 144), '1000', CITE_L002, number=1000),
    ]
    return {'digits': digits, 'dots': dots, 'binary': binary, 'sums': sums, 'larger': larger}


def pad(img, glyph):
    b, k = glyph
    w, h, _ = img
    return {'region': [max(0, b[0] - PAD), max(0, b[1] - PAD), min(w, b[2] + PAD), min(h, b[3] + PAD)], 'ink': k}


# ---- L003, Physical unit definitions -----------------------------------------------------------------
CITE_L003 = f'{RESEARCH} "L003, Physical unit definitions"'
# Each line: its window and the definition as read. A quantity is [whole, numerator, denominator, power of ten]
# of a unit equal to one of another unit.
L003_LINES = [
    ('atom', (70, 20, 270, 98), '1 M, 1 t', None),
    ('wave', (312, 12, 450, 122), '1 L', None),
    ('second', (82, 132, 254, 176), '1 42/100 x 10^9 t = 1 s', {'of': 't', 'is': 's', 'whole': 1, 'num': 42, 'den': 100, 'power': 9}),
    ('day', (100, 180, 254, 210), '86400 s = 1 d', {'of': 's', 'is': 'd', 'whole': 86400, 'num': 0, 'den': 1, 'power': 0}),
    ('year', (124, 212, 254, 236), '365 d = 1 y', {'of': 'd', 'is': 'y', 'whole': 365, 'num': 0, 'den': 1, 'power': 0}),
    ('gram', (88, 244, 254, 280), '6 x 10^23 M = 1 g', {'of': 'M', 'is': 'g', 'whole': 6, 'num': 0, 'den': 1, 'power': 23}),
    ('kilogram', (116, 280, 262, 304), '1000 g = 1 kg', {'of': 'g', 'is': 'kg', 'whole': 1000, 'num': 0, 'den': 1, 'power': 0}),
    ('earth', (88, 300, 258, 340), '6 x 10^27 g = 1 e', {'of': 'g', 'is': 'e', 'whole': 6, 'num': 0, 'den': 1, 'power': 27}),
    ('centimetre', (310, 136, 434, 176), '1/21 L = 1 cm', {'of': 'L', 'is': 'cm', 'whole': 0, 'num': 1, 'den': 21, 'power': 0}),
    ('angstrom', (316, 178, 474, 208), '1 L = 21 x 10^8 A', {'of': 'A', 'is': 'L', 'whole': 21, 'num': 0, 'den': 1, 'power': 8, 'inverse': True}),
    ('metre', (300, 216, 434, 248), '10^2 cm = 1 m', {'of': 'cm', 'is': 'm', 'whole': 1, 'num': 0, 'den': 1, 'power': 2}),
    ('kilometre', (300, 249, 456, 278), '1000 m = 1 km', {'of': 'm', 'is': 'km', 'whole': 1000, 'num': 0, 'den': 1, 'power': 0}),
]


def build_l003(img):
    out = []
    for key, win, text, q in L003_LINES:
        e = entry(img, win, text, CITE_L003, id=key)
        if q:
            e['definition'] = q
        out.append(e)
    return {'lines': out}


# ---- L004 and L005, Solar System parameters ----------------------------------------------------------
CITE_TABLE = f'{RESEARCH} "L004 and L005, Solar System parameters" (the table)'
# A cell value: [whole, numerator, denominator, power of ten, written power]: whole + num/den, times 10^power.
# 'explicit' is true where the senders wrote the power of ten or the unit; bare distance cells take the
# x 10^6 of the first distance in their frame (research: "Distances after the first column of each frame omit
# the x 10^6"); bare diameters are in km as written.
TABLE = {
    'L004': {
        'rows': {'circle': (10, 108), 'diameter': (120, 152), 'distance': (175, 207), 'mass': (236, 284), 'day': (300, 348)},
        'cols': [(14, 142), (158, 276), (284, 356), (372, 448), (452, 524)],
        'cells': [
            {'diameter': (139, 0, 1, 4, True), 'distance': None, 'mass': (333000, 0, 1, 0, True), 'day': (25, 0, 1, 0, True)},
            {'diameter': (4840, 0, 1, 0, True), 'distance': (58, 0, 1, 6, True), 'mass': (0, 1, 19, 0, True), 'day': (57, 0, 1, 0, True)},
            {'diameter': (12400, 0, 1, 0, False), 'distance': (108, 0, 1, 6, False), 'mass': (0, 82, 100, 0, False), 'day': (243, 0, 1, 0, False)},
            {'diameter': (12760, 0, 1, 0, False), 'distance': (150, 0, 1, 6, False), 'mass': (1, 0, 1, 0, False), 'day': (1, 0, 1, 0, False)},
            {'diameter': (6800, 0, 1, 0, False), 'distance': (228, 0, 1, 6, False), 'mass': (0, 11, 100, 0, False), 'day': (1, 3, 100, 0, False)},
        ],
    },
    'L005': {
        'rows': {'circle': (10, 70), 'diameter': (104, 136), 'distance': (162, 192), 'mass': (216, 268), 'day': (284, 334)},
        'cols': [(8, 142), (152, 252), (276, 358), (362, 444), (448, 524)],
        'cells': [
            {'diameter': (142, 0, 1, 3, True), 'distance': (778, 0, 1, 6, True), 'mass': (318, 0, 1, 0, True), 'day': (0, 41, 100, 0, True)},
            {'diameter': (121, 0, 1, 3, True), 'distance': (1428, 0, 1, 6, False), 'mass': (95, 0, 1, 0, False), 'day': (0, 43, 100, 0, False)},
            {'diameter': (47600, 0, 1, 0, False), 'distance': (2872, 0, 1, 6, False), 'mass': (14, 6, 10, 0, False), 'day': (0, 45, 100, 0, False)},
            {'diameter': (44600, 0, 1, 0, False), 'distance': (4498, 0, 1, 6, False), 'mass': (17, 2, 10, 0, False), 'day': (0, 65, 100, 0, False)},
            {'diameter': (14000, 0, 1, 0, False), 'distance': (591, 0, 1, 6, False), 'mass': (0, 9, 10, 0, False), 'day': (0, 7, 10, 0, False)},
        ],
    },
}
UNIT = {'diameter': 'km', 'distance': 'km', 'mass': 'e', 'day': 'd'}


def text_of(v):
    whole, num, den, power, explicit = v
    s = '' if (whole == 0 and num) else str(whole)
    if num:
        s = f'{s} {num}/{den}'.strip()
    if power and explicit:
        s += f' x 10^{power}'
    return s


def build_table(imgs):
    columns = []
    for frame in ('L004', 'L005'):
        t = TABLE[frame]
        img = imgs[frame]
        for ci, (cx0, cx1) in enumerate(t['cols']):
            ry0, ry1 = t['rows']['circle']
            col = {'frame': frame, 'index': len(columns), 'circle': region(img, (cx0, ry0, cx1, ry1))[0], 'cells': {}}
            for row in ('diameter', 'distance', 'mass', 'day'):
                v = t['cells'][ci][row]
                if v is None:
                    continue
                y0, y1 = t['rows'][row]
                whole, num, den, power, explicit = v
                reg, ink = region(img, (cx0, y0, cx1, y1))
                col['cells'][row] = {'region': reg, 'ink': ink, 'text': text_of(v), 'whole': whole, 'num': num, 'den': den,
                                     'power': power, 'written': explicit, 'unit': UNIT[row], 'cite': CITE_TABLE}
            columns.append(col)
    return {'columns': columns}


# ---- L039, Diagram of male and female ----------------------------------------------------------------
CITE_L039 = f'{RESEARCH} "L039, Diagram of male and female"'


def build_l039(img):
    # In the native frame the figures lie along the lines (Barry's code 1 turns them upright); each scale bar
    # runs between two end ticks, its number written beside it.
    heights = [
        entry(img, (200, 8, 284, 40), 155, CITE_L039, figure='upper', unit='cm', text='155 cm',
              ticks=[region(img, (50, 8, 66, 42))[0], region(img, (496, 2, 514, 30))[0]]),
        entry(img, (222, 322, 304, 352), 160, CITE_L039, figure='lower', unit='cm', text='160 cm',
              ticks=[region(img, (50, 318, 68, 352))[0], region(img, (500, 306, 516, 340))[0]]),
    ]
    return {'heights': heights}


def main():
    imgs = {}
    for f in ('L002', 'L003', 'L004', 'L005', 'L039'):
        path = os.path.join(FRAMES, f'{f}.png')
        if not os.path.exists(path):
            raise SystemExit(f'missing {path}: run python -P tools/ref-decoder/decode_all.py first')
        imgs[f] = read_png(path)
        if imgs[f][0] != 536 or imgs[f][1] != 355:
            raise SystemExit(f'{f}: expected the 536 x 355 decode (D-A30), got {imgs[f][0]} x {imgs[f][1]}')
    out = {
        'meta': {
            'about': 'Where each symbol, number and table cell of the teaching frames sits on the decoded frame, and what it holds. '
                     'Regions are measured by ink on the reference decode; values are the research readings.',
            'decode': 'build/ref/frames/<frame>.png, 536 x 355 (tools/ref-decoder, D-A30)',
            'regionUnit': 'pixels of the 536 x 355 decode: [x0, y0, x1, y1], ends exclusive, x along the lines (time), y down the rows',
            'ink': f'grey < {INK_FRAC} x the window median; components of {MIN_PX} px or more; boxes padded by {PAD} px',
            'research': RESEARCH,
            'script': 'tools/data/build_teaching.py',
            'cellValue': 'whole + num / den, times 10^power; "written" false: the senders left the power of ten (distances) or the unit implied',
        },
        'L002': build_l002(imgs['L002']),
        'L003': build_l003(imgs['L003']),
        'table': build_table(imgs),
        'L039': build_l039(imgs['L039']),
    }
    path, size = write_json('teaching.json', out)
    d = out['L002']
    print(f'wrote {path} ({size} bytes): {len(d["digits"])} digits, dots per row {[x["count"] for x in d["dots"]]}, '
          f'{len(out["L003"]["lines"])} unit lines, {len(out["table"]["columns"])} table columns, {len(out["L039"]["heights"])} heights')


if __name__ == '__main__':
    main()
