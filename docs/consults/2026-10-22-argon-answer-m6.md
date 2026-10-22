Here is the review of the new M6 work (`portrait`, `epilogue`, `consilience`, `voyagerNow`, and the new tour stops), ordered by impact within each section.

---

### 1. Science

1. **`portrait.coverage` tests the combination against `yearsAfterLaunch`, ignoring the pulsar map's +8 year true epoch offset (Medium)**
   - **Where:** `src/chapters/portrait/portrait.test.ts` (lines 28, 152–193), `src/chapters/portrait/checkers.ts` (lines 17–25), `docs/HOW_ITS_CHECKED.md` (row 17).
   - **The issue:** In `portrait.together`, the pulsar map clock (`trail.when`, $\sigma \approx 72\text{ yr}$) carries **$\sim 85\%$ of the inverse-variance weight** (since the other three clocks have $\sigma \approx 340\text{–}690\text{ yr}$). However, the map's true epoch is $\sim 1969.7$ (`dateMapToday`), whereas `TRUTH = discoveryState(...).yearsAfterLaunch` counts from $1977.68$ - an **8.0-year systematic offset** ($\sim 0.11\sigma_{\text{comb}}$). In `trail.test.ts` (`mapTruthYears`, line 29), you carefully tested `trail.when` against the weighted implied epochs of the kept pulsars ($44,109\text{ yr}$), *not* `yearsAfterLaunch` ($44,100.4\text{ yr}$). In `portrait.coverage`, testing against `TRUTH` ($44,100.4\text{ yr}$) produces a systematic negative pull (`meanPull` $\approx -0.11$), which is why coverage sits at the bottom edge of the binomial band (188/200 = 94.0%).
   - **Independent check:** Compute the weighted true age $t_{\text{true}} = \sum w_i t_{\text{true},i}$ (where $t_{\text{true,map}} \approx 44,109\text{ yr}$ and the other three are $44,100.4\text{ yr}$) in `portrait.test.ts` and report both the pull against launch time and the pull against the weighted true event time.

2. **The correlation between `trail.when` and `trail.age` is zero in the simulation only because `kinematics.ts` and `epochModel.ts` draw the Sun's velocity twice independently (Low / Caveat)**
   - **Where:** `src/chapters/portrait/checkers.ts` (lines 17–29), `src/chapters/portrait/portrait.test.ts` (lines 89–118).
   - **The issue:** Your finite-difference calculation in `portrait.test.ts` (lines 89–118) is a great addition and rightly shows that even if the Finder used a single shared measurement of the Sun-relative state $(\Delta\mathbf{r}, \Delta\mathbf{v})$, the correlation $\rho$ between the pulsar-map reframe age and the kinematic travel time $d/v$ is tiny ($\rho \approx 0.005$). Why? Because the pulsar ensemble's mean $\langle \tau_c \hat{\mathbf{n}} \rangle$ is nearly orthogonal to the Sun–Gliese 445 line of sight (where the $0.15\text{ km/s}$ radial-velocity error lives). That physical explanation is worth stating in one clause in `HOW_ITS_CHECKED.md` row 17 so a reader understands *why* $\rho \approx 0.005$ isn't a bug.

3. **Asymmetric interval fixed-point in `combineClocks` is sound and converges in $\le 2$ steps (Pass)**
   - **Where:** `src/science/consilience.ts` (`sigmaFacing`, `combineClocks`, lines 28–124).
   - **Verdict:** Because $m$ is dominated by the symmetric pulsar-map interval and sits near $44,050\text{ yr}$, the facing side of any mildly asymmetric Poisson/Wilson interval (`spot.age`, `arrival.fuelAge`) settles in 1–2 iterations and makes the target independent of the player's slider position.

4. **Our Frame science & historical facts (`data/epilogue.json`, `future.ts`, `mapEpochs.ts`) (Pass)**
   - **Where:** `src/chapters/epilogue/future.ts`, `src/chapters/epilogue/mapEpochs.ts`, `data/epilogue.json`.
   - **Verdict:** The cylindrical projection $(z_{\parallel}, \rho_{\perp})$ along Voyager 1's asymptote in `future.ts` (`unroll`, lines 21–24) is a clever, exact way to preserve both the heliocentric distance $|\mathbf{r}|$ and the craft-to-star distance $|\mathbf{r}_{\text{star}} - \mathbf{r}_{\text{craft}}|$ on a flat 2D diagram, and the caption (`SlowFuture.tsx`, line 82) explains it honestly. The light-day wording ("takes a full day (to within seconds) to cross the gap") is accurate.

