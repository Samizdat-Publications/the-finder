"""Pulsar-map geometry from the raw Pioneer plaque SVG (sources/pioneer-svg/Pioneer_plaque.svg).

The Voyager cover's pulsar map is the Pioneer map (docs/research/cover.md 1f: same pulsars, same
binary periods, same breaks, ticks and B1240-64 digit placement). Mysid's 2006 vector trace of the
Pioneer plaque is the only vector source of that geometry, so the map is rebuilt from it here.

Pipeline (every step is geometry):
1. Parse every <path> into straight strokes (curves are skipped: the map is drawn with straight
   strokes only), applying group translate / matrix transforms.
2. Origin: find_origin(), the least-squares intersection of the long radial strokes.
   The SVG is a checksummed local file; the standard-library XML parser does not fetch external
   entities.
3. Seeds: the 15 strokes that start at the origin (14 pulsar lines plus the galactic-centre line).
4. Each line is walked outward: a stroke joins the line when it lies within LAT_TOL of the line's axis
   and starts within GAP_TOL of the end of what has been collected so far. The axis is re-estimated
   as the median azimuth of the collected stroke midpoints farther than AXIS_RMIN from the origin
   (that is, beyond the breaks), and the walk is repeated until it is stable.
5. Strokes are classed P (parallel to the line: solid line pieces and binary 0 dashes) or X
   (perpendicular: binary 1 bars and the z ticks).
6. Solid line: the stroke from the origin, plus, when the first stroke beyond it is a P stroke that
   starts within BREAK_TOL, that stroke too (the line is "broken"; cover.md 1d).
7. Ticks: X strokes lying on the solid line (cover.md 1d: a tick is told apart from a binary 1 only
   because it lies on the solid segment).
8. Binary: P and X marks beyond the solid line's end, read outward (most significant bit nearest the
   origin). B1240-64 has no marks beyond its line: its digits run alongside its own line (cover.md 1d),
   so a parallel track SIDE_TRACK_LAT away is collected and read instead.

Units: SVG user units (the plaque drawing is 3063 x 2427 units). Angles in degrees, counter-clockwise
with the SVG y axis flipped (SVG y points down), zero along +x, which is the direction of the
galactic-centre line (cover.md 1d: angle counter-clockwise from the centre line = galactic longitude).
"""
import math
import re
import xml.etree.ElementTree as ET

# The research digitization's origin, kept for reference and for checks.py's method test only; the
# data use find_origin() (our least-squares origin). In SVG user units, after the group translate.
# Source: docs/research/data/cover/pioneer_svg_lines.json (the research's per-stroke radii and
# lateral offsets). Fitting the origin to that file's 445 stroke radii reproduces them with RMS 0.03
# units (their 0.1-unit rounding), giving (868.216, 1211.581). The research does not record how it
# chose this point; our own least-squares intersection of the long line strokes lands 0.55 units away
# (reported as originLsq in cover.json). 0.6 units is 0.0003 R0 and moves the short lines' angles by
# up to about 0.06 deg, far inside the 3 deg map-versus-longitude agreement (cover.md section 2), but
# outside a 0.01 deg reproduction tolerance.
RESEARCH_ORIGIN = (868.216, 1211.581)

LAT_TOL = 8.0          # units; widest real offset of a mark from its line axis is 5.5 (B0525+21)
GAP_TOL = 60.0         # units; widest real gap along a line is 53 (B1929+10 line end to first digit)
AXIS_RMIN = 60.0       # units; beyond every break (breaks end by 72 units, cover.md 1d)
BREAK_TOL = 25.0       # units; break gaps are 9.6 to 19.3 units
SEED_RMAX = 4.0        # units; a seed stroke starts this close to the origin
SIDE_TRACK_LAT = (5.0, 25.0)  # units; B1240-64's digit track runs 11 to 19 units beside its line
NEAR_ANGLE_TOL = 6.0   # deg; see _lat_ok (B1929+10 and B0950+08 seeds point 5.8 deg off their digit rows; B1933+16 sits 7.2 deg from B1929+10)
NEAR_R = 100.0         # units; NEAR_ANGLE_TOL applies only to strokes closer than this
DASH = 11.0            # units; the drawn length of one binary 0 dash and one binary 1 bar


