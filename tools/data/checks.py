"""Checks for the built data files (data/*.json) against the research numbers and independent sources.

One PASS/FAIL line per check; exit code 1 if any check fails. Expected values are typed here from
the research files with a citation on each; they are never read back from the builders' output.

Run: python -P tools/data/checks.py
"""
import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import svgmap  # noqa: E402

T0 = time.time()
FAILS = []


def check(name, ok, detail=''):
    print(f"{'PASS' if ok else 'FAIL'}  {name}{('  ' + detail) if detail else ''}")
    if not ok:
        FAILS.append(name)


def load(name):
    with open(os.path.join(common.DATA, name), encoding='utf-8') as f:
        return json.load(f)


# Hydrogen hyperfine frequency used by Sagan, Salzman Sagan and Drake (1972) to convert periods
# (docs/research/cover.md "Units": 1.420405752e9 per second [SSD72]); modern value 1420405751.768 Hz.
F_H_SAGAN = 1.420405752e9
F_H = 1420405751.768

# The 14 map binaries as transcribed INDEPENDENTLY by Robert Johnston from the Voyager diagram in
# Murmurs of Earth p. 58 (docs/research/cover.md section 2, column "Binary"), with Sagan, Salzman Sagan
# and Drake (1972) Table 1 N and period (1970/71 epoch), and ATNF v2.9.0 l, b and DIST (cover.md
# section 2 and clocks.md Table 2B).
# (bname, jname, binary, N, P_1970 (s), true l (deg), true b (deg), DIST best (kpc), decimals quoted)
MAP = [
    ('B1642-03', 'J1645-0317', '100000110100101010001110101100', 550675372, 0.3876887790, 14.114, 26.062, 4.0, 1),
    ('B1929+10', 'J1932+1059', '10011001011010111010010111000', 321746104, 0.2265170380, 47.382, -3.885, 0.31, 2),
    ('B1933+16', 'J1935+1616', '11110010111110001110100011110', 509549854, 0.3587354200, 52.436, -2.093, 3.7, 1),
    ('B2016+28', 'J2018+2839', '101111001111001110011000001101', 792520205, 0.5579533900, 68.099, -3.983, 0.98, 2),
    ('B2217+47', 'J2219+4754', '101101100101101001000010110001', 764842161, 0.5384673780, 98.385, -7.598, 2.383, 3),
    ('B0329+54', 'J0332+5434', '111100011111100011111000010110', 1014906390, 0.7145186424, 144.995, -1.221, 1.68, 2),
    ('B0525+21', 'J0528+2200', '100111101000110101000100111000100', 5320116676, 3.745490800, 183.856, -6.896, 1.215, 3),
    ('B0531+21', 'J0534+2200', '10110011100000101010000010', 47057538, 0.03312964500, 184.557, -5.784, 2.0, 1),
    ('B0823+26', 'J0826+2637', '101100111011010101011110001011', 753751947, 0.5306595990, 196.964, 31.743, 0.50, 2),
    ('B0950+08', 'J0953+0755', '10101011011001101100101000011', 359455043, 0.2530650432, 228.908, 43.697, 0.261, 3),
    ('B0833-45', 'J0835-4510', '111100011011011001010100111', 126726823, 0.08921874790, 263.552, -2.787, 0.28, 2),
    ('B1240-64', 'J1243-6423', '100000110110010110001001111000', 551117432, 0.3880000000, 302.051, -1.532, 2.0, 1),
    ('B1451-68', 'J1456-6843', '10110010011000101011101101111', 374101871, 0.2633767640, 313.868, -8.543, 0.43, 2),
    ('B1727-47', 'J1731-4744', '1000110001111100100011011101010', 1178486506, 0.8296830000, 342.565, -7.669, 0.70, 2),
]

