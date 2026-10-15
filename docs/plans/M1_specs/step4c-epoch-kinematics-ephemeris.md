# M1 step 4 part 2a spec (S2a): the epoch model, the trail, the ephemeris

Subagent: `builder-opus`. Written by the lead in build session 2 (2026-10-15) from
`step4b-design-notes.md`. Launch once `data/*.json` exist (steps 2 and 3) and `src/science/astro.ts`,
`random.ts`, `stats.ts` exist (step 4a). Paste everything below the `---` line as the prompt.

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit). Read `CLAUDE.md`, `docs/research/README.md`, `docs/research/voyager.md` sections 3 to 5, `PLAN.md` ("The story frame", chapters 0, 4 and 9), `docs/plans/M1.md` step 4, `data/README.md`, `src/science/README.md`, and the existing modules you build on: `src/science/types.ts` (the data-file types; the lead owns it: if a field is missing or wrong, tell the lead in your report rather than editing it, unless the data file plainly disagrees with it, then fix the type and say so), `src/science/astro.ts`, `random.ts`, `stats.ts`, `units.ts`, and `tests/support/data.ts` (loads the data files in tests) and `tests/support/record.ts` (`recordCheck`). Another helper is writing `src/science/pulsars.ts` and `triangulation.ts` in parallel and will import your `epoch.ts`: build `epoch.ts` FIRST (the interface below, with its tests), then the rest.

This is M1 step 4 part 2a: where everything is at the story's epoch, the neighbour twist, The Trail (kinematics) and the epilogue ephemeris. Pure TypeScript in `src/science/` (no DOM, no three.js, no Preact, no `Math.random`, no file reads: functions take the parsed data objects as arguments); deterministic (seeded streams from `random.ts` only).

## Files you own (create; touch nothing else)
`src/science/epoch.ts`, `src/science/kinematics.ts`, `src/science/ephemeris.ts`, their tests `src/science/epoch.test.ts`, `kinematics.test.ts`, `ephemeris.test.ts`, and a new section in `src/science/README.md` for each module (append; do not rewrite other sections).

## Frame and conventions
- Solar-system barycentre (SSB) frame, ICRS Cartesian axes. Positions in pc, velocities in km/s, times as decimal years (`2000 + (JD - 2451545.0) / 365.25`, the helpers in `astro.ts`). The Sun sits at the origin with zero velocity (its 0.01 AU offset from the SSB is irrelevant here; say so in a comment).
- Stars move linearly from their own astrometric epoch (`star.epoch`: J2000.0 for HYG rows, J2016.0 for Gaia DR3 rows). Stars with `rvKmS === null` are propagated with zero radial velocity and flagged `fullVelocity: false`; anything that needs a full velocity (The Trail) excludes them; count them in reports.
- The craft: position = the Horizons SSB state in `scenario.craft.stateRef` (km, converted to pc) plus the asymptotic velocity (`scenario.craft.asymptote`: unit vector from RA/Dec times speed) times the time since `stateRef.jdTdb`; velocity = the asymptotic velocity. Comment why this is good enough: the leftover solar deceleration displaces the craft by about (GM_sun / v_inf^2) ln(r / r0), roughly 20 AU by the epoch, against about 150,000 AU of travel. Report the angle between the 2026 position vector and the asymptote.