---

### 2. Bugs and fragile code

1. ** Tour guide instruction for `portrait.together` asks the player to place the marker "where all four bars overlap", which can be impossible on $\sim 18\%$ of valid seeds! (High)**
   - **Where:** `src/tour/script.ts` (line 532), `src/chapters/portrait/ClocksBand.tsx` (lines 32–42, 118–123).
   - **The bug:** The four clocks each have an independent 95% confidence interval. The probability that all four independent 95% intervals share a common intersection point is at least $(0.95)^4 \approx 81.5\%$, meaning on **$\sim 15\text{–}18\%$ of valid seeds**, one of the four 95% bars (usually `spot.age` after a 1-day count, or `arrival.fuelAge`) will sit slightly to the left or right of the narrow `trail.when` bar!
     - In `ClocksBand.tsx` (lines 118–123), you wisely highlight segments where `s.n >= CLOCKS.length - 1` (3 or 4 bars overlapping) and draw the gold band after confirmation.
     - However, in `src/tour/script.ts` (line 532), `todo` says:
       > `"Drag the **round marker** under the clock bars (or click it and use the arrow keys) to the place where all four bars overlap, then press **Propose: it left this long ago**."`
     - And in `src/chapters/portrait/checkers.ts` (line 138), the refusal message says:
       > `"Move the marker into the band where the bars overlap."`
     - If a player is on a seed where `spot.age` is a $2.1\sigma$ draw (so only 3 bars overlap at the narrow `trail.when` bar, and the 4-bar intersection is empty), looking for "where all four bars overlap" or aiming for the middle of the wide bars instead of the narrow map bar will cause a refusal!
   - **Fix:**
     1. In `ClocksBand.tsx`, draw a subtle target tick or glow at the weighted combination even before confirmation, **or** tell the player in `script.ts` and `nodesM6.ts` that **the narrowest bar (the pulsar map) carries the most weight**, so they should aim for the bright overlap band inside the narrowest bar.
     2. Change `script.ts` line 532 from `"where all four bars overlap"` to `"into the bright band where the bars overlap (right inside the narrow pulsar-map bar)"`.

2. **Keyboard navigation in `EpilogueInstrument.tsx` hijacks `ArrowLeft` / `ArrowRight` while the Tour is open, desyncing the Tour step from the Epilogue section (Medium)**
   - **Where:** `src/chapters/epilogue/EpilogueInstrument.tsx` (lines 68–84), `src/tour/Guide.tsx` (lines 125–128).
   - **The bug:** In `EpilogueInstrument.tsx`, the `window` `keydown` listener advances `epilogueSection.value` on `ArrowRight` / `ArrowDown` / `PageDown` and goes back on `ArrowLeft` / `ArrowUp` / `PageUp`. When the player is in the **Guided Tour** on stops `finale.turn` through `finale.carter` (Steps 53–59), pressing an arrow key changes `epilogueSection.value` (e.g., jumping to section 6 `line`) while the Tour Guide on the right is still on `finale.turn` (Step 53)! Conversely, clicking `Next` in the bottom bar of `EpilogueInstrument` (`.epi-next`) advances the Epilogue section without advancing the Tour Guide!
   - **Fix:** When `game.tour.value.on` is `true`, hide `.epi-nav` (or make `.epi-next` and `.epi-dots` dispatch `tour.goto` to the matching `finale.*` stop) and disable the standalone `epilogueSection` arrow-key listener so the Tour Guide and the Epilogue stage cannot get out of sync.