# The research's own Pioneer-SVG digitization, which our extraction must reproduce:
# angles from docs/research/data/cover/pioneer_svg_lines.json ("th"; 301.6 is B1240-64's line, its
# digit track is the 300.604 group), solid-line end and tick radii from decode_svg.py's `solid` table,
# centre line 2032.3 units (decode_svg.py GC).
RESEARCH_GC = 2032.3
RESEARCH_SVG = {
    'B1642-03': (14.065, 159.6, 83.6), 'B1929+10': (47.966, 20.5, None), 'B1933+16': (52.863, 825.1, 796.1),
    'B2016+28': (68.795, 76.6, 66.0), 'B2217+47': (98.077, 225.2, 198.8), 'B0329+54': (144.757, 138.5, 134.4),
    'B0525+21': (182.478, 252.1, 221.7), 'B0531+21': (185.502, 395.8, 356.9), 'B0823+26': (198.27, 83.3, 32.9),
    'B0950+08': (230.804, 15.8, None), 'B0833-45': (264.789, 331.0, 310.1), 'B1240-64': (301.6, 1142.5, 1123.8),
    'B1451-68': (311.248, 41.9, 36.8), 'B1727-47': (342.825, 611.8, 542.0),
}


def check_cover(pulsars_by_j):
    c = load('cover.json')
    rec, pic = c['record'], c['picture']
    # docs/research/cover.md 1b/1c decimal values and times.
    check('cover rotation period = 5,113,380,864 t_H = 3.59994 s',
          rec['rotationPeriod']['valueTH'] == 5113380864 and abs(5113380864 / F_H - 3.59994) < 5e-6,
          f"{rec['rotationPeriod']['valueTH'] / F_H:.6f} s")
    check('cover play time = 4,587,025,072,128 t_H = 3229.4 s (53.82 min)',
          rec['playTime']['valueTH'] == 4587025072128 and abs(4587025072128 / F_H - 3229.4) < 0.05,
          f"{rec['playTime']['valueTH'] / F_H:.2f} s")
    check('cover line time = 11,845,632 t_H = 8.3396 ms',
          pic['lineTime']['valueTH'] == 11845632 and abs(11845632 / F_H - 8.3396e-3) < 5e-8,
          f"{pic['lineTime']['valueTH'] / F_H * 1e3:.4f} ms")
    check('cover raster = 512 lines', pic['rasterLines']['valueTH'] == 512)
    check('cover line labels = 1, 2, 3', [x['valueTH'] for x in pic['lineLabels']] == [1, 2, 3])
    for sect in (rec, {k: v for k, v in pic.items() if isinstance(v, dict)}):
        for k, v in sect.items():
            ok = v['bits'] == len(v['binary']) and v['valueTH'] == int(v['binary'], 2) and all(f in v for f in ('meaning', 'location', 'provenance'))
            check(f'cover {k}: bits and valueTH consistent, provenance present', ok)

    pm = c['pulsarMap']
    lines = {ln['bname']: ln for ln in pm['lines']}
    # Method test: the same extraction run from the research's origin must reproduce the research's raw
    # SVG azimuths to 0.01 deg (proves the stroke grouping and axis rule, independent of the origin).
    svg = common.source_path('pioneer-svg')
    with_research_origin = {round(l['axisDeg'], 6): l for l in svgmap.extract_map(svg, origin=svgmap.RESEARCH_ORIGIN)['lines']}
    by_bits_r = {l['bits']: l for l in with_research_origin.values()}
    gc_az = pm['gcLine']['svgAzimuthDeg']
    worst_vs_research = worst_vs_l = 0.0
    check('cover map has 14 lines in counter-clockwise order 1..14',
          len(pm['lines']) == 14 and [ln['order'] for ln in pm['lines']] == list(range(1, 15))
          and all(pm['lines'][i]['mapAngleDeg'] < pm['lines'][i + 1]['mapAngleDeg'] for i in range(13)))
    for bname, jname, binary, n, p70, l_true, _b, _d, _dec in MAP:
        ln = lines.get(bname)
        if ln is None:
            check(f'{bname} on the map', False)
            continue
        check(f'{bname} binary equals Johnston transcription (cover.md 2)', ln['binary'] == binary and ln['jname'] == jname)
        check(f'{bname} decodes to Sagan Table 1 N = {n}', ln['valueTH'] == n and ln['bits'] == len(binary))
        # Sagan 1972 Table 1 periods are N / 1.420405752e9 rounded to their printed digits; 1e-9 s is
        # the M1 plan tolerance (docs/plans/M1.md step 2).
        check(f'{bname} period N/f_H within 1e-9 s of Sagan Table 1 ({p70} s)', abs(n / F_H_SAGAN - p70) < 1e-9,
              f'{n / F_H_SAGAN:.10f}')
        # cover.md section 2: every map angle is within about 0.2 to 2.7 deg of galactic longitude;
        # the check uses the 3 deg bound from docs/plans/M1.md step 2.
        gl = pulsars_by_j[jname]['gl']
        d = abs((ln['mapAngleDeg'] - gl + 180) % 360 - 180)
        worst_vs_l = max(worst_vs_l, d)
        check(f'{bname} map angle within 3 deg of catalogue l', d < 3.0, f'{ln["mapAngleDeg"]:.3f} vs {gl:.3f} (diff {d:.2f})')
        th, r_end, tick = RESEARCH_SVG[bname]
        R0 = pm['gcLine']['lengthSvg']
        lr = by_bits_r[ln['binary']]
        check(f'{bname} method: from the research origin the extraction gives the research angle within 0.01 deg',
              abs(lr['axisDeg'] - th) < 0.01, f"{lr['axisDeg']:.4f}/{th}")
        # Published angle vs the research angle. Two known, measured differences: (1) our origin is
        # 0.55 units (0.0003 R0) from the research's, which turns each line by the amount measured just
        # above (largest for short lines whose marks sit near the origin: 0.12 deg for B0950+08); (2) we
        # measure from the drawn centre line, whose own azimuth is gc_az (0.099 deg), the research from
        # SVG +x. Tolerance = those two for this line plus 0.01 deg (the method tolerance).
        origin_turn = abs(ln['svgAzimuthDeg'] - lr['axisDeg'])
        tol = origin_turn + abs(gc_az) + 0.01
        d_r = abs((ln['mapAngleDeg'] - th + 180) % 360 - 180)
        worst_vs_research = max(worst_vs_research, d_r)
        ok_a = d_r <= tol
        ok_r = abs(ln['rOverR0'] - r_end / RESEARCH_GC) < 0.001
        if tick is None:
            ok_z = ln['absZOverR0'] is None
        else:
            ok_z = ln['absZOverR0'] is not None and abs(ln['absZOverR0'] - (r_end - tick) / RESEARCH_GC) < 0.001
        check(f'{bname} SVG geometry matches the research (angle within origin turn + centre-line azimuth + 0.01 deg; r and |z| 0.001 R0)', ok_a and ok_r and ok_z,
              f'angle {ln["mapAngleDeg"]:.4f}/{th} (diff {d_r:.3f}, tol {tol:.3f}), r {ln["rOverR0"]:.4f}/{r_end / RESEARCH_GC:.4f}, '
              f'z {ln["absZOverR0"]}/{None if tick is None else round((r_end - tick) / RESEARCH_GC, 4)}')
    print(f'      max angle difference: vs research {worst_vs_research:.3f} deg, vs catalogue l {worst_vs_l:.2f} deg')
    # The centre line runs along SVG +x, so moving the origin along x changes R0 by up to the origin
    # shift; 0.1 units covers the research's 0.1-unit rounding.
    shift = math.dist(c['meta']['svgUnits']['origin'], c['meta']['svgUnits']['originResearch'])
    check('centre line length matches the research (2032.3 units, within the origin shift + 0.1)',
          abs(pm['gcLine']['lengthSvg'] - RESEARCH_GC) <= shift + 0.1, f"{pm['gcLine']['lengthSvg']} (origin shift {shift:.3f})")
    # cover.md 1d: only the Crab line is continuous; B0950+08 and B1929+10 end before the break radius.
    broken = sorted(b for b, ln in lines.items() if ln['broken'])
    check('broken lines: all except Crab, B0950+08, B1929+10 (cover.md 1d)',
          broken == sorted(set(lines) - {'B0531+21', 'B0950+08', 'B1929+10'}))
    check('only B1240-64 has digits along its own line (cover.md 1d)',
          [b for b, ln in lines.items() if ln['digitsAlongOwnLine']] == ['B1240-64'])


