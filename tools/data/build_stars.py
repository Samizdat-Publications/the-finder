"""Build data/stars.json from HYG v4.2 (sources/hyg/hyg_v42.csv.gz) with Gliese 445 from Gaia DR3.

HYG columns (https://codeberg.org/astronexus/hyg): id, hip, hd, hr, gl, bf, proper, ra (hours),
dec (deg), dist (pc; 100000 means unknown), pmra and pmdec (mas/yr), rv (km/s), mag, absmag, spect,
ci, x/y/z, vx/vy/vz (pc and pc/yr, equatorial), rarad/decrad/pmrarad/pmdecrad, ... HYG positions are
for epoch and equinox J2000.

Decisions (documented in data/README.md):
- pmra includes the cos(dec) factor (mu_alpha*). Checked: HYG's own vx, vy, vz for Gliese 445 are
  reproduced to 4 significant figures only when pmra is taken as mu_alpha*.
- rv: HYG stores 0.0 when no radial velocity is known, so rv == 0.0 is stored as null. A real radial
  velocity of exactly 0.0 km/s at HYG's 0.1 km/s resolution would be lost; that is accepted.
- dist 100000 (unknown) is stored as distPc null; such stars can only be in "sky".
- Companions: a star with no radial velocity whose HYG comp_primary (the system's primary) has one takes
  the primary's, flagged rvFromPrimary (near list only). A bound companion shares the system's velocity to
  within its orbital speed (Sirius B about Sirius A: a few km/s), far below the trail's tens of km/s; this
  fills Sirius B and Procyon B among others. Systems whose primary has none (GJ 1245 A and B) stay null.
- Gliese 445: ra, dec, parallax, pmra, pmdec, radial_velocity and their 1-sigma errors from the Gaia
  DR3 row (epoch J2016.0) override the HYG row; distPc = 1000 / parallax.

Run: python -P tools/data/build_stars.py --register   (once: adds the Gaia query to tools/sources.json)
     node tools/fetch-sources.mjs gaia-gl445
     python -P tools/data/build_stars.py
"""
import csv
import gzip
import json
import os
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402

NEAR_PC = 30.0      # pc; PLAN.md / M1 step 3: stars within 30 pc with full astrometry
SKY_MAG = 6.5       # apparent V magnitude limit for the naked-eye sky
HYG_EPOCH = 2000.0  # HYG positions: epoch and equinox J2000 (HYG README)
GAIA_EPOCH = 2016.0  # Gaia DR3 reference epoch J2016.0 (ref_epoch column; checked below)

# Gliese 445's HYG v4.2 row: HIP 57544, "Gl 445" (id 57371). The Gaia cone is centred on its J2000
# position (RA 11.794333 h = 176.914995 deg, Dec 78.69116 deg), radius 0.02 deg (72 arcsec), wide
# enough for 16 years of its 0.89 arcsec/yr proper motion, with parallax > 100 mas to exclude
# background stars.
GL445_HIP = 57544
GAIA_ADQL = (
    "SELECT source_id, ref_epoch, ra, ra_error, dec, dec_error, parallax, parallax_error, "
    "pmra, pmra_error, pmdec, pmdec_error, radial_velocity, radial_velocity_error, "
    "phot_g_mean_mag, ruwe "
    "FROM gaiadr3.gaia_source "
    "WHERE 1=CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', 176.914995, 78.69116, 0.02)) "
    "AND parallax > 100"
)
GAIA_URL = 'https://gea.esac.esa.int/tap-server/tap/sync?' + urllib.parse.urlencode(
    {'REQUEST': 'doQuery', 'LANG': 'ADQL', 'FORMAT': 'csv', 'QUERY': GAIA_ADQL})

GAIA_SOURCE = {
    'id': 'gaia-gl445',
    'file': 'gl445_gaia_dr3.csv',
    'url': GAIA_URL,
    'credit': 'ESA/Gaia/DPAC, Gaia Data Release 3 (Gaia Collaboration, Vallenari et al. 2023, A&A 674, A1), via the ESA Gaia archive TAP service',
    'usedFor': 'stars.json: Gliese 445 astrometry and radial velocity (overrides HYG)',
    'research': 'docs/research/voyager.md section 5 (Gaia DR3 recheck: parallax 190.33 mas, RV -111.50 km/s)',
}