def _parse_transform(t):
    """Return a 2x3 affine (a,b,c,d,e,f) for an SVG transform attribute (translate/matrix/scale)."""
    m = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    if not t:
        return m
    for name, args in re.findall(r'(\w+)\s*\(([^)]*)\)', t):
        v = [float(x) for x in re.findall(r'-?\d*\.?\d+(?:[eE][-+]?\d+)?', args)]
        if name == 'translate':
            n = (1.0, 0.0, 0.0, 1.0, v[0], v[1] if len(v) > 1 else 0.0)
        elif name == 'matrix':
            n = tuple(v)
        elif name == 'scale':
            n = (v[0], 0.0, 0.0, v[1] if len(v) > 1 else v[0], 0.0, 0.0)
        else:
            raise ValueError(f'unsupported transform {name}')
        m = _compose(m, n)
    return m


def _compose(m, n):
    a, b, c, d, e, f = m
    a2, b2, c2, d2, e2, f2 = n
    return (a * a2 + c * b2, b * a2 + d * b2, a * c2 + c * d2, b * c2 + d * d2,
            a * e2 + c * f2 + e, b * e2 + d * f2 + f)


def _apply(m, x, y):
    a, b, c, d, e, f = m
    return (a * x + c * y + e, b * x + d * y + f)


def _path_strokes(d):
    """Straight strokes (x0, y0, x1, y1) of an SVG path's d attribute; curves advance the pen only."""
    toks = re.findall(r'[A-Za-z]|-?\d*\.?\d+(?:[eE][-+]?\d+)?', d)
    i = 0
    cmd = None
    x = y = sx = sy = 0.0
    out = []

    def num():
        nonlocal i
        v = float(toks[i])
        i += 1
        return v

    while i < len(toks):
        if re.match('[A-Za-z]', toks[i]):
            cmd = toks[i]
            i += 1
            if cmd in 'zZ':
                out.append((x, y, sx, sy))
                x, y = sx, sy
                continue
        if cmd in 'mM':
            a, b = num(), num()
            x, y = (x + a, y + b) if cmd == 'm' else (a, b)
            sx, sy = x, y
            cmd = 'l' if cmd == 'm' else 'L'
        elif cmd in 'lL':
            a, b = num(), num()
            nx, ny = (x + a, y + b) if cmd == 'l' else (a, b)
            out.append((x, y, nx, ny))
            x, y = nx, ny
        elif cmd in 'hH':
            a = num()
            nx = x + a if cmd == 'h' else a
            out.append((x, y, nx, y))
            x = nx
        elif cmd in 'vV':
            a = num()
            ny = y + a if cmd == 'v' else a
            out.append((x, y, x, ny))
            y = ny
        elif cmd in 'cC':
            v = [num() for _ in range(6)]
            x, y = (x + v[4], y + v[5]) if cmd == 'c' else (v[4], v[5])
        elif cmd in 'sSqQ':
            v = [num() for _ in range(4)]
            x, y = (x + v[2], y + v[3]) if cmd in 'sq' else (v[2], v[3])
        elif cmd in 'aA':
            v = [num() for _ in range(7)]
            x, y = (x + v[5], y + v[6]) if cmd == 'a' else (v[5], v[6])
        else:
            raise ValueError(f'unsupported path command {cmd}')
    return out


def svg_strokes(path):
    """All straight strokes in the drawing, in document order, in absolute SVG user units."""
    tree = ET.parse(path)
    strokes = []

    def walk(el, m):
        m2 = _compose(m, _parse_transform(el.get('transform')))
        tag = el.tag.split('}')[-1]
        if tag == 'path' and el.get('d'):
            for x0, y0, x1, y1 in _path_strokes(el.get('d')):
                p = _apply(m2, x0, y0)
                q = _apply(m2, x1, y1)
                strokes.append((p[0], p[1], q[0], q[1]))
        for ch in el:
            walk(ch, m2)

    walk(tree.getroot(), (1.0, 0.0, 0.0, 1.0, 0.0, 0.0))
    return strokes


def _az(o, x, y):
    """Azimuth in degrees [0, 360), counter-clockwise with the SVG y axis flipped."""
    return math.degrees(math.atan2(-(y - o[1]), x - o[0])) % 360.0


def _wrap(a):
    return (a + 180.0) % 360.0 - 180.0