def check_pulsars():
    p = load('pulsars.json')
    check('pulsars: 4,503 in ATNF v2.9.0 (clocks.md section 1)', p['meta']['count'] == 4503 and len(p['pulsars']) == 4503
          and p['meta']['catalogue'] == 'ATNF v2.9.0')
    by_j = {x['jname']: x for x in p['pulsars']}
    check('pulsars: J names unique', len(by_j) == len(p['pulsars']))
    missing = [m[1] for m in MAP if m[1] not in by_j or by_j[m[1]]['bname'] != m[0]]
    check('pulsars: the 14 map pulsars present with expected J and B names', not missing, str(missing))
    worst_l = worst_b = 0.0
    dist_bad = []
    for bname, jname, *_rest in MAP:
        _binary, _n, _p, l_true, b_true, dist, dec = _rest
        x = by_j[jname]
        worst_l = max(worst_l, abs((x['gl'] - l_true + 180) % 360 - 180))
        worst_b = max(worst_b, abs(x['gb'] - b_true))
        if round(x['dist'], dec) != round(dist, dec):
            dist_bad.append(f"{bname} {x['dist']} vs {dist}")
    # cover.md section 2 "true l" and clocks.md Table 2B l, b are quoted to 0.001 deg.
    check('pulsars: computed l, b of the 14 within 0.01 deg of the research (cover.md 2, clocks.md 2B)',
          worst_l < 0.01 and worst_b < 0.01, f'worst dl {worst_l:.4f}, db {worst_b:.4f}')
    check('pulsars: DIST of the 14 equals clocks.md Table 2B to its quoted digits', not dist_bad, '; '.join(dist_bad))
    # clocks.md Table 2A spin values (ATNF v2.9.0).
    spin = {'J0835-4510': (0.089328385024, 1.25008e-13), 'J0534+2200': (0.0333924123, 4.20972e-13),
            'J0332+5434': (0.714519699726, 2.048265e-15), 'J1731-4744': (0.82994561219, 1.636354e-13)}
    # P0 compared at the digits Table 2A prints; P1 to 1e-5 relative (Table 2A prints 6 figures).
    ok = all(round(by_j[j]['p0'], len(repr(p0).split('.')[1])) == p0 and abs(by_j[j]['p1'] - p1) / p1 < 1e-5 for j, (p0, p1) in spin.items())
    check('pulsars: P0, P1 of Vela, Crab, B0329+54, B1727-47 equal clocks.md Table 2A', ok)
    # clocks.md Table 2B parallax errors: Vela 3.5 +/- 0.2, B0950+08 3.82 +/- 0.07, B1929+10 2.77 +/- 0.07 mas.
    check('pulsars: pxErr of Vela, B0950+08, B1929+10 equal clocks.md Table 2B',
          by_j['J0835-4510'].get('pxErr') == 0.2 and by_j['J0953+0755'].get('pxErr') == 0.07 and by_j['J1932+1059'].get('pxErr') == 0.07)
    nfill = sum(1 for x in p['pulsars'] if (x['p0'] is None) != (x['f0'] is None))
    check('pulsars: P0 and F0 are filled together', nfill == 0)
    return by_j


