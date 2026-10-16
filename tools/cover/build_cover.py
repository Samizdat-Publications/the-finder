"""Generate public/media/cover/cover.svg from assets-src/cover/geometry.json and data/cover.json.

Run: python -P tools/cover/build_cover.py        (deterministic: same inputs, same bytes)

Inputs  : assets-src/cover/geometry.json (photo-pixel measurements and the map placement, from measure.py and
          placement.py), data/cover.json (every etched number and the pulsar-map geometry), and, for the
          position of each binary digit along a pulsar line only, tools/data/svgmap.py on
          sources/pioneer-svg/Pioneer_plaque.svg.
Output  : public/media/cover/cover.svg, one viewBox in millimetres of the real cover, origin top left and
          orientation as in the NASA photo, the cover being a 12 inch (304.8 mm) disc.
Nothing is hand-edited in the SVG; strokes are plain (stroke="currentColor"), the game colours them.
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'data'))
import svgmap

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GEO = json.load(open(os.path.join(ROOT, 'assets-src', 'cover', 'geometry.json'), encoding='utf-8'))
COVER = json.load(open(os.path.join(ROOT, 'data', 'cover.json'), encoding='utf-8'))
OUT = os.path.join(ROOT, 'public', 'media', 'cover', 'cover.svg')
PIONEER = os.path.join(ROOT, 'sources', 'pioneer-svg', 'Pioneer_plaque.svg')

DIAMETER_MM = 304.8  # 12 inch: the cover is a disc the size of the record it protects (NASA, cover.md 4)
DISC = GEO['disc']
K = DIAMETER_MM / (2.0 * DISC['r'])           # mm per photo pixel
X0 = DISC['cx'] - DISC['r']
Y0 = DISC['cy'] - DISC['r']

# stroke widths in photo pixels, from the etch ridge widths (half-maximum), converted to mm below
W_MAIN = 3.4      # rings, frames, waveform, sawtooth
W_BIT = 3.0       # binary marks
W_MAP = 1.9       # pulsar lines and ticks
W_MAPBIT = 1.6    # pulsar digits
W_FINE = 2.4      # cartridge inner lines, hydrogen symbols


def mm(px, py):
    return ((px - X0) * K, (py - Y0) * K)


def f(v):
    s = f'{v:.4f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def pt(p):
    x, y = mm(*p)
    return f'{f(x)} {f(y)}'


def path_d(points, close=False):
    d = 'M' + ' L'.join(pt(p) for p in points)
    return d + ('Z' if close else '')


def w(px):
    return f(px * K)


def attrs(**kw):
    out = []
    for k, v in kw.items():
        if v is None:
            continue
        out.append(f'{k.replace("_", "-")}="{v}"')
    return ' '.join(out)


lines = []


def emit(s, depth):
    lines.append('  ' * depth + s)


# ---------------------------------------------------------------------------------------------
# binary digit groups
# ---------------------------------------------------------------------------------------------
def bit_path(bit, seg, width_px, index, extra=''):
    cls = 'bit one' if bit == '1' else 'bit zero'
    return (f'<path class="{cls}" data-index="{index}" d="{path_d(seg)}" stroke-width="{w(width_px)}"{extra}/>')


def digit_group(depth, gid, cover_rec, rows, kind='binary', extra=None, delimiters=None, desc=None):
    """A group whose bit elements, in document order, read as the cover's binary string."""
    bits = cover_rec['binary']
    flat = [b for r in rows for b in r]
    got = ''.join(b['bit'] for b in flat)
    assert got == bits, (gid, got, bits)
    ex = extra or {}
    emit(f'<g {attrs(data_id=gid, data_kind=kind, data_binary=bits, data_bits=len(bits), data_value_th=cover_rec.get("valueTH"), **ex)}>', depth)
    if desc:
        emit(f'<desc>{desc}</desc>', depth + 1)
    idx = 0
    for ri, row in enumerate(rows):
        emit(f'<g class="row" data-row="{ri}">', depth + 1)
        for b in row:
            emit(bit_path(b['bit'], b['seg'], W_BIT, idx), depth + 2)
            idx += 1
        emit('</g>', depth + 1)
    for d_ in delimiters or []:
        emit(f'<path class="delimiter" d="{path_d(d_)}" stroke-width="{w(W_BIT)}"/>', depth + 1)
    emit('</g>', depth)