def _f(s):
    s = (s or '').strip()
    return float(s) if s else None


def _i(s):
    s = (s or '').strip()
    return int(s) if s else None


def _s(s):
    s = (s or '').strip()
    return s if s else None


def read_gaia():
    path = common.source_path('gaia-gl445')
    with open(path, encoding='utf-8') as f:
        rows = list(csv.DictReader(f))
    if len(rows) != 1:
        raise SystemExit(f'Gaia query for Gliese 445 returned {len(rows)} rows; expected exactly 1')
    return rows[0]


def build():
    gaia = read_gaia()
    if float(gaia['ref_epoch']) != GAIA_EPOCH:
        raise SystemExit(f"unexpected Gaia ref_epoch {gaia['ref_epoch']}")
    near, sky = [], []
    companions, rv_by_id = [], {}
    gl445 = None
    with gzip.open(common.source_path('hyg'), 'rt', encoding='utf-8', newline='') as f:
        for r in csv.DictReader(f):
            hid = int(r['id'])
            dist = float(r['dist'])
            mag = float(r['mag'])
            known = dist < 100000.0
            rv = _f(r['rv'])
            star = {
                'id': hid,
                'name': _s(r['proper']),
                'gl': _s(r['gl']),
                'hip': _i(r['hip']),
                'hd': _i(r['hd']),
                'raDeg': round(float(r['ra']) * 15.0, 9),  # HYG gives RA hours to 6 decimals; 9 decimals of a degree keeps it exactly
                'decDeg': float(r['dec']),
                'distPc': dist if known else None,
                'pmraMasYr': float(r['pmra']),
                'pmdecMasYr': float(r['pmdec']),
                'rvKmS': rv if rv not in (None, 0.0) else None,
                'mag': mag,
                'absmag': _f(r['absmag']),
                'spect': _s(r['spect']),
                'ci': _f(r['ci']),
                'astrometrySource': 'hyg',
                'epoch': HYG_EPOCH,
            }
            primary = _i(r['comp_primary'])
            if primary is not None and primary != hid:
                companions.append((star, primary))
            if star['rvKmS'] is not None:
                rv_by_id[hid] = star['rvKmS']
            if hid == 0:
                # The Sun: the frame origin (solar-system barycentre), at rest.
                star.update({'raDeg': 0.0, 'decDeg': 0.0, 'distPc': 0.0, 'pmraMasYr': 0.0, 'pmdecMasYr': 0.0, 'rvKmS': 0.0})
                near.append(star)
                continue
            if star['hip'] == GL445_HIP:
                px = float(gaia['parallax'])
                star.update({
                    'raDeg': float(gaia['ra']),
                    'decDeg': float(gaia['dec']),
                    'distPc': 1000.0 / px,
                    'pmraMasYr': float(gaia['pmra']),
                    'pmdecMasYr': float(gaia['pmdec']),
                    'rvKmS': float(gaia['radial_velocity']),
                    'astrometrySource': 'gaia-dr3',
                    'epoch': GAIA_EPOCH,
                    'gaiaDr3SourceId': gaia['source_id'],
                    'parallaxMas': px,
                    'parallaxErrMas': float(gaia['parallax_error']),
                    'pmraErrMasYr': float(gaia['pmra_error']),
                    'pmdecErrMasYr': float(gaia['pmdec_error']),
                    'rvErrKmS': float(gaia['radial_velocity_error']),
                })
                gl445 = star
            if known and 0.0 < star['distPc'] <= NEAR_PC:
                near.append(star)
            elif mag <= SKY_MAG:
                sky.append(star)
    if gl445 is None:
        raise SystemExit('Gliese 445 (HIP 57544) not found in HYG')
    near_ids = {x['id'] for x in near}
    for star, primary in companions:
        if star['rvKmS'] is None and primary in rv_by_id:
            star['rvKmS'] = rv_by_id[primary]
            if star['id'] in near_ids:
                star['rvFromPrimary'] = True
    near.sort(key=lambda s: (s['distPc'], s['id']))
    sky.sort(key=lambda s: s['id'])
    return {
        'meta': {
            'built': common.today(),
            'sources': [common.source_ref('hyg'), common.source_ref('gaia-gl445')],
            'citation': 'HYG Stellar Database v4.2, David Nash (astronexus), CC BY-SA 4.0; Gaia DR3 (Gaia Collaboration, Vallenari et al. 2023, A&A 674, A1)',
            'frame': 'ICRS, solar-system barycentre; the Sun is id 0 at the origin, at rest',
            'units': 'raDeg, decDeg deg (at epoch); distPc pc; pmraMasYr (includes cos dec), pmdecMasYr mas/yr; rvKmS km/s; mag, absmag V mag; epoch decimal Julian year of the astrometry',
            'selection': f'near: 0 < dist <= {NEAR_PC} pc plus the Sun, sorted by distance; sky: mag <= {SKY_MAG} and not near (dist > {NEAR_PC} pc or unknown), sorted by id, in data/sky.json as {{columns, rows}} (same fields as near)',
            'gaiaErrors': 'stars with astrometrySource gaia-dr3 also carry parallaxMas and 1-sigma errors parallaxErrMas, pmraErrMasYr, pmdecErrMasYr, rvErrKmS; HYG rows have no errors (fields absent)',
            'counts': {'near': len(near), 'sky': len(sky), 'nearWithRv': sum(1 for s in near if s['rvKmS'] is not None),
                       'nearRvFromPrimary': sum(1 for s in near if s.get('rvFromPrimary'))},
            'rvFromPrimary': 'near stars flagged rvFromPrimary take the radial velocity of their system primary (HYG comp_primary): a bound companion shares the system velocity to within its orbital speed',
        },
        'near': near,
        'sky': sky,
    }