3. **Clicking "Back to the ring" (`[data-epilogue-ring]`) on the last section of Our Frame while in the Tour leaves the Tour stranded (Medium)**
   - **Where:** `src/chapters/epilogue/Line.tsx` (lines 129–131), `src/tour/Guide.tsx` (lines 140–149).
   - **The bug:** On `finale.line` and `finale.carter`, Section 6 (`Line.tsx`) shows a prominent button: **Back to the ring**, which dispatches `{ type: 'chapter.enter', chapter: 'hub' }`. If a tour player clicks **Back to the ring** instead of the Guide's **Finish** button, `game.chapter.value` becomes `'hub'` while `game.tour.value.on` is still `true` and `step` is `57` (`chapter: 'epilogue'`). Because `Shell.tsx` renders `<StoryStage />` whenever `game.chapter.value === 'hub' && game.tour.value.on`, the player is dumped onto a hub story card that says *"You have left this step. [Go back to it]"* instead of finishing the tour!
   - **Fix:** In `Line.tsx` line 129, if `game.tour.value.on` is `true`, either hide the `Back to the ring` button (since the Guide has its own `Finish` button) or have it dispatch `{ type: 'tour.exit' }`.

4. **`startRecord()` / `stopRecord()` in `src/chapters/epilogue/recordSound.ts` can corrupt `turntable.volume` on rapid re-entry (Low)**
   - **Where:** `src/chapters/epilogue/recordSound.ts` (lines 43–72).
   - **The bug:** `startRecord()` and `stopRecord()` are async functions called from `useEffect` in `EpilogueInstrument.tsx` (lines 60–65). If the player enters `epilogue`, `startRecord()` sets `volumeBefore = T.volume.value` (0.8) and dispatches `turntable.setVolume(0.3)`, then awaits `turntable.load` (network fetch of side 2). If the player leaves `epilogue` and re-enters before the first `startRecord()`'s `load` finishes, `stopRecord()` resets `volumeBefore = null`, and the second `startRecord()` captures the lowered volume (`0.3`) or races with the first `load` completion.
   - **Fix:** Use a monotonic token (like `dropToken` in `turntableService.ts`) in `recordSound.ts`: increment `runId` in `startRecord` and `stopRecord`, and check `myId === runId` after every `await`.

5. **Portrait reading stored attempts from old/migrated saves (`ClocksBand.tsx`) (Low)**
   - **Where:** `src/chapters/portrait/ClocksBand.tsx` (lines 167–175), `src/chapters/portrait/checkers.ts` (lines 67–88).
   - **The bug:** You handled missing panels gracefully (`!all` shows dashed outlines in `ClocksBand.tsx`), **but** the Propose button in `ClocksBand.tsx` (line 169) is only disabled when `status !== 'open' || m === null`, *not* when `!all`! If a v0 migrated save has `confirmed: true` on all prerequisites with empty `attempts: []` (which `save.ts` lines 83–85 produces for v0 saves), `status` is `'open'`, `clocks` is empty (`all === false`), `m` is `null` (so the button is disabled), and the player has no way to populate the 4 clocks without replaying them. That's only possible for v0 saves (pre-M3), so it's minor, but disabling Propose when `!all` makes the guard explicit.

---

### 3. The ending for a 12-year-old (Tour & UI prose review)

Overall, the new stops (`portrait.plate`, `portrait.together`, `portrait.sky`, and `finale.turn` through `finale.carter`) are warm, clear, and hit the right emotional notes. Three specific lines need tightening:

1. **Grammatical tangle in `finale.listening` (`src/tour/script.ts`, line 571)**
   - **Current text:**
     > `"That is the same decay we used as a clock in Arrival. The plutonium the Finder found was gone is the power supply these machines are running on today."`
   - **Why it trips a reader:** *"The plutonium the Finder found was gone is the power supply..."* has a garden-path double verb (*"found was gone is"*).
   - **Concrete rewrite:**
     > `"That is the same nuclear decay we used as a clock in Arrival. By the Finder's time, all the plutonium-238 had decayed away; today, it is still warm, and it is the power supply keeping both Voyagers alive."`

