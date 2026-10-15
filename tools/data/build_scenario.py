"""Build data/scenario.json: the story's craft and home star (CLAUDE.md "Project facts").

The discovery epoch is NOT stored here: the science core computes it from this config, the star
model (data/stars.json) and the craft's asymptote.

Sources:
- Asymptotes: Bailer-Jones, C. A. L. and Farnocchia, D. (2019), RNAAS 3, 59, Table 1 (barycentric
  ICRF asymptotic directions and speeds), as quoted in docs/research/voyager.md section 5.
- Launch time: 1977-09-05 12:56 UTC as given in the M1 data spec (NASA's published launch time, 8:56 a.m.
  EDT). docs/research/voyager.md section 4 confirms only the date; the time is UNVERIFIED against a cited file.
- stateRef: JPL Horizons, Voyager 1 relative to the solar-system barycentre at 2026-10-15 19:00 TDB
  (source horizons-v1-ssb-ref, built by build_ephemeris.py).
- Home star identifiers: HYG v4.2 row and the Gaia DR3 query result (source gaia-gl445).

Run: python -P tools/data/build_scenario.py   (after build_stars.py)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402
import build_ephemeris  # noqa: E402
import build_stars  # noqa: E402


def build():
    _, _, state_ref = build_ephemeris.build()
    gaia = build_stars.read_gaia()
    stars = common.read_json('stars.json')
    gl445 = [s for s in stars['near'] if s['hip'] == build_stars.GL445_HIP]
    if len(gl445) != 1:
        raise SystemExit('Gliese 445 not found exactly once in data/stars.json; run build_stars.py first')
    gl445 = gl445[0]
    if gl445['gaiaDr3SourceId'] != gaia['source_id']:
        raise SystemExit('stars.json and the Gaia source disagree on the source_id')
    ross248 = [s for s in stars['near'] if s['gl'] == 'Gl 905']
    return {
        'id': 'v1-gl445',
        'built': common.today(),
        'craft': {
            'name': 'Voyager 1',
            'horizonsId': '-31',
            'launchUtc': '1977-09-05T12:56:00Z',
            'launchSource': 'date: docs/research/voyager.md section 4; time of day: NASA launch time as given in the M1 spec, not yet cited in docs/research',
            'asymptote': {
                'raDeg': 262.8760,
                'decDeg': 12.3199,
                'speedKmS': 16.6048,
                'frame': 'ICRS, barycentric, asymptotic',
                'source': 'Bailer-Jones and Farnocchia 2019, RNAAS 3, 59',
            },
            'stateRef': state_ref,
        },
        'homeStar': {
            'name': 'Gliese 445',
            'otherNames': ['AC+79 3888', 'Gl 445', 'HIP 57544', f"Gaia DR3 {gaia['source_id']}"],
            'gaiaDr3SourceId': gaia['source_id'],
            'hygId': gl445['id'],
            'hip': gl445['hip'],
        },
        'discoveryRule': 'closest approach of the craft to the home star, linear motion',
        'alternative': {
            'craft': 'Voyager 2',
            'horizonsId': '-32',
            'asymptote': {
                'raDeg': 316.2717,
                'decDeg': -67.5491,
                'speedKmS': 14.8550,
                'frame': 'ICRS, barycentric, asymptotic',
                'source': 'Bailer-Jones and Farnocchia 2019, RNAAS 3, 59',
            },
            'homeStar': 'Ross 248',
            'homeStarHygId': ross248[0]['id'] if len(ross248) == 1 else None,
        },
        'sources': ['docs/research/voyager.md sections 3 and 5', common.source_ref('horizons-v1-ssb-ref'), common.source_ref('gaia-gl445')],
    }


if __name__ == '__main__':
    p, s = common.write_json('scenario.json', build())
    print(f'wrote {p} ({s} bytes)')