def poly(depth, points, width_px, cls='stroke', close=False, extra=''):
    emit(f'<path class="{cls}" d="{path_d(points, close)}" stroke-width="{w(width_px)}"{extra}/>', depth)


def circle(depth, c, width_px, cls='stroke', extra=''):
    x, y = mm(c['cx'], c['cy'])
    emit(f'<circle class="{cls}" cx="{f(x)}" cy="{f(y)}" r="{f(c["r"] * K)}" stroke-width="{w(width_px)}"{extra}/>', depth)


def dot(depth, x, y, r_px, extra=''):
    X, Y = mm(x, y)
    emit(f'<circle class="dot" cx="{f(X)}" cy="{f(Y)}" r="{f(r_px * K)}" fill="currentColor" stroke="none"{extra}/>', depth)


def rect_pts(r):
    x0, y0, x1, y1 = r
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


# ---------------------------------------------------------------------------------------------
# sections
# ---------------------------------------------------------------------------------------------
def section_outline(depth):
    emit('<g id="outline" data-id="cover.outline">', depth)
    r = DIAMETER_MM / 2
    emit(f'<circle class="stroke" data-id="cover.edge" cx="{f(r)}" cy="{f(r)}" r="{f(r)}" stroke-width="{w(W_MAIN)}" data-measured="disc edge fitted to the photo, rms {DISC["rms"]} px"/>', depth + 1)
    feat = GEO['features']
    emit('<g data-id="cover.spindleHole">', depth + 1)
    circle(depth + 2, feat['spindleOuter'], W_MAIN, extra=' data-role="collar"')
    circle(depth + 2, feat['spindleInner'], W_MAIN, extra=' data-role="hole"')
    emit('</g>', depth + 1)
    emit('</g>', depth)


def ring_with_gap(plan):
    ring = plan['ring']
    a, b = plan['cartridge']['ringBehind']
    ang = lambda p: math.atan2(p[1] - ring['cy'], p[0] - ring['cx'])
    a0, a1 = ang(a), ang(b)  # the ring is hidden behind the cartridge between these two angles (y down)
    pts = []
    n = 360
    start = a1
    end = a0 + 2 * math.pi
    for i in range(n + 1):
        t = start + (end - start) * i / n
        pts.append((ring['cx'] + ring['r'] * math.cos(t), ring['cy'] + ring['r'] * math.sin(t)))
    return pts


def cartridge_plan(depth, c):
    emit('<g data-id="record.cartridge" data-role="stylus cartridge, outline, plan view">', depth)
    cap = c['cap']
    poly(depth + 1, rect_pts(cap['rect']), W_MAIN, close=True)
    poly(depth + 1, rect_pts(cap['slot']), W_FINE, close=True)
    poly(depth + 1, c['body'], W_MAIN)
    for r in c['innerRails']:
        poly(depth + 1, r, W_FINE)
    for r in c['windows']:
        poly(depth + 1, rect_pts(r), W_FINE, close=True)
    poly(depth + 1, c['lobeLeft'], W_FINE)
    poly(depth + 1, c['lobeRight'], W_FINE)
    poly(depth + 1, c['arch'], W_MAIN)
    poly(depth + 1, c['stylus'], W_MAIN)
    poly(depth + 1, rect_pts(c['stylusSlot']), W_FINE, close=True)
    poly(depth + 1, c['wingLeft'], W_FINE)
    poly(depth + 1, c['wingRight'], W_FINE)
    emit('</g>', depth)