def check_glitches():
    g = load('glitches.json')
    check('glitches: all 14 map pulsars keyed', sorted(g['pulsars']) == sorted(m[1] for m in MAP))
    vela = g['pulsars']['J0835-4510']

    def year(mjd):
        return 2000.0 + (mjd - 51544.5) / 365.25
    sel = [x for x in vela if 1971.0 <= year(x['mjd']) < 2026.0]
    s = sum(x['dfOverF'] for x in sel)
    # clocks.md 3b: "Vela's 25 glitches 1971-2026 (sum dnu/nu = 4.0e-5)" (quoted to 2 figures).
    check('glitches: Vela 1971.0-2026.0 has 25 glitches summing 4.0e-5 (clocks.md 3b)', len(sel) == 25 and abs(s - 4.0e-5) < 0.05e-5,
          f'{len(sel)} glitches, sum {s:.4e}')
    # clocks.md 3a: "adding back 14 glitches (sum dnu/nu = 1.96e-5)": glitches 2 to 15 (MJD 41192 to
    # 51457), the ones after the map epoch region and before ATNF's PEPOCH glitch at MJD 51559.319.
    sel2 = [x for x in vela if 41000 < x['mjd'] < 51559.0]
    s2 = sum(x['dfOverF'] for x in sel2)
    check('glitches: Vela glitches between 1971 and the PEPOCH glitch: 14 summing 1.96e-5 (clocks.md 3a)',
          len(sel2) == 14 and abs(s2 - 1.96e-5) < 0.005e-5, f'{len(sel2)} glitches, sum {s2:.4e}')
    check('glitches: dF/F stored dimensionless (largest Vela glitch below 1e-5)', max(x['dfOverF'] for x in vela) < 1e-5)