SKY_COLUMNS = ['id', 'name', 'gl', 'hip', 'hd', 'raDeg', 'decDeg', 'distPc', 'pmraMasYr', 'pmdecMasYr', 'rvKmS',
               'mag', 'absmag', 'spect', 'ci', 'astrometrySource', 'epoch']


def _write_text(name, text):
    json.loads(text)
    path = os.path.join(common.DATA, name)
    os.makedirs(common.DATA, exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    return path, os.path.getsize(path)


def write(obj):
    """stars.json: meta and near (one star object per line). sky.json: the sky stars, columnar
    ({columns, rows}) with the same fields as near, in their own file to keep each under 2 MB."""
    near_rows = obj['near']
    sky = obj['sky']
    for st in sky:
        if set(st) != set(SKY_COLUMNS):
            raise SystemExit(f"sky star {st['id']} has fields {sorted(st)}")
    parts = ['{"meta":' + json.dumps(obj['meta'], sort_keys=True, separators=(',', ':')) + ',', '"near":[']
    for i, r in enumerate(near_rows):
        parts.append(json.dumps(r, sort_keys=True, separators=(',', ':')) + (',' if i < len(near_rows) - 1 else ''))
    parts.append(']}')
    out = [_write_text('stars.json', '\n'.join(parts) + '\n')]
    sky_meta = {k: v for k, v in obj['meta'].items() if k != 'gaiaErrors'}
    sky_meta['sources'] = [common.source_ref('hyg')]
    sky_meta['citation'] = 'HYG Stellar Database v4.2, David Nash (astronexus), CC BY-SA 4.0'
    sky_meta['layout'] = 'columns names the fields; each row is one star with the same fields as data/stars.json near'
    parts = ['{"meta":' + json.dumps(sky_meta, sort_keys=True, separators=(',', ':')) + ',',
             '"columns":' + json.dumps(SKY_COLUMNS, separators=(',', ':')) + ',', '"rows":[']
    for i, st in enumerate(sky):
        parts.append(json.dumps([st[c] for c in SKY_COLUMNS], separators=(',', ':')) + (',' if i < len(sky) - 1 else ''))
    parts.append(']}')
    out.append(_write_text('sky.json', '\n'.join(parts) + '\n'))
    return out


if __name__ == '__main__':
    if '--register' in sys.argv:
        print('added', common.register_sources([GAIA_SOURCE]))
        sys.exit(0)
    for p, s in write(build()):
        print(f'wrote {p} ({s} bytes)')