## `epoch.ts` (build first; the pulsar helper depends on these exact names)
```ts
export interface BodyState { decimalYear: number; posPc: Vec3; velKmS: Vec3 }
export function craftStateAt(scenario: ScenarioData, decimalYear: number): BodyState;
export function starStateAt(star: StarRecord, decimalYear: number): BodyState & { fullVelocity: boolean };
export function findHomeStar(scenario: ScenarioData, stars: StarCatalogue): StarRecord; // by hygId, else by gl "Gl 445"; throws if absent
export interface DiscoveryState {
  decimalYear: number; yearsAfterLaunch: number; jdTdb: number;
  craft: BodyState; home: BodyState;
  minDistPc: number; relSpeedKmS: number;
}
/** The discovery epoch: closest approach of the craft to the home star (linear motion, closed form). */
export function discoveryState(scenario: ScenarioData, stars: StarCatalogue): DiscoveryState;
export interface Observer extends BodyState {
  /** 3x3 covariances (ICRS Cartesian) from the home star's Gaia DR3 errors, propagated; pc^2 and (km/s)^2. */
  posCov: number[][]; velCov: number[][];
}
/** The alien observatory: the home star's barycentre at an epoch, with its measurement covariance. */
export function homeObserver(scenario: ScenarioData, stars: StarCatalogue, decimalYear: number): Observer;
export function nearestStars(stars: StarCatalogue, centerPc: Vec3, decimalYear: number, k: number, excludeIds?: number[]):
  { star: StarRecord; distPc: number; fullVelocity: boolean }[];
export function apparentMagnitude(absmag: number, distPc: number): number;
/** Brightest stars seen from a point at an epoch (near and sky lists), by apparent magnitude. */
export function brightestStars(stars: StarCatalogue, observerPc: Vec3, decimalYear: number, k: number):
  { star: StarRecord; distPc: number; appMag: number }[];
```
- `homeObserver` covariances: propagate the Gaia errors (`parallaxErrMas`, `pmraErrMasYr`, `pmdecErrMasYr`, `rvErrKmS`; ignore the unpublished correlations and say so) through the position and space-velocity transforms, by Jacobian or by a seeded Monte Carlo of at least 20,000 draws (test the two agree if you write both). If `types.ts` or the data lack these fields, report it; do not invent errors.
- Tests (`epoch.test.ts`), each compared with the published or research numbers, tolerances commented with their origin:
  - Discovery epoch versus Bailer-Jones and Farnocchia 2019 (44.0 kyr, 0.575 pc, 116.0 km/s; Gaia DR2) and the research's Gaia DR3 recheck (44.1 kyr, 0.573 pc, 115.9 km/s; voyager.md section 5): within 0.3 kyr, 0.01 pc and 0.5 km/s of the DR3 recheck (our inputs are DR3). Id `epoch.discovery`.
  - The craft's distance from the Sun at the epoch and its apparent speed; the 2026 craft position from the model equals the Horizons state it starts from (trivially) and its distance from the Sun is 172.06 AU (voyager.md section 4; within 0.05 AU) at 2026-10-15. Id `epoch.craft`.
  - **The neighbour twist** (PLAN.md "The story frame"): at the discovery epoch list Gliese 445's ten nearest catalogued stars (distance, full-velocity flag), the Sun's rank and distance, the Sun's apparent magnitude from Gliese 445 and from the craft (absolute magnitude from the Sun's row in `stars.json`), and the ten brightest stars in Gliese 445's sky (near and sky lists, with motion applied). The story's claims are: the Sun is among Gliese 445's three nearest catalogued stars at about 1.06 pc, and the Sun is among the ten brightest stars in its sky. Record both (`epoch.neighbours`, `epoch.sunBrightness`) with the numbers in `measured` and the catalogue's limits in `notes` (HYG within 30 pc is incomplete for faint M dwarfs; stars without radial velocities carry position uncertainty of |v_r| times 44 kyr). If a claim fails, do NOT loosen it and do NOT change any data: leave the assertion failing, record `pass: false`, and put the facts first in your report; the lead changes the story text.
- Determinism: same inputs, identical outputs.

