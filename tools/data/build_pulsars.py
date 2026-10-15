"""Build data/pulsars.json from the ATNF Pulsar Catalogue v2.9.0 (sources/atnf/psrcat_pkg.v2.9.0.tar.gz).

psrcat.db is read straight out of the tarball into memory with tarfile (nothing is extracted and the
C tool is never built or run). Format (docs/research/clocks.md section 1): one parameter per line,
"KEYWORD value [uncertainty] [ref]", uncertainties in units of the last quoted digit, records end with
a line starting "@", lines starting "#" are comments, the first one carrying the version.

Derived values follow the psrcat C source shipped in the same tarball (read as text):
- P0/P1 from F0/F1 and the reverse (P = 1/F, Pdot = -Fdot/F^2).
- DIST, the catalogue's "best estimate" (defineParams.c, defineDistance): DIST_A if present; else
  1/PX if PX is more than 3 sigma; else, when DIST_AMN and DIST_AMX exist, DIST_DM if it lies between
  them, otherwise the nearer limit (their midpoint if there is no DIST_DM); else DIST_DM.
- RA/Dec from ELONG/ELAT (ecliptic J2000, obliquity 84381.448 arcsec, IAU 1976) when RAJ/DECJ are absent;
  proper motions rotated the same way.
- Galactic l, b from ICRS RA/Dec with the Hipparcos matrix A_G (ESA 1997, The Hipparcos and Tycho
  Catalogues, vol. 1, section 1.5.3).

Run: python -P tools/data/build_pulsars.py
"""
import math
import os
import re
import sys
import tarfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402

# ICRS (equatorial) to galactic rotation, rows = galactic x, y, z in ICRS components.
# Source: ESA (1997), The Hipparcos and Tycho Catalogues, ESA SP-1200, vol. 1, section 1.5.3, eq. 1.5.11.
A_G = (
    (-0.0548755604162154, -0.8734370902348850, -0.4838350155487132),
    (0.4941094278755837, -0.4448296299600112, 0.7469822444972189),
    (-0.8676661490190047, -0.1980763734312015, 0.4559837761750669),
)
# Obliquity of the ecliptic at J2000, IAU 1976 value 84381.448 arcsec (Lieske et al. 1977), the
# ecliptic frame pulsar timing packages use for ELONG/ELAT.
EPS_J2000 = math.radians(84381.448 / 3600.0)


def read_db():
    path = common.source_path('atnf')
    with tarfile.open(path, 'r:gz') as t:
        member = t.getmember('psrcat_tar/psrcat.db')
        text = t.extractfile(member).read().decode('latin-1')
    return text


def err_scale(value_str):
    """Size of one unit in the last quoted digit of a catalogue value string (e.g. '1.5666E-11' -> 1e-15)."""
    s = value_str.strip().lstrip('+-')
    m = re.match(r'^(\d*)(?:\.(\d*))?(?:[eEdD]([-+]?\d+))?$', s)
    if not m:
        return None
    decimals = len(m.group(2) or '')
    exp = int(m.group(3) or 0)
    return 10.0 ** (exp - decimals)


def num(s):
    try:
        return float(s.replace('D', 'E').replace('d', 'e'))
    except ValueError:
        return None


def parse(text):
    version = None
    count_comment = None
    records = []
    cur = {}
    for line in text.splitlines():
        if line.startswith('#'):
            if version is None and line.startswith('#CATALOGUE'):
                version = line.split()[1]
            m = re.match(r'#\s*Number of pulsars is (\d+)', line)
            if m:
                count_comment = int(m.group(1))
            continue
        if line.startswith('@'):
            if cur:
                records.append(cur)
            cur = {}
            continue
        if not line.strip():
            continue
        parts = line.split()
        key = parts[0]
        val = parts[1] if len(parts) > 1 else ''
        err = None
        if len(parts) > 2 and re.match(r'^\d+(\.\d+)?$', parts[2]):
            err = parts[2]
        cur[key] = (val, err)
    if cur:
        records.append(cur)
    return version, count_comment, records


def value(rec, key):
    if key not in rec:
        return None
    return num(rec[key][0])


def uncertainty(rec, key):
    """Absolute 1-sigma uncertainty: the quoted integer times one unit of the value's last digit."""
    if key not in rec or rec[key][1] is None:
        return None
    val, err = rec[key]
    if '.' in err:
        return float(err)  # already absolute (none occur in v2.9.0 for the fields used here)
    sc = err_scale(val)
    # 12 significant figures removes binary noise such as 0.30000000000000004 from int * 10^-k
    return None if sc is None else float(f'{int(err) * sc:.12g}')


