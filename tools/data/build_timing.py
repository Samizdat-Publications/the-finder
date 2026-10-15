"""Build data/glitches.json (Jodrell Bank glitch catalogue, sources/jbo-glitches/gTable.html) and
data/crab.json (Jodrell Bank Crab monthly ephemeris, sources/jbo-crab/crab2.txt).

Glitch table columns (header rows of gTable.html): row number, pulsar name, J-name (without the J),
glitch number, MJD, +/- (days), dF/F (1e-9), +/- (1e-9), dF1/F1 (1e-3), +/- (1e-3), references.
"X" means not given. Values are converted to plain dimensionless numbers here.

Crab ephemeris columns (two header blocks in crab2.txt): date, MJD, [t_MIT (s), until late 2011],
t_JPL (s), t_acc (microseconds), nu (Hz), sigma_nu (units of the last quoted digit of nu), nudot
(1e-15 s^-2), sigma_nudot (1e-15 s^-2), DM (pc cm^-3; in parentheses when carried over, not measured
that month), [DMdot (pc cm^-3 per yr), from December 2011], tau_408 (microseconds), optional note.

Run: python -P tools/data/build_timing.py
"""
import html
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import build_cover  # noqa: E402

MAP_J = [row[2] for row in build_cover.SAGAN_TABLE1]


def _f(s):
    s = s.strip()
    if s in ('', 'X', '-'):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def build_glitches():
    path = common.source_path('jbo-glitches')
    with open(path, encoding='utf-8', errors='replace') as f:
        text = f.read()
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', text, re.S)
    total = None
    table = {j: [] for j in MAP_J}
    for r in rows:
        cells = [html.unescape(re.sub(r'<[^>]+>', '', c)).strip() for c in re.findall(r'<td[^>]*>(.*?)</td>', r, re.S)]
        if len(cells) < 11:
            continue
        if cells[1] == 'Glitch Table':
            total = int(cells[2])
            continue
        if not cells[0].isdigit():
            continue
        jname = 'J' + cells[2]
        if jname not in table:
            continue
        mjd = _f(cells[4])
        df = _f(cells[6])
        if mjd is None or df is None:
            raise SystemExit(f'glitch row without MJD or dF/F: {cells}')
        dfe, df1, df1e = _f(cells[7]), _f(cells[8]), _f(cells[9])
        table[jname].append({
            'n': int(cells[3]),
            'mjd': mjd,
            'mjdErr': _f(cells[5]),
            'dfOverF': df * 1e-9,
            'dfOverFErr': dfe * 1e-9 if dfe is not None else None,
            'df1OverF1': df1 * 1e-3 if df1 is not None else None,
            'df1OverF1Err': df1e * 1e-3 if df1e is not None else None,
            'ref': cells[10],
        })
    for j in table:
        table[j].sort(key=lambda g: g['mjd'])
    return {
        'meta': {
            'source': common.source_ref('jbo-glitches'),
            'citation': 'Basu, A. et al. (2022), MNRAS 510, 4049; Jodrell Bank Centre for Astrophysics glitch catalogue, https://www.jb.man.ac.uk/pulsar/glitches/gTable.html',
            'catalogueGlitches': total,
            'built': common.today(),
            'units': 'mjd days (MJD); dfOverF, df1OverF1 dimensionless (converted from the table\'s 1e-9 and 1e-3 units); null where the table has X',
            'scope': 'the 14 pulsars on the record cover\'s map, keyed by J name (an empty list means no glitch in the table)',
        },
        'pulsars': table,
    }


MONTHS = 'JAN FEB MAR APR MAY JUN JUL JLY AUG SEP OCT NOV DEC'.split()