def section_record(depth):
    plan = GEO['plan']
    side = GEO['side']
    emit('<g id="record" data-id="record">', depth)
    # plan view
    emit('<g data-id="record.plan">', depth + 1)
    poly(depth + 2, ring_with_gap(plan), W_MAIN, extra=' data-role="disc edge, hidden behind the cartridge"')
    circle(depth + 2, plan['labelCircle'], W_MAIN, extra=' data-role="label"')
    circle(depth + 2, plan['spindleCircle'], W_MAIN, extra=' data-role="spindle"')
    cartridge_plan(depth + 2, plan['cartridge'])
    marks = [{'bit': m['bit'], 'seg': m['seg']} for m in plan['rimMarks']]
    digit_group(depth + 2, 'record.rotationPeriod', COVER['record']['rotationPeriod'], [marks],
                extra={'data_unit': 'tH', 'data_msb': 'first', 'data_direction': 'counter-clockwise from the mark next to the cartridge'},
                desc='Time for one turn of the record in hydrogen time units, written round the rim, read counter-clockwise from the mark next to the cartridge.')
    emit('</g>', depth + 1)
    # side view
    emit('<g data-id="record.side">', depth + 1)
    poly(depth + 2, side['recordEdge'][0], W_MAIN, close=True, extra=' data-role="record seen edge-on"')
    sc = side['cartridge']
    emit('<g data-id="record.sideCartridge" data-role="stylus cartridge, elevation view">', depth + 2)
    poly(depth + 3, list(reversed(sc['outerLeft'])) + sc['outer'][1:], W_MAIN)
    poly(depth + 3, rect_pts(sc['pocket']), W_FINE, close=True)
    poly(depth + 3, rect_pts(sc['slot']), W_FINE, close=True)
    poly(depth + 3, sc['arch'], W_FINE)
    for n_ in sc['neck']:
        poly(depth + 3, n_, W_FINE)
    emit('</g>', depth + 2)
    rows = [[{'bit': b['bit'], 'seg': b['seg']} for b in r] for r in side['playTimeRows']]
    digit_group(depth + 2, 'record.playTime', COVER['record']['playTime'], rows,
                extra={'data_unit': 'tH', 'data_msb': 'first', 'data_rows': '9/10/10/10/4'},
                delimiters=side['playTimeBars'],
                desc='Playing time of one side in hydrogen time units, written in five rows between two tall bars.')
    emit('</g>', depth + 1)
    emit('</g>', depth)


def label_sets(depth, groups, set_name):
    labels = COVER['picture']['lineLabels']
    emit(f'<g data-id="picture.lineLabels" data-set="{set_name}">', depth)
    for i, (g, lab) in enumerate(zip(groups, labels)):
        marks = [{'bit': b['bit'], 'seg': b['seg']} for b in g]
        digit_group(depth + 1, f'picture.lineLabel.{set_name}.{i + 1}', lab, [marks], kind='label',
                    extra={'data_line': i + 1, 'data_set': set_name})
    emit('</g>', depth)


