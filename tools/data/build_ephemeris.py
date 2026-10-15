"""Build data/ephemeris.json and data/ephemeris_spotchecks.json from JPL Horizons vector tables.

Every Horizons query is one tools/sources.json entry whose URL is the full GET query (format=json),
fetched and checksummed by tools/fetch-sources.mjs into sources/<id>/. This script never touches the
network: `--register` adds the entries, fetch-sources downloads them, a plain run builds the JSON.

Query settings (docs/research/voyager.md section 3): EPHEM_TYPE VECTORS, VEC_TABLE 2 (position and
velocity), REF_PLANE FRAME (ICRF equatorial axes), OUT_UNITS KM-S, CSV, centre the Sun's body centre
500@10 (the stateRef query uses the solar-system barycentre 500@0). Vector-table times are TDB.

Run: python -P tools/data/build_ephemeris.py --register
     node tools/fetch-sources.mjs horizons-v1-30d (and the other ids, at most one every 2 s)
     python -P tools/data/build_ephemeris.py
"""
import json
import math
import os
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402

API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
CREDIT = 'JPL Horizons On-Line Ephemeris System (NASA/JPL Solar System Dynamics), https://ssd.jpl.nasa.gov/horizons/'
RESEARCH = 'docs/research/voyager.md section 3'

# Spot-check epochs: 24 epochs every 4.17 Julian years from 2001.3, each moved to an odd hour
# (1, 3, ..., 23 h TDB, cycling) so none falls on a 30-day table node.
SPOT_N = 24
JD_J2000 = 2451545.0


def spot_jds():
    out = []
    for k in range(SPOT_N):
        year = 2001.3 + 4.17 * k
        jd = JD_J2000 + (year - 2000.0) * 365.25
        day0 = math.floor(jd - 0.5) + 0.5          # the preceding 0h TDB
        hour = 1 + 2 * (k % 12)
        out.append(day0 + hour / 24.0)
    return out


def _q(params):
    base = {'format': 'json', 'OBJ_DATA': "'NO'", 'MAKE_EPHEM': "'YES'", 'EPHEM_TYPE': "'VECTORS'",
            'REF_PLANE': "'FRAME'", 'VEC_TABLE': "'2'", 'OUT_UNITS': "'KM-S'", 'CSV_FORMAT': "'YES'",
            'VEC_LABELS': "'NO'"}
    base.update(params)
    return API + '?' + urllib.parse.urlencode(base)


def queries():
    tlist = ' '.join(f"'{jd:.9f}'" for jd in spot_jds())
    q = [
        ('horizons-v1-30d', '-31', "'500@10'", {'START_TIME': "'2000-01-01'", 'STOP_TIME': "'2100-01-01'", 'STEP_SIZE': "'30 d'"},
         'ephemeris.json: Voyager 1 heliocentric state, 30-day nodes 2000-2100'),
        ('horizons-v2-30d', '-32', "'500@10'", {'START_TIME': "'2000-01-01'", 'STOP_TIME': "'2100-01-01'", 'STEP_SIZE': "'30 d'"},
         'ephemeris.json: Voyager 2 heliocentric state, 30-day nodes 2000-2100'),
        ('horizons-earth-10d', '399', "'500@10'", {'START_TIME': "'2020-01-01'", 'STOP_TIME': "'2040-01-01'", 'STEP_SIZE': "'10 d'"},
         'ephemeris.json: Earth heliocentric state, 10-day nodes 2020-2040'),
        ('horizons-v1-spot', '-31', "'500@10'", {'TLIST': tlist, 'TLIST_TYPE': "'JD'", 'TIME_TYPE': "'TDB'"},
         'ephemeris_spotchecks.json: Voyager 1 at 24 off-node epochs, to test the Hermite interpolation'),
        ('horizons-v2-spot', '-32', "'500@10'", {'TLIST': tlist, 'TLIST_TYPE': "'JD'", 'TIME_TYPE': "'TDB'"},
         'ephemeris_spotchecks.json: Voyager 2 at 24 off-node epochs, to test the Hermite interpolation'),
        ('horizons-v1-ssb-ref', '-31', "'500@0'", {'TLIST': "'2461329.291666667'", 'TLIST_TYPE': "'JD'", 'TIME_TYPE': "'TDB'"},
         'scenario.json: Voyager 1 barycentric state at 2026-10-15 19:00 TDB'),
    ]
    out = []
    for sid, cmd, center, extra, used in q:
        params = {'COMMAND': f"'{cmd}'", 'CENTER': center}
        params.update(extra)
        out.append({'id': sid, 'file': sid + '.json', 'url': _q(params), 'credit': CREDIT, 'usedFor': used,
                    'research': RESEARCH, 'body': cmd})
    return out