def check_crab():
    c = load('crab.json')
    last = c['rows'][-1]
    # clocks.md 3a: "Jodrell Bank, 2026-07-24: nu = 29.5357554730 Hz".
    check('crab: latest row 2026-07-24 (MJD 61245) nu = 29.5357554730 Hz', last['mjd'] == 61245 and abs(last['nu'] - 29.5357554730) < 1e-10,
          f"{last['date']} {last['nu']}")
    mjds = [r['mjd'] for r in c['rows']]
    check('crab: rows strictly increasing in MJD, nuDot negative', all(a < b for a, b in zip(mjds, mjds[1:])) and all(r['nuDot'] < 0 for r in c['rows']))


def hermite(table, jd):
    step = table['stepDays']
    u = (jd - table['jd0']) / step
    i = max(0, min(int(math.floor(u)), len(table['rows']) - 2))
    t = u - i
    a, b = table['rows'][i], table['rows'][i + 1]
    h = step * 86400.0
    h00, h10, h01, h11 = 2 * t ** 3 - 3 * t ** 2 + 1, t ** 3 - 2 * t ** 2 + t, -2 * t ** 3 + 3 * t ** 2, t ** 3 - t ** 2
    return [h00 * a[k] + h10 * h * a[k + 3] + h01 * b[k] + h11 * h * b[k + 3] for k in range(3)]


def check_ephemeris():
    e = load('ephemeris.json')
    s = load('ephemeris_spotchecks.json')
    for body, n in (('-31', 1218), ('-32', 1218)):
        b = e['bodies'][body]
        last = b['jd0'] + b['stepDays'] * (len(b['rows']) - 1)
        # voyager.md 3: 30-day nodes over 2000-2100 are about 1,218 rows; coverage ends 2100-JAN-01 (JD 2488069.5).
        check(f'ephemeris {body}: {n} rows at 30 days from 2000-01-01, last node inside coverage',
              len(b['rows']) == n and b['jd0'] == 2451544.5 and last <= 2488069.5)
    worst = 0.0
    for c in s['checks']:
        p = hermite(e['bodies'][c['body']], c['jd'])
        worst = max(worst, math.dist(p, (c['x'], c['y'], c['z'])))
    # Tolerance 100 km from the M1 data spec (voyager.md 3: the research measured 1.9 km at 30-day nodes).
    check('ephemeris: Hermite interpolation matches 48 Horizons spot checks within 100 km', len(s['checks']) == 48 and worst < 100.0,
          f'max error {worst:.2f} km')