def section_pictures(depth):
    pic = GEO['pictures']
    emit('<g id="pictures" data-id="pictures">', depth)
    # waveform
    emit('<g data-id="picture.waveform" data-role="general appearance of the video signal: burst, step, three lines">', depth + 1)
    for pl in pic['waveform']:
        poly(depth + 2, pl, W_MAIN)
    emit('</g>', depth + 1)
    label_sets(depth + 1, pic['waveformLabels'], 'waveform')
    rows = [[{'bit': b['bit'], 'seg': b['seg']} for b in r] for r in pic['lineTimeRows']]
    digit_group(depth + 1, 'picture.lineTime', COVER['picture']['lineTime'], rows,
                extra={'data_unit': 'tH', 'data_msb': 'first', 'data_rows': '12/8/4'},
                delimiters=pic['lineTimeBars'],
                desc='Duration of one picture line in hydrogen time units, in three rows between two tall bars.')
    # scan triggering: the sawtooth with its staggered pairs of circles
    emit('<g data-id="picture.scan" data-role="scan triggering: three slow downstrokes and fast retraces; the middle stroke carries its circles lower (staggered interlace)">', depth + 1)
    for pl in pic['sawtooth']:
        poly(depth + 2, pl, W_MAIN)
    for c in pic['sawCircles']:
        circle(depth + 2, c, W_FINE)
    emit('</g>', depth + 1)
    label_sets(depth + 1, pic['scanLabels'], 'scan')
    # raster
    emit('<g data-id="picture.raster" data-role="video frame showing the direction of scan">', depth + 1)
    for pl in pic['rasterFrame']:
        poly(depth + 2, pl, W_MAIN)
    for pl in pic['rasterFan']:
        poly(depth + 2, pl, W_FINE, extra=' data-role="first scan lines"')
    notation = [{'bit': b['bit'], 'seg': b['seg']} for b in pic['rasterLinesNotation']]
    digit_group(depth + 2, 'picture.rasterLines', COVER['picture']['rasterLines'], [notation], kind='binary',
                extra={'data_unit': 'count', 'data_msb': 'first', 'data_layout': 'vertical notation: a horizontal bar then 5 dashes (left column, bottom to top) and 4 dashes (right column, bottom to top)'},
                desc='Number of vertical lines in one picture (512) in vertical notation.')
    # the disputed small label above the first lines: drawn as seen, not asserted
    emit('<g data-id="picture.rasterLabel" data-disputed="true" data-reading="10000 (CED Magic); 1, 10, 11 (research); no official source">', depth + 2)
    for i, m in enumerate(pic['rasterLabel']):
        cls = 'mark bar' if m['bar'] else 'mark dash'
        emit(f'<path class="{cls}" data-index="{i}" d="{path_d(m["seg"])}" stroke-width="{w(W_BIT)}"/>', depth + 3)
    emit('</g>', depth + 2)
    emit('</g>', depth + 1)
    # calibration picture
    emit('<g data-id="picture.calibration" data-role="the first image: a circle in a frame, fixing the ratio of horizontal to vertical">', depth + 1)
    for pl in pic['calibFrame']:
        poly(depth + 2, pl, W_MAIN)
    circle(depth + 2, pic['calibCircle'], W_MAIN)
    emit('</g>', depth + 1)
    emit('</g>', depth)


def section_hydrogen(depth):
    h = GEO['hydrogen']
    emit('<g id="hydrogen" data-id="hydrogen" data-role="the two lowest states of the hydrogen atom and the transition between them">', depth)
    for i, c in enumerate(h['circles']):
        emit(f'<g data-id="hydrogen.state.{i + 1}" data-role="{"antiparallel spins" if i == 0 else "parallel spins"}">', depth + 1)
        circle(depth + 2, c, W_MAIN)
        s = h['symbols']['left' if i == 0 else 'right']
        for name in ('top', 'centre'):
            q = s[name]
            poly(depth + 2, [(q['x'], q['y0']), (q['x'], q['y1'])], W_FINE, extra=f' data-role="spin moment, {name}"')
            dy = q['y0'] + 1.5 if q['dot'] == 'top' else q['y1'] - 1.5
            dot(depth + 2, q['x'], dy, 3.0)
        emit('</g>', depth + 1)
    for seg in h['connector']:
        poly(depth + 1, seg, W_MAIN, extra=' data-role="transition"')
    emit('<g data-id="hydrogen.one" data-role="binary 1: the unit">', depth + 1)
    for seg in h['one']:
        poly(depth + 2, seg, W_BIT, cls='bit one', extra=' data-index="0"')
    emit('</g>', depth + 1)
    emit('</g>', depth)


# ---------------------------------------------------------------------------------------------
# the pulsar map
# ---------------------------------------------------------------------------------------------
def digit_positions():
    """Per pulsar line (by its binary string): [(bit, along, lat)] in Pioneer SVG units, from svgmap."""
    captured = []
    orig = svgmap.decode_marks

    def cap(marks):
        captured.append(list(marks))
        return orig(marks)
    svgmap.decode_marks = cap
    try:
        m = svgmap.extract_map(PIONEER)
    finally:
        svgmap.decode_marks = orig
    out = {}
    for ln, marks in zip(m['lines'], captured):
        axis = ln['axisDeg']
        items = []
        for s in marks:
            proj = s.rho * math.cos(math.radians(s.az - axis))
            lat = s.lat(axis)
            if s.kind == 'P':
                L = s.a1 - s.a0
                if L > 20:
                    k = max(1, round((L + 8) / 19.5))
                    step = (L - svgmap.DASH * k) / (k - 1) if k > 1 else 0
                    for i in range(k):
                        items.append(('0', s.a0 + i * (svgmap.DASH + step) + svgmap.DASH / 2, lat))
                else:
                    items.append(('0', (s.a0 + s.a1) / 2, lat))
            else:
                items.append(('1', proj, lat))
        items.sort(key=lambda t: t[1])
        merged = []
        for it in items:
            if merged and it[0] == '0' and merged[-1][0] == '0' and it[1] - merged[-1][1] < 9:
                continue
            merged.append(it)
        out[ln['bits']] = merged
    return out