def sexa_deg(s, hours):
    sign = -1.0 if s.strip().startswith('-') else 1.0
    p = [float(x) for x in s.strip().lstrip('+-').split(':')]
    while len(p) < 3:
        p.append(0.0)
    v = p[0] + p[1] / 60.0 + p[2] / 3600.0
    return sign * v * (15.0 if hours else 1.0)


def unit_vec(lon_deg, lat_deg):
    lo, la = math.radians(lon_deg), math.radians(lat_deg)
    return (math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la))


def to_lonlat(v):
    lon = math.degrees(math.atan2(v[1], v[0])) % 360.0
    lat = math.degrees(math.asin(max(-1.0, min(1.0, v[2]))))
    return lon, lat


def ecl_to_eq(v):
    c, s = math.cos(EPS_J2000), math.sin(EPS_J2000)
    return (v[0], c * v[1] - s * v[2], s * v[1] + c * v[2])


def eq_to_gal(v):
    return tuple(sum(A_G[i][j] * v[j] for j in range(3)) for i in range(3))


def rotate_pm(lon1, lat1, pm_lon, pm_lat, transform):
    """Rotate a proper motion (mu_lon* incl. cos lat, mu_lat) through a frame rotation."""
    lo, la = math.radians(lon1), math.radians(lat1)
    e_lon = (-math.sin(lo), math.cos(lo), 0.0)
    e_lat = (-math.sin(la) * math.cos(lo), -math.sin(la) * math.sin(lo), math.cos(la))
    vel = tuple(pm_lon * e_lon[i] + pm_lat * e_lat[i] for i in range(3))
    p2 = transform(unit_vec(lon1, lat1))
    v2 = transform(vel)
    lon2, lat2 = to_lonlat(p2)
    lo2, la2 = math.radians(lon2), math.radians(lat2)
    f_lon = (-math.sin(lo2), math.cos(lo2), 0.0)
    f_lat = (-math.sin(la2) * math.cos(lo2), -math.sin(la2) * math.sin(lo2), math.cos(la2))
    return (sum(v2[i] * f_lon[i] for i in range(3)), sum(v2[i] * f_lat[i] for i in range(3)))


def best_distance(rec):
    """psrcat defineDistance (defineParams.c), type 1 (YMW16). Returns (kpc, rule) or (None, None)."""
    dist_a = value(rec, 'DIST_A')
    px = value(rec, 'PX')
    px_err = uncertainty(rec, 'PX')
    sigma = abs(px / px_err) if (px is not None and px_err) else -1
    amn, amx, ddm = value(rec, 'DIST_AMN'), value(rec, 'DIST_AMX'), value(rec, 'DIST_DM')
    if dist_a is not None:
        return dist_a, 'DIST_A'
    if sigma > 3:
        return 1.0 / px, 'PX'
    if amn is not None and amx is not None:
        if ddm is not None:
            if amn <= ddm <= amx:
                return ddm, 'DIST_DM within DIST_AMN..DIST_AMX'
            return (amx if ddm >= amx else amn), 'nearest of DIST_AMN/DIST_AMX to DIST_DM'
        return (amn + amx) / 2.0, 'DIST_AMN/DIST_AMX midpoint'
    if ddm is not None:
        return ddm, 'DIST_DM'
    return None, None