def _median(v):
    s = sorted(v)
    n = len(s)
    return s[n // 2] if n % 2 else 0.5 * (s[n // 2 - 1] + s[n // 2])


class Stroke:
    __slots__ = ('x0', 'y0', 'x1', 'y1', 'a0', 'a1', 'rho', 'az', 'az0', 'length', 'kind', 'idx')

    def __init__(self, o, s, idx):
        self.x0, self.y0, self.x1, self.y1 = s
        self.idx = idx
        d0 = math.hypot(s[0] - o[0], s[1] - o[1])
        d1 = math.hypot(s[2] - o[0], s[3] - o[1])
        self.a0, self.a1 = min(d0, d1), max(d0, d1)
        # azimuth of the endpoint nearer the origin
        self.az0 = _az(o, s[0], s[1]) if d0 <= d1 else _az(o, s[2], s[3])
        mx, my = (s[0] + s[2]) / 2, (s[1] + s[3]) / 2
        self.rho = math.hypot(mx - o[0], my - o[1])
        self.az = _az(o, mx, my)
        self.length = math.hypot(s[2] - s[0], s[3] - s[1])
        # P if the stroke runs within 45 deg of the radial direction through its midpoint.
        if self.length == 0 or self.rho == 0:
            self.kind = 'X'
        else:
            ux, uy = (s[2] - s[0]) / self.length, (s[3] - s[1]) / self.length
            rx, ry = (mx - o[0]) / self.rho, (my - o[1]) / self.rho
            self.kind = 'P' if abs(ux * rx + uy * ry) > math.cos(math.radians(45)) else 'X'

    def lat(self, axis):
        return self.rho * math.sin(math.radians(self.az - axis))


def least_squares_origin(strokes, near):
    """Least-squares intersection of the long (> 14 units) P strokes through the map centre."""
    a11 = a12 = a22 = b1 = b2 = 0.0
    for s in strokes:
        if s.kind != 'P' or s.length <= 14 or s.rho > 1300:
            continue
        ux, uy = (s.x1 - s.x0) / s.length, (s.y1 - s.y0) / s.length
        nx, ny = -uy, ux
        # Only strokes whose extension passes within 3 units of the provisional centre.
        if abs((near[0] - s.x0) * nx + (near[1] - s.y0) * ny) > 3:
            continue
        a11 += nx * nx; a12 += nx * ny; a22 += ny * ny
        c = nx * s.x0 + ny * s.y0
        b1 += nx * c; b2 += ny * c
    det = a11 * a22 - a12 * a12
    return ((a22 * b1 - a12 * b2) / det, (a11 * b2 - a12 * b1) / det)


def _lat_ok(lat, rho):
    # Near the origin the seed strokes do not aim exactly at the origin (B1929+10 and B0950+08 are
    # 6 deg off), so the first marks are accepted within NEAR_ANGLE_TOL; farther out, LAT_TOL.
    if rho < NEAR_R:
        return abs(lat) < max(LAT_TOL, rho * math.sin(math.radians(NEAR_ANGLE_TOL)))
    return abs(lat) < LAT_TOL


def _starts_near(s, axis):
    # A long solid piece that starts near the origin (after a break) is judged by where it starts and
    # its direction, not by its midpoint: the seed strokes point up to 6 deg off their lines, so the
    # midpoint of a 750-unit solid piece can sit 12 units off the provisional axis (B1933+16).
    return (s.kind == 'P' and s.a0 < NEAR_R and abs(_wrap(s.az0 - axis)) < NEAR_ANGLE_TOL
            and abs(_wrap(s.az - axis)) < NEAR_ANGLE_TOL)


def _walk(strokes, axis, start_r, lat_ok, used, reach0=None):
    """Collect strokes outward along a line from radius start_r; returns the list in radius order."""
    cand = [s for s in strokes if s.idx not in used and s.a0 >= start_r - 1e-9 and abs(_wrap(s.az - axis)) < 90
            and (lat_ok(s.lat(axis), s.rho) or _starts_near(s, axis))]
    cand.sort(key=lambda s: (s.a0, s.a1))
    got = []
    reach = start_r if reach0 is None else reach0
    for s in cand:
        if s.a0 - reach > GAP_TOL:
            break
        got.append(s)
        reach = max(reach, s.a1)
    return got


def decode_marks(marks):
    """Binary digits from P/X marks in radius order (port of the research rule, decode_svg.py).

    A P stroke longer than 20 units is several 0 dashes drawn as one stroke: k = round((L+8)/19.5)
    dashes. X strokes are 1 bars. 0 dashes closer than 9 units centre to centre are one dash drawn in
    fragments. Source: docs/research/data/cover/decode_svg.py (decode()).
    """
    out = []
    for s in marks:
        if s.kind == 'P':
            L = s.a1 - s.a0
            if L > 20:
                k = max(1, round((L + 8) / 19.5))
                step = (L - DASH * k) / (k - 1) if k > 1 else 0
                for i in range(k):
                    out.append(('0', s.a0 + i * (DASH + step) + DASH / 2))
            else:
                out.append(('0', (s.a0 + s.a1) / 2))
        else:
            out.append(('1', s.rho))
    out.sort(key=lambda m: m[1])
    merged = []
    for m in out:
        if merged and m[0] == '0' and merged[-1][0] == '0' and m[1] - merged[-1][1] < 9:
            continue
        merged.append(m)
    return ''.join(m[0] for m in merged), merged[0][1], merged[-1][1]


def find_origin(raw):
    """The map origin from the drawing alone.

    Provisional point: the end of the longest stroke (the galactic-centre line's first piece) that has
    the most other stroke endpoints within 5 units (the 15 lines leave the origin together). Then the
    least-squares intersection of the long radial strokes, iterated until it moves less than 1e-9 units.
    """
    longest = max(raw, key=lambda s: math.hypot(s[2] - s[0], s[3] - s[1]))
    ends = [(s[0], s[1]) for s in raw] + [(s[2], s[3]) for s in raw]

    def crowd(p):
        return sum(1 for e in ends if math.hypot(e[0] - p[0], e[1] - p[1]) < 5.0)
    o = max([(longest[0], longest[1]), (longest[2], longest[3])], key=crowd)
    for _ in range(50):
        strokes = [Stroke(o, s, i) for i, s in enumerate(raw) if not (s[0] == s[2] and s[1] == s[3])]
        n = least_squares_origin(strokes, o)
        moved = math.hypot(n[0] - o[0], n[1] - o[1])
        o = n
        if moved < 1e-9:
            break
    return o


def extract_map(svg_path, origin=None):
    """origin=None (the default) uses our least-squares origin; pass RESEARCH_ORIGIN to compare."""
    raw = svg_strokes(svg_path)
    lsq = find_origin(raw)
    o = lsq if origin is None else origin
    strokes = [Stroke(o, s, i) for i, s in enumerate(raw) if not (s[0] == s[2] and s[1] == s[3])]
    seeds = [s for s in strokes if s.a0 < SEED_RMAX and s.length > 10 and s.kind == 'P']
    if len(seeds) != 15:
        raise ValueError(f'expected 15 lines from the origin, found {len(seeds)}')
    used = {s.idx for s in seeds}

    # Galactic-centre line: the longest seed. It runs behind the figures in pieces; its end is the
    # perpendicular tick about twice a binary bar long (cover.md 1d).
    gc_seed = max(seeds, key=lambda s: s.length)
    gc_axis = _az(o, *(gc_seed.x1, gc_seed.y1) if gc_seed.a1 == math.hypot(gc_seed.x1 - o[0], gc_seed.y1 - o[1]) else (gc_seed.x0, gc_seed.y0))
    gc_parts = [s for s in strokes if s.idx not in used and abs(s.lat(gc_axis)) < LAT_TOL and abs(_wrap(s.az - gc_axis)) < 5 and s.rho < 2200]
    gc_ticks = [s for s in gc_parts if s.kind == 'X']
    gc_end = max(gc_ticks, key=lambda s: s.rho)
    gc_pieces = sorted([gc_seed] + [s for s in gc_parts if s.kind == 'P'], key=lambda s: s.a0)
    for s in gc_parts:
        used.add(s.idx)
    gc = {
        'lengthSvg': gc_end.rho,
        'endTickLengthSvg': gc_end.length,
        'pieces': [[p.a0, p.a1] for p in gc_pieces],
        'azimuthDeg': _median([p.az for p in gc_pieces if p.rho > AXIS_RMIN]),
    }

    line_seeds = sorted([s for s in seeds if s is not gc_seed], key=lambda s: s.az)

    def settle(seed, pool_used, allowed=None, axis0=None):
        """Walk outward from a seed, re-estimating the axis until stable; returns (axis, strokes)."""
        far = (seed.x1, seed.y1) if math.hypot(seed.x1 - o[0], seed.y1 - o[1]) >= math.hypot(seed.x0 - o[0], seed.y0 - o[1]) else (seed.x0, seed.y0)
        axis = _az(o, *far) if axis0 is None else axis0
        pool = strokes if allowed is None else [s for s in strokes if s.idx in allowed]
        got = []
        for _it in range(20):
            got = [s for s in _walk(pool, axis, seed.a0, _lat_ok, pool_used, reach0=seed.a1) if s.idx != seed.idx]
            far_marks = [s for s in got if s.rho > AXIS_RMIN]
            if not far_marks:
                raise ValueError(f'line seeded at azimuth {seed.az:.3f} collected no strokes beyond {AXIS_RMIN} units')
            new_axis = axis + _wrap(_median([s.az for s in far_marks]) - axis)
            if abs(new_axis - axis) < 1e-12:
                break
            axis = new_axis
        return axis % 360.0, got

    # Phase A: each line settles independently (no line can take another's strokes yet).
    provisional = [settle(seed, used) for seed in line_seeds]
    # Phase B: a stroke claimed by several lines goes to the one it lies closest to (smallest |lateral
    # offset|). Near the origin the lines are only a few units apart, so greedy claiming would let one
    # line take another's tick (the Crab line would take B0823+26's, B1240-64 would take B1451-68's).
    owner = {}
    for k, (axis, got) in enumerate(provisional):
        for s in got:
            lat = abs(s.lat(axis))
            if s.idx not in owner or lat < owner[s.idx][1]:
                owner[s.idx] = (k, lat)
    lines = []
    for k, seed in enumerate(line_seeds):
        # Phase C: settle again using only the strokes this line owns.
        mine = {i for i, (kk, _) in owner.items() if kk == k}
        axis, got = settle(seed, used, allowed=mine, axis0=provisional[k][0])
        for s in got:
            used.add(s.idx)

        beyond = [s for s in got if s.a0 > seed.a1]
        broken = bool(beyond) and beyond[0].kind == 'P' and beyond[0].a0 - seed.a1 < BREAK_TOL
        solid = [seed] + ([beyond[0]] if broken else [])
        r_end = solid[-1].a1
        ticks = [s for s in got if s.kind == 'X' and s.rho <= r_end]
        digits = [s for s in got if s not in solid and s not in ticks and s.rho > r_end + 3]
        along_own = False
        if not digits:
            # B1240-64: the digits run beside the outer part of its own line (cover.md 1d).
            side = [s for s in strokes if s.idx not in used and SIDE_TRACK_LAT[0] < abs(s.lat(axis)) < SIDE_TRACK_LAT[1]
                    and 0.4 * r_end < s.rho <= r_end]
            side.sort(key=lambda s: s.a0)
            # keep the side whose strokes form one continuous run
            for sign in (-1, 1):
                run = [s for s in side if s.lat(axis) * sign > 0]
                if len(run) >= 20:
                    digits = run
                    along_own = True
                    break
            for s in digits:
                used.add(s.idx)
        bits, b0, b1 = decode_marks(sorted(digits, key=lambda s: s.rho))
        lines.append({
            'axisDeg': axis,
            'seedDeg': seed.az,
            'rEnd': r_end,
            'innerEnd': seed.a1,
            'break': [seed.a1, solid[1].a0] if broken else None,
            'ticks': [t.rho for t in ticks],
            'bits': bits,
            'digitSpan': [b0, b1],
            'digitsAlongOwnLine': along_own,
        })
    return {'origin': list(o), 'originLsq': list(lsq), 'originResearch': list(RESEARCH_ORIGIN), 'gc': gc, 'lines': lines}


if __name__ == '__main__':
    import sys
    m = extract_map(sys.argv[1])
    g = m['gc']
    print('origin', m['origin'], 'lsq', m['originLsq'])
    print('gc', g['lengthSvg'], g['azimuthDeg'], g['endTickLengthSvg'], g['pieces'])
    for ln in m['lines']:
        z = (ln['rEnd'] - ln['ticks'][-1]) if ln['ticks'] else None
        print(f"{ln['axisDeg']:8.3f} r/R0 {ln['rEnd'] / g['lengthSvg']:.4f} z {('%.4f' % (z / g['lengthSvg'])) if z is not None else '-':>6} "
              f"brk {ln['break']} ticks {ln['ticks']} own {ln['digitsAlongOwnLine']} {len(ln['bits'])} {ln['bits']}")