def placement():
    t = GEO['map']['transform']
    o = t['svgOrigin']
    s, ph = t['scalePxPerUnit'], t['rotationRad']
    c, sn = math.cos(ph), math.sin(ph)
    ox, oy = t['originPx']

    def to_px(x, y):
        dx, dy = x - o[0], y - o[1]
        return (ox + s * (c * dx - sn * dy), oy + s * (sn * dx + c * dy))
    return to_px, s


def section_map(depth):
    pm = COVER['pulsarMap']
    to_px, scale = placement()
    o = COVER['meta']['svgUnits']['origin']
    gc = pm['gcLine']
    R0 = gc['lengthSvg']
    gc_az = gc['svgAzimuthDeg']
    dig = digit_positions()

    def at(az_deg, along, lat=0.0):
        a = math.radians(az_deg)
        x = o[0] + along * math.cos(a) + lat * (-math.sin(a))
        y = o[1] - along * math.sin(a) + lat * (-math.cos(a))
        return x, y

    def seg_px(az, a0, a1, lat=0.0):
        return [to_px(*at(az, a0, lat)), to_px(*at(az, a1, lat))]

    emit('<g id="map" data-id="pulsarMap" data-role="the pulsar map: the Sun at the origin, 14 pulsars and the galactic centre" data-r0-mm="' + f(R0 * scale * K) + '">', depth)
    # centre line to the galactic centre
    emit('<g data-id="pulsarMap.gcLine" data-role="distance to the galactic centre, R0, the unit of the map" data-angle-deg="0">', depth + 1)
    emit(f'<path class="solid" d="{path_d(seg_px(gc_az, 0.0, R0))}" stroke-width="{w(W_MAP)}"/>', depth + 2)
    t0 = to_px(*at(gc_az, R0, -gc['endTickLengthSvg'] / 2))
    t1 = to_px(*at(gc_az, R0, gc['endTickLengthSvg'] / 2))
    emit(f'<path class="tick end" d="{path_d([t0, t1])}" stroke-width="{w(W_MAP)}"/>', depth + 2)
    emit('</g>', depth + 1)
    emit('<g data-id="pulsarMap.lines">', depth + 1)
    for ln in pm['lines']:
        az = ln['svgAzimuthDeg']
        rend = ln['rOverR0'] * R0
        n = ln['order']
        bits = ln['binary']
        emit(f'<g data-id="pulsar.{n}" data-order="{n}" data-b-name="{ln["bname"]}" data-j-name="{ln["jname"]}" data-label-1972="{ln["label1972"]}" '
             f'data-angle-deg="{f(ln["mapAngleDeg"])}" data-r-over-r0="{ln["rOverR0"]}" data-broken="{str(ln["broken"]).lower()}" '
             f'data-digits-along-own-line="{str(ln["digitsAlongOwnLine"]).lower()}" data-binary="{bits}" data-value-th="{ln["valueTH"]}">', depth + 2)
        if ln['broken']:
            b0, b1 = ln['breakR0'][0] * R0, ln['breakR0'][1] * R0
            emit(f'<path class="solid" data-piece="0" d="{path_d(seg_px(az, 0.0, b0))}" stroke-width="{w(W_MAP)}"/>', depth + 3)
            emit(f'<path class="solid" data-piece="1" d="{path_d(seg_px(az, b1, rend))}" stroke-width="{w(W_MAP)}"/>', depth + 3)
        else:
            emit(f'<path class="solid" data-piece="0" d="{path_d(seg_px(az, 0.0, rend))}" stroke-width="{w(W_MAP)}"/>', depth + 3)
        if ln['absZOverR0'] is not None:
            tr = rend - ln['absZOverR0'] * R0
            half = svgmap.DASH / 2
            emit(f'<path class="tick z" d="{path_d([to_px(*at(az, tr, -half)), to_px(*at(az, tr, half))])}" stroke-width="{w(W_MAP)}" data-abs-z-over-r0="{ln["absZOverR0"]}"/>', depth + 3)
        # digits
        items = dig[bits]
        assert ''.join(i[0] for i in items) == bits, (n, ''.join(i[0] for i in items), bits)
        emit(f'<g class="digits" data-id="pulsar.{n}.digits">', depth + 3)
        half = svgmap.DASH / 2
        for i, (b, along, lat) in enumerate(items):
            if b == '1':
                seg = [to_px(*at(az, along, lat - half)), to_px(*at(az, along, lat + half))]
            else:
                seg = [to_px(*at(az, along - half, lat)), to_px(*at(az, along + half, lat))]
            emit(f'<path class="{"bit one" if b == "1" else "bit zero"}" data-index="{i}" d="{path_d(seg)}" stroke-width="{w(W_MAPBIT)}"/>', depth + 4)
        emit('</g>', depth + 3)
        emit('</g>', depth + 2)
    emit('</g>', depth + 1)
    emit('</g>', depth)