def build():
    version, count_comment, records = parse(read_db())
    out = []
    for rec in records:
        if 'PSRJ' not in rec:
            continue
        jname = rec['PSRJ'][0]
        bname = rec['PSRB'][0] if 'PSRB' in rec else None
        f0, f1, f2, f3 = (value(rec, k) for k in ('F0', 'F1', 'F2', 'F3'))
        p0, p1 = value(rec, 'P0'), value(rec, 'P1')
        f0e, f1e = uncertainty(rec, 'F0'), uncertainty(rec, 'F1')
        p0e, p1e = uncertainty(rec, 'P0'), uncertainty(rec, 'P1')
        if f0 is None and p0:
            f0 = 1.0 / p0
            f0e = p0e / p0 ** 2 if p0e is not None else None
        if p0 is None and f0:
            p0 = 1.0 / f0
        if f1 is None and p1 is not None and p0:
            f1 = -p1 / p0 ** 2
            # psrcat readCatalogue.c: sigma_F1 from sigma_P1 and sigma_P0 in quadrature
            if p1e is not None:
                f1e = math.hypot(p1e / p0 ** 2, 2 * p1 * (p0e or 0.0) / p0 ** 3)
        if p1 is None and f1 is not None and f0:
            p1 = -f1 / f0 ** 2

        pmra, pmdec = value(rec, 'PMRA'), value(rec, 'PMDEC')
        pmra_e, pmdec_e = uncertainty(rec, 'PMRA'), uncertainty(rec, 'PMDEC')
        if 'RAJ' in rec and 'DECJ' in rec:
            ra = sexa_deg(rec['RAJ'][0], True)
            dec = sexa_deg(rec['DECJ'][0], False)
        else:
            el, eb = value(rec, 'ELONG'), value(rec, 'ELAT')
            ra, dec = to_lonlat(ecl_to_eq(unit_vec(el, eb)))
            pml, pmb = value(rec, 'PMELONG'), value(rec, 'PMELAT')
            if pmra is None and pml is not None and pmb is not None:
                pmra, pmdec = rotate_pm(el, eb, pml, pmb, ecl_to_eq)
                el_e, eb_e = uncertainty(rec, 'PMELONG'), uncertainty(rec, 'PMELAT')
                if el_e is not None and eb_e is not None:
                    # Rotate the (diagonal) covariance: the frame change is a rotation by angle phi in
                    # the tangent plane; correlations are not stored, so only the diagonal is kept.
                    c, s_ = rotate_pm(el, eb, 1.0, 0.0, ecl_to_eq)
                    pmra_e = math.sqrt((c * el_e) ** 2 + (s_ * eb_e) ** 2)
                    pmdec_e = math.sqrt((s_ * el_e) ** 2 + (c * eb_e) ** 2)
                else:
                    pmra_e = pmdec_e = None
        gl, gb = to_lonlat(eq_to_gal(unit_vec(ra, dec)))
        dist, _rule = best_distance(rec)
        nglt = value(rec, 'NGLT')
        binary = any(k in rec for k in ('BINARY', 'PB', 'FB0', 'A1'))
        out.append({
            'jname': jname,
            'bname': bname,
            'p0': p0, 'p1': p1,
            'f0': f0, 'f1': f1, 'f2': f2, 'f3': f3,
            'f0Err': f0e, 'f1Err': f1e,
            'pepoch': value(rec, 'PEPOCH'),
            'dm': value(rec, 'DM'),
            'dist': dist,
            'distDm': value(rec, 'DIST_DM'),
            'px': value(rec, 'PX'),
            'ra': ra, 'dec': dec, 'gl': gl, 'gb': gb,
            'pmra': pmra, 'pmdec': pmdec,
            'pxErr': uncertainty(rec, 'PX'), 'pmraErr': pmra_e, 'pmdecErr': pmdec_e,
            'nglt': int(nglt) if nglt is not None else None,
            'assoc': rec['ASSOC'][0] if 'ASSOC' in rec else None,
            'binary': binary,
        })
    # Keep the file under 2 MB: the three astrometric error keys are omitted when null (absent = null,
    # documented in data/README.md); every other field is always present.
    for p in out:
        for k in ('pxErr', 'pmraErr', 'pmdecErr'):
            if p[k] is None:
                del p[k]
    out.sort(key=lambda p: p['jname'])
    if count_comment is not None and len(out) != count_comment:
        raise SystemExit(f'parsed {len(out)} pulsars but the catalogue header says {count_comment}')
    return {
        'meta': {
            'catalogue': f'ATNF v{version}',
            'count': len(out),
            'citation': 'Manchester, R. N., Hobbs, G. B., Teoh, A. and Hobbs, M. (2005), AJ 129, 1993; https://www.atnf.csiro.au/research/pulsar/psrcat/',
            'source': common.source_ref('atnf'),
            'built': common.today(),
            'units': 'pxErr mas; pmraErr, pmdecErr mas/yr (1-sigma; key absent when the catalogue has no value); p0 s; p1 s/s; f0 Hz; f1 Hz/s; f2 Hz/s^2; f3 Hz/s^3; pepoch MJD; dm pc/cm^3; dist, distDm kpc; px mas; ra, dec, gl, gb deg; pmra (includes cos dec), pmdec mas/yr',
            'notes': 'See data/README.md for derivation rules (P/F fill, DIST rule, ecliptic and galactic conversions).',
        },
        'pulsars': out,
    }


if __name__ == '__main__':
    path, size = common.write_json('pulsars.json', build(), rows_key='pulsars')
    print(f'wrote {path} ({size} bytes)')
