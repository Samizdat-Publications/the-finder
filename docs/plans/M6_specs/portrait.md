# Spec: Portrait (chapter 8)

_Lead: 2026-10-22. Read first: `docs/plans/M6.md`, `docs/plans/M6_specs/architecture-brief.md` (where everything
lives, with line numbers), CLAUDE.md hard rules, `docs/reviews/2026-10-16-M4-player-critic.md` ("the finish is
flat": the codex ends as a ledger), `docs/consults/2026-10-22-argon-answer.md` section 3._

## What the player sees and does

The Finder's portrait of the senders, assembled from the player's OWN confirmed results (no new facts). One
screen at 1440x900 and 1366x768 (no page scroll; an inner scroll only if the panel text needs it).

**The plate.** A dark plate drawn in gold (gold is reserved for the human artifact; this is the portrait of the
humans, so it is right here). Six panels around a centre band, each headed by its title in the Finder's glyph
script (`GlyphLabel`, as the ring and codex do), each line carrying a small link to its How it's checked row
(`/checked/#row-N` of the node it came from). Every value is read from the stored attempts (`lastOk(id)` and
`reading(a, key)`, copied from `src/chapters/moments.ts:49-52`) and shown with `<Value>` / `renderMessage` so the
human gloss works. If a source deduction is not confirmed the panel slot shows an outline only (it cannot be,
in play, because of the gating, but the code must not crash on old saves).

1. **Their star** (`trail.origin`, `trail.neighbour`): the warm-white star (its name as the trail chapter shows
   it), its distance from your star, its rank by distance and by brightness in your sky.
2. **How they look** (`pictures.height`): the two figures' heights in reaches beside a drawn reach bar, and the
   DECODED picture they were measured on (decode it with the existing browser decoder path the album uses; never a
   clean image, rule 2). If decoding is not ready, a placeholder outline, then the picture.
3. **Their world** (`pictures.home`): the third world out from their star, its distance, mass and day, and the
   decoded colour picture of it if the album composed one (`pictures.colour`), else the decoded grey frame.
4. **Their numbers** (`pictures.numerals`, `pictures.units`): their counting base and their second in beats.
5. **Their voices** (`voices.many`, `voices.octave`, `voices.others`): many voices; music that repeats at a ratio
   of two cut into twelve steps; others who call in their world (the longest call).
6. **Their machine** (`arrival.purpose`, `arrival.fuelAge`, `player.speed`): what it is and that it was made, the
   record's turn time (only what those deductions confirmed; read their readings, add nothing).

**The centre band: the deduction `portrait.together` ("One story"):** "Four clocks dated this machine. Do they
tell one story?" A horizontal time axis (years before now, in the alien's units with gloss) with four bars,
each a clock's own 95% interval from the player's confirmed result:
- the fuel clock (`arrival.fuelAge`: `'age'`, `'age low, 95%'`, `'age high, 95%'`),
- the uranium spot (`spot.age`: same keys),
- the pulsar map, read in the warm-white star's frame (`trail.when`: message tokens 0 to 2),
- the journey, distance over speed (`trail.age`: its interval; find how its checker states the bounds).
The player drags (or uses arrow keys on) one marker, "When it left", and presses **Propose: it left this long
ago**. Keyboard: the marker is a focusable slider (`role="slider"`, arrows step, Page keys step ten times).

**The checker (pure, `src/chapters/portrait/checkers.ts`, science in `src/science/consilience.ts`):**
- From each clock's estimate and 95% bounds take a Gaussian sigma (half the interval over 1.96; if a clock's
  interval is asymmetric, use the side facing the proposal, and say so in a comment).
- Combine by inverse-variance weighting: mean m, sigma_m. Agreement: chi-square of the four about m, 3 degrees of
  freedom, and its p value. **Correlation:** the map's reframed age and the journey both use the Finder's
  measured motion; read how `src/chapters/shared/epochModel.ts` builds them, and if they share an input, either
  include the covariance or drop the weaker one from the combination and say why in a comment and in the How it's
  checked row. Do not assume independence silently.
- Accept a proposal t when |t - m| is within the 99.9% two-sided band of sigma_m (D-A28: noise must never block
  the truth); the drawn band is 95%, labelled so. A refused proposal says (quantity tokens) how many of the
  clocks' 95% bars it falls outside, and where the clocks agree.
- Readings on success: `'when it left'` (time, m), `'95% low'`, `'95% high'`, `'clocks agreeing, p'`, and
  `'clocks'` (count). Headline in `src/chapters/portrait/headlines.ts`: the combined age, sentence "Every clock
  tells the same story." (no digits in the sentence).
- Honesty note in the result's working (folded): each clock starts at a slightly different event (fuel made,
  spot laid, map measured, launch) a few years apart, far inside the error bars. Our Frame tells the map's six
  years.

**Tests (`src/chapters/portrait/portrait.test.ts`, `src/science/consilience.test.ts`) with `recordCheck`:**
- `portrait.together`: from the DEFAULT seed's real right answers (build them as the other chapter tests do,
  or from the bots' known answers), the combination contains the true discovery age (`discoveryState`'s
  `yearsAfterLaunch`, from `epoch.ts`, independent of the clocks), the chi-square p is above 0.001, a proposal at
  m is accepted, one clock's own estimate is accepted only if inside the band (report), a time 1,000 years off is
  refused.
