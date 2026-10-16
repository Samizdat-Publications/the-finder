# M4 science audit (2026-10-16)

Reviewer: the `science-auditor` agent, adversarial, read-only. Scope: everything M4 added (the shared epoch
model, `axisDeltaChi2`, The Map, The Spot and The Trail checkers, `src/science/spot.ts`, the kinematics
additions, How it's checked rows 5 to 10). It ran the M4 tests (45 pass) and its own independent checks
(kept outside the repo, in `review/archive/science/m4/`, gitignored).

## Verdicts by row

| Row | Claim | Verdict |
|---|---|---|
| 5 | 14 numbers are pulsar periods, identified | Pass, but `map.periods` judges with pass-2 odds (finding 1) |
| 6 | Origin region, contains the Sun, about 1,000 stars | Sun inside: pass. Size and count compared only with the code's own earlier output (finding 5) |
| 7 | Map dated, motion axis | Pass; the axis coverage figure checks only the formula (finding 4) |
| 8 | Spot about 44,000 y old, started pure | Age: pass. "Pure" overstated (finding 6) |
| 9 | Came from the Sun; distance over speed | Verdicts pass; the shown values are noise-free truth and the "2 sigma" cut is about an 84% cut (finding 2) |
| 10 | The Sun is the nearest neighbour and fifth-brightest | Pass |

## Findings and the lead's decisions

| # | Severity | Finding | Decision |
|---|---|---|---|
| 1 | Checker misjudges | `map.periods` scores with pass-2 odds, built from the origin and age the player has not found yet; the science's anchor rule is defined on pass 1. B1929+10 is never a pass-1 anchor (seed b even prefers a wrong pulsar in pass 1) yet is accepted at "160 to 1" | Fix: `map.periods` and the readout before the map is dated use pass-1 odds and accept only pass-1 anchors; pass-2 odds show once `map.old` is confirmed; a test that seed b's line 2 is refused |
| 2 | Dishonest error bar | Trail angles and distance over speed are shown as exact catalogue truth with intervals centred on it, so "holds the truth" cannot fail; the error is effectively one-dimensional, so "2 sigma" is an 84% cut (true 95th percentile 2.76 per-axis sigma) | Fix: show one seeded measured realization; judge against the simulated 95th percentile of the null (truly radial) distribution; report the one-dimensional rms; coverage tests |
| 3 | Confusing instrument | The Map's side plot leaves out the motion-dependent Shklovskii term and higher-order terms, so its best axis sits 2 to 3 deg from the checker's; D-A26's "about 1 deg" cone is really 0.7 to 8 deg depending on seed; the antipode is accepted | Fix: show the checker's own chi-square cost live beside the scatter (the number that decides); correct D-A26 (the instrument judges a line, both ends accepted; the cone width depends on the seed) |
| 4 | Dishonest error bar | `map.motionAxis` coverage (95.3%) draws from the fit's own covariance; across 200 full projections it is 93.0%; the default fit has chi-square 14.1 for 6 dof without inflation | Fix: record the full-model coverage; try scaling the fit's covariance by max(1, chi-square per dof) (the Birge ratio) and keep it if coverage moves toward 95% (it also governs `dating.epoch.velocityFit`, 90.5% now) |
| 5 | Self-agreement | `map.region` compares with "31 by 14 pc, about a thousand stars", which came from the code's own earlier output | Fix: compare with Sagan's design statement in `docs/research/cover.md` (the Sun placed to about 20 pc, "1 in 10^3 stars"); state that the count depends on the 30 pc catalogue and on radial velocities taken as zero for about half the stars |
| 6 | Checker and wording | The purity test refuses a truly pure start about 2.5% of the time at p < 0.05 (calibrated only at 0.01); "only a pure start fits" is false: starts up to about 3% of natural pass after a day | Fix: calibrate at 0.05 and state the refusal rate; reword the gloss, the hint and row 8 to "almost none of natural uranium's U-234 at the start; natural uranium rejected", with the accepted range computed and shown |
| 7 | Missing caveat, wrong hint | Separately prepared U and Th sources need chemical-yield tracers; "separate the two kinds of uranium" is impossible chemically | Fix: tracer caveat in How it's checked; hint reworded to counting by energy |
| 8 | Caveat | The detector background is a shielded-laboratory figure; in interstellar space cosmic-ray heavy nuclei would give about 1e-2 per second in the window (order of magnitude, unverified) | Decision: the Finder works on the cover in its own shielded laboratory (the record has been brought aboard: it is played on a turntable in The Player), so the laboratory figure applies; state it in D-A24 and How it's checked |
| 9 | Wording | `trail.when` says "within 1.0 sigma" for a 3-dof Mahalanobis distance (the 22% contour), inverts the sense of the velocity, and uses the measured observer instead of the frame of the chosen star | Fix: plain probability wording, the right sense, `observerRelativeTo(origin)` |
| 10 | Wording | `trail.reframe` claims the ages agree "only" in the origin star's frame; 6 of 9,701 catalogue stars with radial velocities also fit at 95% | Fix: reword (the ages agree in the origin star's frame, and in almost no other) and record the count |
| 11 | Low | Typed "5 deg" and "10 pc" in messages; `pass: true` literals and typed ranks in `trail.test.ts`; a tautological natural-ratio check; an inexact comment in `epochModel.ts`; `maxMm` 300 in `spot/data.ts`; How it's checked row 5's status; `chapter.spot` recorded 5.3/s against a model 2.9/s (replay it deterministically) | Fix all |

Spec for the fixes: `docs/plans/M4_specs/step7b-audit-fixes.md`.

## Checked and found sound (the auditor's list)

`starInMapPlane` (frames and signs; the Sun at (2.5, -3.3) pc checked by hand); the epoch wiring
(`projectCatalogue`, `drawObserver`, the Arrival RTG interval, shared reframe draws, `combineAges` keeping
correlations); `axisDeltaChi2` (closed form, 2-dof law, cross-checks); `map.identify`; `map.old`;
`bearingResiduals`; the Spot detector (on-axis closed form, far-field laws, independent Monte Carlo,
efficiency 0.0528, alpha energies, fixed-quantum counting, `ageFromU234` coverage 95.0%); the ruler's
sigma; `AGREE_CHI2_PER_DOF` = 2; `minAngleNoRv`.
