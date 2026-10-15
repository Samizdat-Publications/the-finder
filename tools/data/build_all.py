"""Rebuild every data/*.json from sources/ and run the checks.

Run: python -P tools/data/build_all.py
(The raw sources must already be fetched: node tools/fetch-sources.mjs)
"""
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
STEPS = ['build_cover.py', 'build_pulsars.py', 'build_timing.py', 'build_stars.py', 'build_ephemeris.py',
         'build_scenario.py', 'checks.py']

if __name__ == '__main__':
    t0 = time.time()
    for step in STEPS:
        print(f'== {step}', flush=True)
        r = subprocess.run([sys.executable, '-P', os.path.join(HERE, step)])
        if r.returncode != 0:
            print(f'{step} failed (exit {r.returncode})')
            sys.exit(r.returncode)
    print(f'all data built and checked in {time.time() - t0:.1f} s')
