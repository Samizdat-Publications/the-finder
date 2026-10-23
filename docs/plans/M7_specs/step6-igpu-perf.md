# M7 step 6a: the laptop (iGPU) performance test

**Goal:** one browser test that measures the 3D scenes on this PC's Intel Arc 140T (the stand-in for an ordinary
laptop's built-in graphics) and records the numbers in How it's checked, so "performance targets met" in PLAN M7 has
numbers behind it. Measure and record; do not optimise anything in this step.

**Files you own (create or modify nothing else):**
- `tests/browser/perf-igpu.browser.mjs` (new)
- `tools/harness/browser.mjs`: add one exported helper `launchChromeLowPower()` beside `launchChrome()` (same
  channel logic and the same GPU_ARGS minus `--force_high_performance_gpu`, plus `--force_low_power_gpu` and
  `--use-angle=d3d11`; see `C:\Users\stewa\Documents\Claude\Excavator Sim\tools\harness\browser.mjs` line 43 for
  why those two flags). Do not change `launchChrome()`.

**How the test works:** read `tools/harness/README.md` and `tests/browser/encounter.browser.mjs`,
`tests/browser/charts.browser.mjs`, `tests/browser/enter.browser.mjs` first and match their style. The runner hands
the test a page on the default (RTX) browser; ignore it for the measurements: launch a second browser with
`launchChromeLowPower()`, open a 1440 x 900 page in it, and close that browser in a `finally`.
1. Confirm the adapter: read WebGL2's `UNMASKED_RENDERER_WEBGL` (as enter.browser.mjs does). If it does not
   contain "Intel", record the check as failing with the adapter string in `measured` (the flags did not take).
2. For each of three scenes, open its dev page with motion ON (no `reduced=1`), wait 2.5 s, then take
   `benchmark(120)` (mean ms per frame rendered back to back) and `frameStats()` (the live loop's mean interval):
   - the encounter scene: `/play/scene/?clean=1` (handle `window.__encounter`);
   - the galaxy chart: `/play/charts/?chart=galaxy&demo=map&clean=1` (`window.__galaxy`);
   - the neighbourhood chart: `/play/charts/?chart=neighbourhood&demo=sun&clean=1` (`window.__neighbourhood`).
   Use the same waits for readiness those tests use.
3. Entering a chapter on the iGPU: repeat enter.browser.mjs's long-task measurement for The Map only (import or copy
   its `enterOnce`; if you copy, keep it identical), in the low-power browser. Record the longest task.
4. One `record()` per item, ids `perf.igpu.encounter`, `perf.igpu.galaxy`, `perf.igpu.neighbourhood`,
   `perf.igpu.enterMap`. Targets (the claim states them in plain words): benchmark mean at most 25 ms and live loop
   mean at most 34 ms (30 fps floor, with headless timer slack) for the three scenes; the longest task entering The
   Map at most 100 ms. `measured` names the adapter. `tolerance` says the numbers depend on this PC and on load.
5. Assert each target, so a miss fails the test, EXCEPT: if a target is missed, still record every number first,
   then fail. Do NOT loosen a target to make it pass; report the miss.

**Rules that apply:** CLAUDE.md hard rules 6 (deterministic where it matters: the scenes are not seeded, that is
fine), 7 (nothing is done until verified), 10 (stage nothing; the lead commits), 13 (no em dashes anywhere,
including comments). Never download browsers. Never kill processes by name.

**Commands that must pass:** `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`;
`node tools/harness/browser-tests.mjs perf-igpu` (run it twice; report both runs' numbers). If the lead's tour bot
is running at the same time the numbers may be noisy: say so if you see contention (the runner log shows FLAKY).

**Report:** files changed; both runs' numbers per check (adapter, benchmark mean, live mean, longest task); pass or
fail per target; anything surprising.