- `portrait.coverage`: over at least 200 validated seeds (`data/seeds.json`), the 95% combined interval contains
  the true age in a fraction inside the binomial 95% band around 0.95 (report the fraction), and the truth is
  accepted (99.9% band) in every seed. If the coverage fails, STOP and report; do not tune.
- `consilience.math`: inverse-variance mean and chi-square against a hand-worked case.
- Add Portrait to `src/chapters/seedCheck.ts` `verifySeed` (the right answer is m from that seed's own results).
  Do NOT rebuild `data/seeds.json` (another helper is rebuilding it now; the lead rebuilds at the end).

## The sky moment (the chapter's end)

On confirmation, after the result: a staged moment (add `portrait.together` to `MOMENTS` and `MOMENT_IDS`, both
copies) on the Finder's own sky: reuse `SkyBackdrop` (`src/chapters/trail/moments.tsx:76`, the sky from the home
star with the origin star ringed). The warm-white star brightens a little, a gold ring closes on it, and its
name appears in the Finder's glyph script with the gloss "the senders' star" (a new glyph key; follow how glyph
keys are added). The sentence: "They live there. They sent it about this long ago." with the combined age as the
quantity. Reduced motion: a still. Skippable like the others. After the moment the plate stays, with the sky as
a strip across its top showing the ringed star.

## Sound

`src/audio/`: Portrait's own bed `'portrait'`: a slow chord built from the root notes of the chapters the plate
draws on (`CHAPTER_VOICE` roots of arrival, key, player, pictures, map, spot, trail, voices), voiced softly in
one register, under the beds' usual level; register it as the brief says (Bed union, `buildBed`, `BED_TRIM`,
the levels test in `tests/browser/sound.browser.mjs`, the keys/beds pin in `cues.test.ts`). The confirmation of
`portrait.together` gets its own cue, a resolving swell (CueKind, MIN_GAP_MS, CAPTIONS "the clocks agree", sink,
renderer). Captions for both.

## Wiring

- `src/game/nodesM6.ts`: the node `portrait.together` (key "One story", gloss, requires every deduction the plate
  reads, `checkedRow: 17`, three hint tiers: nudge, method, answer; the answer tier says what to do on the
  instrument without typed numbers). Merge into `ALL_NODES` (`graph.ts:397`) with its question map. Start
  `later: true`; clear it when the checker and instrument pass.
- `CHAPTERS` portrait entry (`graph.ts:72`): `requires` the deductions the plate reads; flip `built: true` last.
- `src/chapters/portrait/`: `index.ts`, `PortraitInstrument.tsx`, panels, `ClocksBand.tsx`, `checkers.ts`,
  `headlines.ts`, `moments.tsx`, `portrait.css`; add `./portrait/index` to `src/chapters/index.ts`.
- How it's checked: a new deduction row 17 "Portrait" listing `portrait.together`, `portrait.coverage`,
  `consilience.math` (edit the row source the generator uses; never the generated section by hand). Raise the
  `checkedRow` bound in `graph.test.ts` and the node count (43 to 44).
- The tour: the LEAD writes the stops. Give these stable hooks: `data-portrait-marker` (the slider),
  `data-portrait-propose` (the button), `data-portrait-panel="star|look|world|numbers|voices|machine"`. Also
  export a `portraitHandle()` like the Map's `chartHandle()` that sets the marker to a value, so the tour's
  "Do it for me" can move it without pixel dragging; write `src/tour/actions/portrait.ts` with the
  `portrait.together` action (set the marker to the combined mean through the handle, then press Propose) and
  add it to `SHOW_ME` and `TARGETS` in `src/tour/actions.ts`; update the hard-coded count in `actions.test.ts`.
  Do not edit `src/tour/script.ts` (the lead does; until then `script.test.ts` may fail on the new node: report).
- bot.game (`tests/browser/game.browser.mjs`): export `playPortrait(page)` from a new
  `tests/browser/portrait.browser.mjs` (which also tests the instrument: a wrong proposal refused with its
  message, the right one confirmed, the moment shown, the plate's six panels filled, no console errors) and
  add its id to `ALL_IDS`.

## Rules and checks

CLAUDE.md hard rules: no em dashes anywhere; no typed numbers in UI or hints (every number from readings or
science); `src/science/` pure; the bus for proposals (`deduction.propose`); stage nothing, do not commit.
Other helpers are working at the same time on: Our Frame (`src/chapters/epilogue/`, `deductions.ts`
`chapterStatus`, the epilogue line of `CHAPTERS`), the Spot purity fix and seeds, the Voices machine-tone fix,
the film-tour harness. Touch only your files; re-read `graph.ts`, `src/chapters/index.ts` and
`game.browser.mjs` right before editing them (others edit nearby lines).

**Must pass:** `npx tsc --noEmit`; `npx vitest run src/science src/chapters/portrait src/game src/audio
src/chapters/headlines.test.ts`; `node tools/harness/browser-tests.mjs portrait`; `node
tools/harness/browser-tests.mjs sound`. Take screenshots of the plate before and after confirming and of the sky
moment at 1440x900 and 1366x768 into `review/archive/<timestamp>-portrait/` and list them in your report.

**Report:** files changed; the default seed's four clocks, m, sigma_m, chi-square p; the coverage numbers; the
correlation decision; test tails; screenshot paths; anything you could not do honestly.