def check_stars():
    st = load('stars.json')
    near = st['near']
    sun = [x for x in near if x['id'] == 0]
    check('stars: the Sun (id 0) at the origin, at rest',
          len(sun) == 1 and sun[0]['name'] == 'Sol' and sun[0]['distPc'] == 0.0 and sun[0]['pmraMasYr'] == 0.0 and sun[0]['rvKmS'] == 0.0)
    g = [x for x in near if x['hip'] == 57544]
    ok = len(g) == 1 and g[0]['astrometrySource'] == 'gaia-dr3' and g[0]['epoch'] == 2016.0
    if ok:
        x = g[0]
        # voyager.md 5: DR3 parallax 190.33 mas, RV -111.50 km/s (quoted to 0.01).
        ok = abs(x['parallaxMas'] - 190.33) < 0.005 and abs(x['rvKmS'] - (-111.50)) < 0.005 \
            and all(x.get(k) is not None and x[k] > 0 for k in ('parallaxErrMas', 'pmraErrMasYr', 'pmdecErrMasYr', 'rvErrKmS'))
    check('stars: Gliese 445 from Gaia DR3 (parallax 190.33 mas, RV -111.50 km/s, errors present)', ok,
          f"plx {g[0]['parallaxMas']:.3f}, rv {g[0]['rvKmS']:.3f}" if g else 'missing')
    check('stars: near list within 30 pc, sorted by distance', all(0 <= x['distPc'] <= 30 for x in near)
          and all(a['distPc'] <= b['distPc'] for a, b in zip(near, near[1:])))
    check('stars: stars.json holds meta and near only (sky split out)', sorted(st) == ['meta', 'near'])
    sky = load('sky.json')
    mi = sky['columns'].index('mag')
    check('sky: rows have mag <= 6.5, same fields as near', all(r[mi] <= 6.5 for r in sky['rows']) and len(sky['rows']) > 5000
          and set(sky['columns']) == set(near[1]) and all(len(r) == len(sky['columns']) for r in sky['rows']))
    sc = load('scenario.json')
    check('scenario: Gliese 445 Gaia source_id matches stars.json', sc['homeStar']['gaiaDr3SourceId'] == g[0].get('gaiaDr3SourceId'))
    r = sc['craft']['stateRef']
    speed = math.sqrt(sum(v * v for v in r['velKmS']))
    au = math.sqrt(sum(v * v for v in r['posKm'])) / 149597870.7
    # voyager.md 3: Voyager 1 on 2026-10-15 19:00 TDB is 172.061 AU from the Sun at 16.918 km/s; from the
    # barycentre the numbers differ by the Sun's barycentric offset (under 0.01 AU, about 0.01 km/s).
    check('scenario: Voyager 1 barycentric state is about 172.06 AU at about 16.92 km/s (voyager.md 3)',
          abs(au - 172.061) < 0.02 and abs(speed - 16.918) < 0.03, f'{au:.3f} AU, {speed:.3f} km/s')


def check_sizes():
    for name in sorted(os.listdir(common.DATA)):
        if name.endswith('.json'):
            size = os.path.getsize(os.path.join(common.DATA, name))
            # Project rule for data files: under 2 MB (2,000,000 bytes) each.
            check(f'size: data/{name} under 2 MB', size < 2_000_000, f'{size:,} bytes')


if __name__ == '__main__':
    by_j = check_pulsars()
    check_cover(by_j)
    check_glitches()
    check_crab()
    check_ephemeris()
    check_stars()
    check_sizes()
    print(f'{"FAILED " + str(len(FAILS)) if FAILS else "ALL PASSED"} ({time.time() - T0:.1f} s)')
    sys.exit(1 if FAILS else 0)