## `kinematics.ts` (The Trail, PLAN.md chapter 4)
```ts
export interface TrailEntry { star: StarRecord; distPc: number; angleDeg: number; angleSigmaDeg: number; distOverSpeedYears: number; distOverSpeedSigmaYears: number }
/** For every star within maxDistPc of the craft with a full velocity: the angle between the craft's velocity
 * relative to the star and the direction from the star to the craft, and distance over relative speed. */
export function trail(craft: BodyState, stars: StarCatalogue, observer: Observer, opts: { maxDistPc: number; draws: number; seed: string }): TrailEntry[];
```
- The exact angle uses catalogue values. The sigma columns model the alien's measurements, by a seeded Monte Carlo: every star's velocity relative to the observer carries the observer's own velocity covariance (`observer.velCov`, from Gaia DR3; the precision of a modern survey for a star about 1 pc away), every star's position the observer's position covariance scaled by (its distance from the observer / the home star's distance from the Sun)^2 (parallax errors grow with distance squared), and the craft's own state is known exactly (it is in the alien's hands). Document this measurement model in a comment and in the README section; it is a model, labelled as one.
- Tests (`kinematics.test.ts`), at the discovery epoch:
  - Exactly one star, the Sun (id 0), has an exact angle under 0.1 deg; report the next smallest angle and which star. Id `trail.unique`.
  - With measurement noise: the Sun's angle is within 2 sigma of zero, and every other star within 10 pc is more than 5 sigma from zero (report the smallest such margin). Id `trail.uniqueWithErrors`.
  - Distance over speed for the Sun equals the true time since launch (from `scenario.craft.launchUtc`) within 1 year (172.06 AU / 16.6048 km/s is about 49.1 years, the craft's age today), and its measured interval contains the truth. Record the interval. Id `trail.age`.
  - Gliese 445 itself: angle 90 deg within 1e-6 (the craft is at closest approach); a built-in sanity check.
  - Reports: how many stars lie within 10 pc of the craft, how many lack a radial velocity and were excluded.

## `ephemeris.ts` (the epilogue's "where are they now")
```ts
export function hermiteState(body: EphemerisBody, jdTdb: number): { posKm: Vec3; velKmS: Vec3 }; // cubic Hermite on position, using the node velocities
export function distanceKm(a: Vec3, b: Vec3): number;
export function lightTimeHours(km: number): number;
/** First JD (TDB) after jd0 when the craft's distance from Earth reaches the given light time; bisection on the Hermite states. */
export function crossingJd(craft: EphemerisBody, earth: EphemerisBody, lightHours: number, jdFrom: number, jdTo: number): number;
```
- Tests (`ephemeris.test.ts`):
  - Every spot check in `data/ephemeris_spotchecks.json` within 100 km (research: 1.9 km max at 30-day nodes). Id `epilogue.ephemeris`.
  - On 2026-10-15 00:00 UTC (convert UTC to TDB: add 69.184 s, comment the source): Voyager 1 172.06 AU and Voyager 2 144.2 AU from the Sun (within 0.05 AU and 0.1 AU), 23.9 and 20.0 light-hours from Earth (within 0.05 h) (voyager.md section 4). Id `epilogue.today`.
  - Voyager 1 reaches one light-day from Earth at 2026-11-18 10:16 UTC per NASA (voyager.md section 4): our crossing within 1 hour of that. Id `epilogue.lightDay`.
  - Before 2000 and after the table's last node: throw a clear error.

## Rules
- Every constant has its unit and source (research file and section, or a primary source) in a comment. Error bars are computed, never chosen; measurement-model inputs are documented as inputs.
- Files under about 400 lines; strict TypeScript; no `any`; no `Math.random`.
- Run `npm run typecheck` and `npm test` until green (the other helper's tests may be red while it works; judge your own files, and report anything of theirs you saw failing). Keep your tests under 20 s total.
- No em dash anywhere. Never read .env. Do not commit.

## Report back (short)
Files created; final test summary lines; the discovery epoch (decimal year, years after launch, distance, speed) next to BJF19 and the DR3 recheck; the asymptote angle; the neighbour-twist facts (ten nearest, Sun's rank and distance, the Sun's apparent magnitude from Gliese 445 and from the craft, the ten brightest stars in that sky); the trail table's first five rows; the light-day crossing time; anything that disagrees with the research or the story.