def parse(sid):
    """Rows (jd, x, y, z, vx, vy, vz) from a stored Horizons JSON response."""
    with open(common.source_path(sid), encoding='utf-8') as f:
        payload = json.load(f)
    text = payload['result']
    lines = text.splitlines()
    try:
        a = lines.index('$$SOE') + 1
        b = lines.index('$$EOE')
    except ValueError:
        raise SystemExit(f'{sid}: no $$SOE/$$EOE block in the Horizons response:\n' + text[:1500])
    rows = []
    for ln in lines[a:b]:
        parts = [p.strip() for p in ln.split(',')]
        if len(parts) < 8:
            continue
        rows.append((float(parts[0]),) + tuple(float(v) for v in parts[2:8]))
    signature = dict(payload.get('signature', {}))
    stamp = [l for l in lines if 'API_USER' in l]
    signature['retrieved'] = ' '.join(stamp[0].split('API_USER', 1)[1].split('/')[0].split()) if stamp else None
    source_line = [l for l in lines if l.startswith('Target body name')]
    signature['target'] = ' '.join(source_line[0].split(':', 1)[1].split()) if source_line else None
    return rows, signature


def build():
    qs = {q['id']: q for q in queries()}
    meta_q = []
    bodies = {}
    for sid, body, step in (('horizons-v1-30d', '-31', 30), ('horizons-v2-30d', '-32', 30), ('horizons-earth-10d', '399', 10)):
        rows, sig = parse(sid)
        jd0 = rows[0][0]
        for i, r in enumerate(rows):
            if abs(r[0] - (jd0 + i * step)) > 1e-6:
                raise SystemExit(f'{sid}: node {i} at JD {r[0]} is not on the {step}-day grid')
        bodies[body] = {'jd0': jd0, 'stepDays': step, 'rows': [list(r[1:]) for r in rows]}
        meta_q.append({'id': sid, 'url': qs[sid]['url'], 'sha256': common.manifest()[sid]['sha256'],
                       'rows': len(rows), 'firstJd': rows[0][0], 'lastJd': rows[-1][0], 'horizonsVersion': sig.get('version'),
                       'retrieved': sig['retrieved'], 'target': sig['target']})
    eph = {
        'meta': {
            'source': 'JPL Horizons',
            'queries': meta_q,
            'retrieved': sorted({q['retrieved'] for q in meta_q}),
            'built': common.today(),
            'frame': 'ICRF, Sun-centred',
            'units': 'km, km/s, TDB JD',
            'rowLayout': '[x, y, z, vx, vy, vz]; row i is at jd0 + i * stepDays',
            'interpolation': 'cubic Hermite on position and velocity between nodes (tools/data/checks.py tests it against off-node spot checks)',
        },
        'bodies': bodies,
    }
    checks = []
    for sid, body in (('horizons-v1-spot', '-31'), ('horizons-v2-spot', '-32')):
        rows, _ = parse(sid)
        if len(rows) != SPOT_N:
            raise SystemExit(f'{sid}: {len(rows)} rows, expected {SPOT_N}')
        for r in rows:
            checks.append({'body': body, 'jd': r[0], 'x': r[1], 'y': r[2], 'z': r[3]})
    spot = {
        'meta': {
            'source': 'JPL Horizons',
            'queries': [{'id': s, 'url': qs[s]['url'], 'sha256': common.manifest()[s]['sha256']} for s in ('horizons-v1-spot', 'horizons-v2-spot')],
            'built': common.today(),
            'frame': 'ICRF, Sun-centred',
            'units': 'km, TDB JD',
            'epochs': '24 epochs every 4.17 Julian years from 2001.3, each at an odd hour TDB (off the 30-day nodes)',
        },
        'checks': checks,
    }
    ref_rows, _ = parse('horizons-v1-ssb-ref')
    r = ref_rows[0]
    state_ref = {'jdTdb': r[0], 'posKm': list(r[1:4]), 'velKmS': list(r[4:7]),
                 'center': 'solar-system barycentre', 'frame': 'ICRF', 'source': 'JPL Horizons',
                 'query': qs['horizons-v1-ssb-ref']['url']}
    return eph, spot, state_ref


def hermite(table, jd):
    """Cubic Hermite interpolation of position (km) from position and velocity nodes."""
    step = table['stepDays']
    u = (jd - table['jd0']) / step
    i = int(math.floor(u))
    i = max(0, min(i, len(table['rows']) - 2))
    t = u - i
    a, b = table['rows'][i], table['rows'][i + 1]
    h = step * 86400.0
    h00 = 2 * t ** 3 - 3 * t ** 2 + 1
    h10 = t ** 3 - 2 * t ** 2 + t
    h01 = -2 * t ** 3 + 3 * t ** 2
    h11 = t ** 3 - t ** 2
    return [h00 * a[k] + h10 * h * a[k + 3] + h01 * b[k] + h11 * h * b[k + 3] for k in range(3)]


if __name__ == '__main__':
    if '--register' in sys.argv:
        print('added', common.register_sources(queries()))
        sys.exit(0)
    eph, spot, ref = build()
    p, s = common.write_json('ephemeris.json', eph, compact=True)
    print(f'wrote {p} ({s} bytes)')
    p, s = common.write_json('ephemeris_spotchecks.json', spot)
    print(f'wrote {p} ({s} bytes)')
    print('Voyager 1 barycentric state at', ref['jdTdb'], ref['posKm'], ref['velKmS'])