def build_crab():
    path = common.source_path('jbo-crab')
    with open(path, encoding='latin-1') as f:
        lines = f.read().splitlines()
    rows = []
    for line in lines:
        m = re.match(r'^\s*(\d{2}) ([A-Z]{3}) (\d{2})\s+(\d{5})\s+(.*)$', line)
        if not m or m.group(2) not in MONTHS:
            continue
        rest = m.group(5)
        note = None
        mn = re.search(r'\(note (\d+)\)', rest)
        if mn:
            note = int(mn.group(1))
            rest = rest[:mn.start()]
        rest = rest.replace(')100', ') 100')  # one row has no space before tau_408
        tok = rest.split()
        inu = next(i for i, t in enumerate(tok) if re.match(r'^\d{2}\.\d{6,}$', t))
        nu_s = tok[inu]
        decimals = len(nu_s.split('.')[1])

        def dm_val(t):
            return float(t.strip('()')), t.startswith('(')
        dm, dm_carried = dm_val(tok[inu + 4])
        after = tok[inu + 5:]
        dmdot = None
        dmdot_carried = None
        tau = None
        if inu == 2:  # format from December 2011: t_JPL t_acc nu sig nudot sig DM DMdot tau
            if len(after) >= 2:
                dmdot, dmdot_carried = dm_val(after[0])
                tau = float(after[1])
            elif len(after) == 1:
                tau = float(after[0])
        else:
            tau = float(after[0]) if after else None
        t_mit = tok[0] if inu == 3 else None
        rows.append({
            'date': f'{m.group(1)} {m.group(2)} {m.group(3)}',
            'mjd': float(m.group(4)),
            'tMitSec': _f(t_mit) if t_mit and 'x' not in t_mit else None,
            'tJplSec': float(tok[inu - 2]),
            'tAccUs': float(tok[inu - 1]),
            'nu': float(nu_s),
            'nuErr': int(tok[inu + 1]) * 10.0 ** (-decimals),
            'nuDot': float(tok[inu + 2]) * 1e-15,
            'nuDotErr': float(tok[inu + 3]) * 1e-15,
            'dm': dm,
            'dmCarried': dm_carried,
            'dmDot': dmdot,
            'tau408Us': tau,
            'note': note,
        })
    rows.sort(key=lambda r: r['mjd'])
    return {
        'meta': {
            'source': common.source_ref('jbo-crab'),
            'citation': 'Lyne, A. G., Pritchard, R. S. and Graham-Smith, F. (1993), MNRAS 265, 1003; Jodrell Bank Crab Pulsar Monthly Ephemeris, https://www.jb.man.ac.uk/~pulsar/crab.html',
            'built': common.today(),
            'columns': {
                'date': 'calendar date as printed (DD MON YY)',
                'mjd': 'epoch of the ephemeris (MJD, UTC day)',
                'tMitSec': 'arrival time of a pulse at the MIT reference (s after 0h UTC); printed until 2011, null after or when not given',
                'tJplSec': 'arrival time of a pulse at the solar-system barycentre using the JPL ephemeris (s after 0h UTC)',
                'tAccUs': 'accuracy of the arrival time (microseconds)',
                'nu': 'barycentric rotation frequency (Hz)',
                'nuErr': 'uncertainty of nu (Hz), from sigma_nu in units of the last quoted digit',
                'nuDot': 'frequency derivative (Hz/s), converted from 1e-15 s^-2',
                'nuDotErr': 'uncertainty of nuDot (Hz/s)',
                'dm': 'dispersion measure (pc cm^-3)',
                'dmCarried': 'true when the file prints DM in parentheses (not measured that month, carried over)',
                'dmDot': 'DM rate (pc cm^-3 per year), printed from December 2011; null before',
                'tau408Us': 'scattering time at 408 MHz (microseconds)',
                'note': 'the file\'s "(note N)" marker, or null; the notes themselves are not in crab2.txt',
            },
        },
        'rows': rows,
    }


if __name__ == '__main__':
    p, s = common.write_json('glitches.json', build_glitches())
    print(f'wrote {p} ({s} bytes)')
    p, s = common.write_json('crab.json', build_crab(), rows_key='rows')
    print(f'wrote {p} ({s} bytes)')
