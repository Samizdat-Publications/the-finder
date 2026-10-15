"""Build data/cover.json: every etched number on the Voyager record cover, with the pulsar map
geometry rebuilt from the raw Pioneer plaque SVG.

Sources:
- Record-playing and picture numbers: binary strings transcribed in docs/research/cover.md 1b and 1c
  (verified there by pixel-scanning NASA photo GPN-2000-001978, sources/cover-photo/, and matching the
  independent transcriptions of Carter Dack and CED Magic). They are transcriptions from a photograph,
  so each carries its provenance string.
- Pulsar map: extracted here from sources/pioneer-svg/Pioneer_plaque.svg by tools/data/svgmap.py
  (geometry and all 14 binary strings). Line identities: the decoded integers matched to Sagan, Salzman
  Sagan and Drake (1972) Table 1 (docs/research/cover.md section 2).

Run: python -P tools/data/build_cover.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import svgmap  # noqa: E402

PHOTO = 'NASA/JPL photo GPN-2000-001978 (1977), pixel scan in docs/research/cover.md'

# docs/research/cover.md 1b and 1c. Strings, bit counts and meanings as documented there.
RECORD = {
    'rotationPeriod': {
        'binary': '100110000110010000000000000000000',
        'meaning': 'Time for one rotation of the record (3.6 s, 16 2/3 rpm), in hydrogen time units',
        'location': 'Top left: around the plan view of the record, read counter-clockwise from the mark next to the cartridge',
        'provenance': PHOTO + ' section 1b; matches Carter Dack (carterdack.com/Voyager) and CED Magic (cedmagic.com) transcriptions',
    },
    'playTime': {
        'binary': '1000010110000000000000000000000000000000000',
        'meaning': 'Playing time of one side (53.8 min), in hydrogen time units',
        'location': 'Top left: side view of the record, written in 5 rows (9/10/10/10/4 digits) between two tall bars',
        'provenance': PHOTO + ' section 1b; matches Carter Dack and CED Magic transcriptions',
    },
}
PICTURE = {
    'lineTime': {
        'binary': '101101001100000000000000',
        'meaning': 'Duration of one picture line (8.34 ms), in hydrogen time units',
        'location': 'Top right: under picture line 1, between two tall bars, in 3 rows (12/8/4 digits)',
        'provenance': PHOTO + ' section 1c; matches Carter Dack, CED Magic and Ron Barry transcriptions',
    },
    'rasterLines': {
        'binary': '1000000000',
        'meaning': 'Number of vertical lines in one picture (512)',
        'location': 'Top right: above the last line of the raster rectangle, in vertical notation (a horizontal bar plus 9 dashes in columns of 5 and 4)',
        'provenance': PHOTO + ' section 1c; matches CED Magic and Carter Dack; NASA: "512 vertical lines"',
    },
}
LINE_LABELS = [
    ('1', 'Picture line 1'),
    ('10', 'Picture line 2'),
    ('11', 'Picture line 3'),
]

# Sagan, Salzman Sagan and Drake (1972), Science 175, 881, Table 1, as tabulated in
# docs/research/cover.md section 2 and docs/research/data/clocks/map_decode.py:
# (1972 label, B name, J name, period in hydrogen units N). Used only to name each decoded line.
SAGAN_TABLE1 = [
    ('1642', 'B1642-03', 'J1645-0317', 550675372),
    ('1929', 'B1929+10', 'J1932+1059', 321746104),
    ('1933', 'B1933+16', 'J1935+1616', 509549854),
    ('2016', 'B2016+28', 'J2018+2839', 792520205),
    ('2217', 'B2217+47', 'J2219+4754', 764842161),
    ('0328', 'B0329+54', 'J0332+5434', 1014906390),
    ('0525', 'B0525+21', 'J0528+2200', 5320116676),
    ('0531', 'B0531+21', 'J0534+2200', 47057538),
    ('0823', 'B0823+26', 'J0826+2637', 753751947),
    ('0950', 'B0950+08', 'J0953+0755', 359455043),
    ('0833', 'B0833-45', 'J0835-4510', 126726823),
    ('1240', 'B1240-64', 'J1243-6423', 551117432),
    ('1451', 'B1451-68', 'J1456-6843', 374101871),
    ('1727', 'B1727-47', 'J1731-4744', 1178486506),
]

SVG_PROV = ('Pioneer plaque vector trace (Mysid 2006, Wikimedia Commons Pioneer_plaque.svg), extracted by '
            'tools/data/svgmap.py; the Voyager map is the Pioneer map (docs/research/cover.md 1f)')


def number(entry):
    b = entry['binary']
    assert set(b) <= {'0', '1'} and b[0] == '1'
    out = dict(entry)
    out['bits'] = len(b)
    out['valueTH'] = int(b, 2)
    return out


def build():
    svg = common.source_path('pioneer-svg')
    m = svgmap.extract_map(svg)
    R0 = m['gc']['lengthSvg']
    gc_az = m['gc']['azimuthDeg']

    lines = []
    for order, ln in enumerate(sorted(m['lines'], key=lambda l: l['axisDeg']), start=1):
        n = int(ln['bits'], 2)
        # Identify by nearest Sagan Table 1 integer (relative difference); exact for all 14.
        label, bname, jname, n_sagan = min(SAGAN_TABLE1, key=lambda r: abs(r[3] - n) / r[3])
        z = (ln['rEnd'] - ln['ticks'][-1]) / R0 if ln['ticks'] else None
        notes = []
        if bname == 'B1240-64':
            notes.append('Period known in 1972 to only 3 significant figures (0.388 s) but written to 30 bits: 1233 ppm off the true value (cover.md section 2)')
        if bname == 'B2016+28':
            notes.append('Tick-derived latitude 7.9 deg vs true 4.0: the tick looks like a trace artifact (cover.md section 2 and Could not confirm 6)')
        if z is None:
            notes.append('No tick: the line is too short to resolve one (cover.md section 2, "n.r.")')
        lines.append({
            'order': order,
            'label1972': label,
            'bname': bname,
            'jname': jname,
            'binary': ln['bits'],
            'bits': len(ln['bits']),
            'valueTH': n,
            # counter-clockwise from the DRAWN galactic-centre line (the map's own zero, cover.md 1d)
            'mapAngleDeg': round((ln['axisDeg'] - gc_az) % 360.0, 4),
            'svgAzimuthDeg': round(ln['axisDeg'], 4),
            'rOverR0': round(ln['rEnd'] / R0, 6),
            'absZOverR0': round(z, 6) if z is not None else None,
            'broken': ln['break'] is not None,
            'breakR0': [round(ln['break'][0] / R0, 6), round(ln['break'][1] / R0, 6)] if ln['break'] else None,
            'digitsAlongOwnLine': ln['digitsAlongOwnLine'],
            'notes': notes,
            'provenance': SVG_PROV + f'; identified by matching N = {n} to Sagan, Salzman Sagan and Drake (1972) Table 1 ({label})',
        })

    cover = {
        'meta': {
            'built': common.today(),
            'description': 'Every etched number on the Voyager record cover. valueTH is the exact integer; numbers are in hydrogen time units t_H = 1/1420405751.768 Hz except rasterLines and lineLabels (counts).',
            'sources': [common.source_ref('cover-photo'), common.source_ref('pioneer-svg')],
            'research': 'docs/research/cover.md sections 1 and 2',
            'svgUnits': {
                'origin': [round(v, 4) for v in m['origin']],
                'originResearch': [round(v, 4) for v in m['originResearch']],
                'originNote': 'origin: our least-squares intersection of the long radial strokes (svgmap.find_origin), used for every value here; originResearch: the undocumented origin of the research digitization, 0.55 units away (0.0003 R0), kept for reference only',
                'angleZero': 'mapAngleDeg is counter-clockwise from the drawn galactic-centre line (gcLine.svgAzimuthDeg); svgAzimuthDeg is the raw azimuth from the SVG +x axis, counter-clockwise with SVG y flipped',
            },
        },
        'record': {k: number(v) for k, v in RECORD.items()},
        'picture': {
            **{k: number(v) for k, v in PICTURE.items()},
            'lineLabels': [number({
                'binary': b,
                'meaning': meaning,
                'location': 'Top right: above each of the three picture lines in the start-of-picture diagram',
                'provenance': PHOTO + ' section 1c; matches NASA cover page and Ron Barry',
            }) for b, meaning in LINE_LABELS],
            'notes': [
                'Disputed, not a value: a small two-row label above the first raster lines. The research read it as 1, 10, 11 (lines 1 to 3); CED Magic reads 10000 = 16 ("16 grey levels"). No official source explains it (cover.md 1c, Could not confirm 4).',
            ],
        },
        'pulsarMap': {
            'gcLine': {
                'lengthSvg': round(R0, 4),
                'angleDeg': 0,
                'svgAzimuthDeg': round(m['gc']['azimuthDeg'], 4),
                'endTickLengthSvg': round(m['gc']['endTickLengthSvg'], 3),
                'meaning': 'Sun to galactic-centre distance R0; its tick is precisely at its end (z = 0); the unit of every map distance (SSD72, cover.md 1d)',
                'provenance': SVG_PROV,
            },
            'conventions': {
                'mapAngleDeg': 'counter-clockwise from the drawn galactic-centre line; equals galactic longitude (cover.md 1d); the median azimuth of the stroke midpoints of the line beyond 60 SVG units, minus gcLine.svgAzimuthDeg',
                'svgAzimuthDeg': 'raw azimuth from the SVG +x axis, counter-clockwise with SVG y flipped (lines and the centre line)',
                'rOverR0': 'solid-line length = in-plane distance d cos b, over R0',
                'absZOverR0': '|z| = distance from the outer end of the solid line back to its tick, over R0; the sign of z is not encoded (SSD72)',
                'breakR0': 'gap in the solid line, [start, end] over R0; a broken line means the distance was not accurately known (SSD72)',
                'binary': 'period in hydrogen time units; most significant bit nearest the origin',
            },
            'lines': lines,
        },
    }
    return cover


if __name__ == '__main__':
    path, size = common.write_json('cover.json', build())
    print(f'wrote {path} ({size} bytes)')
