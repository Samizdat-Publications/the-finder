# The lead's assessment of Gemini 4 Argon's review (2026-10-22)

Argon read 391 tracked files (980,482 tokens: src, docs, data under 40 KB, tools except the decoders and the
voices analysis; tests left out) and answered `2026-10-22-argon-ask.md` in `2026-10-22-argon-answer.md`.
Each item was checked against the code before acting. Verdict: **worth using** for zero-context science and
cross-module reviews and for a child's-eye read of the tour text; its physics needs checking before use (one of
its "high" items was overstated).

| # | Argon's item | Checked | Action |
|---|---|---|---|
| 1.1 | Light-day: geometric range versus light time | Overstated. At the geometric crossing the one-way light time differs from a day by only seconds (Voyager recedes about 1.5 million km a day, 5 light-seconds), so "a radio message takes a full day" is right to about 0.01%. The exact moment light time equals one day is hours later, a different event | Our Frame states the geometric crossing and says "a full day, to within seconds" |
| 1.2 | Pulsar back-projection ignores the 1/d change of proper motion | Real but small: about 0.04 deg for the nearest fast pulsars, against map directions good to 3 deg | Science audit at the gate decides; noted |
| 1.3 | `spot.purity`: the true pure start refused on some seeds | Real: `seedCheck.ts` counts `pureStartRefused` and the bot proposes the fitted start instead. A player who dials the truth can be told no, against D-A28's no-dead-ends rule | Fix: accept the pure start at the 99.9% level as D-A28 does (builder-opus) |
| 1.4 | The planets' 8 discrepancies are 1970s values | Plausible, unsourced here | Carried to M7 (needs a 1970s table we can cite) |
| 2.1 | No em-dash hygiene check | Real: no tracked text has one today, but nothing enforces it | Add a hygiene step to `npm run check` |
| 2.2 | Clicks during "Do it for me" race the tour's actions | Real: nothing blocks the instrument while an action runs | Fix: hold the instrument while an action runs |
| 2.3 | Entering The Map: renderer creation in one task | Plausible cause of the flaky `enter` test | Fix with the perf item |
| 2.4 | "Start over" leaves chapter-local state behind | Confirmed for The Pictures (`initialised` at module level) | Fix in M6's no-dead-ends step |
| 2.5 | Unbounded decoded-audio cache in The Voices | Real, low | Fix if cheap |
| 3 | Portrait's deduction: do the four clocks tell one story | A strong candidate; adopted in the Portrait spec | See `docs/plans/M6_specs/portrait.md` |
| 4 | Tour friction (the picture-tuning run, units, voices.many, map.periods) | Fair reading of the script | A tour-text pass with real target values, after Portrait |
| 5 | Chapter select, an epilogue gallery and jukebox, social preview tags | Gallery is promised by rule 2; tags are cheap | In M6 and the V1.0 polish |

Cost: about $2 at the assumed Pro preview rate (Argon's own rate is not published in the model list).