def build():
    emit('<?xml version="1.0" encoding="UTF-8"?>', 0)
    emit(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f(DIAMETER_MM)} {f(DIAMETER_MM)}" width="{f(DIAMETER_MM)}mm" height="{f(DIAMETER_MM)}mm" '
         f'data-units="mm" data-cover-diameter-mm="{f(DIAMETER_MM)}" data-source="NASA/JPL GPN-2000-001978 (1977, public domain), data/cover.json, Pioneer plaque vector map geometry" '
         f'data-generator="tools/cover/build_cover.py">', 0)
    emit('<title>Voyager Golden Record cover, rebuilt as exact layered SVG</title>', 1)
    emit('<desc>The aluminium cover of the Voyager record, traced from the 1977 NASA photograph. Units are millimetres, origin at the top left of the 304.8 mm disc, orientation as in the photograph. Every binary digit is its own element (class bit one or bit zero, data-index) in document order, the most significant digit first as on the cover. Strokes are plain (currentColor); colour and lighting belong to the game.</desc>', 1)
    emit('<style>.stroke,.solid,.tick,.bit,.delimiter,.mark{fill:none;stroke:currentColor;stroke-linecap:butt;stroke-linejoin:round}.dot{fill:currentColor;stroke:none}circle.stroke{fill:none}</style>', 1)
    emit('<g id="cover" color="#1a1a1a" fill="none" stroke="currentColor" stroke-linecap="butt" stroke-linejoin="round">', 1)
    section_outline(2)
    section_record(2)
    section_pictures(2)
    section_map(2)
    section_hydrogen(2)
    emit('<!-- Uranium-238 spot: not drawn. NASA says ultra-pure U-238 (about 0.00026 microcurie) is electroplated on the cover in a two-centimetre-diameter area, but it is not on the cover diagram and not identifiable in the 1977 photo (docs/research/cover.md 1e). '
         'Its position is the game\'s documented choice (D-A08), to be filled in when the instruments step places it: a 20 mm circle, no position known from any source. -->', 2)
    emit('<g id="uranium-spot" data-id="cover.uraniumSpot" data-diameter-mm="20" data-drawn="false"></g>', 2)
    emit('</g>', 1)
    emit('</svg>', 0)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    text = '\n'.join(lines) + '\n'
    with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(text)
    print(f'wrote {OUT}: {len(text)} bytes, scale {K:.5f} mm/px, cover {DIAMETER_MM} mm')


if __name__ == '__main__':
    build()