2. **Make `portrait.together` (`src/tour/script.ts`, lines 530–532) explain *why* the bars have different widths**
   - **Current `look` & `todo`:**
     > `look`: `"Four separate clocks dated this machine: the **fuel** (plutonium turning into other atoms), the **uranium spot** on the cover, the **pulsar map** read from the warm-white star, and the **journey** (distance divided by speed). Each bar is one clock's answer, with its error bar. If they tell one story, there is a time that all four allow."`
     > `todo`: `"Drag the **round marker** under the clock bars (or click it and use the arrow keys) to the place where all four bars overlap, then press **Propose: it left this long ago**."`
   - **Why a 12-year-old will ask:** On screen, the pulsar map bar (`trail.when`) is tiny ($\pm 140\text{ yr}$), while the spot and fuel bars are 10 times wider ($\pm 1,000\text{–}1,400\text{ yr}$). A kid will wonder why one bar is so short and the others are so long.
   - **Concrete rewrite:**
     > `look`: `"Four separate clocks dated this machine: the **fuel**, the **uranium spot** on the cover, the **pulsar map** read from the warm-white star, and the **journey** (distance divided by speed). Each bar shows one clock's 95% range. Notice how narrow the pulsar map's bar is - ten spinning stars together keep much sharper time than our atom counts!"`
     > `todo`: `"Drag the **round marker** (or click it and use the arrow keys) into the bright band where the bars overlap - right inside the narrow pulsar-map bar - then press **Propose: it left this long ago**."`

3. **`MapOlder.tsx` (`src/chapters/epilogue/MapOlder.tsx`, line 91): clarify why the 6-year gap is invisible to the Finder**
   - **Current UI text:**
     > `"Your own reading in The Trail: read from the warm-white star, the map was made about 44,068 years before you found the machine (95%: 43,930 to 44,210), which had by then been flying about 44,100 years. The six years between the map and the launch sit far inside that spread: clocks like these cannot see the gap."`
   - **Why it's slightly confusing:** For `finder-1`, the Finder's map reading ($44,068\text{ yr}$) happens by random noise to be *smaller* than the flight time ($44,100\text{ yr}$), even though the map is 6 years *older*! A sharp 12-year-old will say: *"Wait, 44,068 is less than 44,100 - doesn't that mean the map is younger?"*
   - **Concrete rewrite (`MapOlder.tsx` lines 90–94):**
     > `"Your own reading in The Trail dated the map to about {grouped(own.yearsAgo)} years ago (95% range: {grouped(own.low)} to {grouped(own.high)} years), while the machine has been flying for {grouped(flown)} years. Because our clock's uncertainty is {grouped((own.high - own.low) / 2)} years either way, a six-year head start is far too small for the Finder's clocks to tell apart."`

---

### 4. What a V1.0 still lacks (in priority order)

Now that all 10 chapters and 62 tour stops exist and play end-to-end:

1. **Fix the Tour / Epilogue navigation collision (Item 2.2 & 2.3 above):**
   - Before Stewart and his son reach the finale, make sure pressing arrow keys or clicking `.epi-next` / `Back to the ring` inside `Our Frame` while the Tour is active doesn't desync the Tour panel from the 6 Epilogue sections.
2. **Rebuild `data/seeds.json` with `portrait.together` included:**
   - As noted in `docs/plans/M6_specs/portrait.md`, `seedCheck.ts` now includes `portrait.together`, and `spot.purity` was updated to 99.9% Chernoff acceptance. Make sure `node tools/seeds/build-seeds.mjs` has been run so `data/seeds.json` reflects all 44 deductions.
3. **Unlock free jumping between Parts / Chapters once the Tour is completed (Chapter Select):**
   - `PLAN.md` promises *"a chapter select after finishing"*. In `src/tour/progress.ts` (`partDots`), `reachable` is `first <= furthest`, which already unlocks all 12 part dots once the player reaches `finale`! However, on the Hub ring (`Hub.tsx`), chapters remain in tour mode unless the player exits the tour. Making it obvious at the end of `finale.carter` that they can now click any of the 12 Part dots at the top of the guide - or exit to the ring to explore the full album and jukebox freely - gives them a great post-game sandbox.
4. **Open-Graph / Social Preview Meta Tags (`index.html`, `play/index.html`, `checked/index.html`):**
   - Still worth adding before you hand Stewart the final shareable link (`og:title`, `og:description`, `og:image`), so pasting `https://the-finder.stewartgregerson.workers.dev` into iMessage, WhatsApp, or Discord shows a preview card.