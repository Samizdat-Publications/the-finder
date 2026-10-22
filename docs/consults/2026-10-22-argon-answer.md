Here is a second-opinion review of the repository, ordered by impact within each section.

---

### 1. Science cross-checks

1. **Missing light-travel time in the one-light-day calculation (High)**
   - **Where:** `src/science/ephemeris.ts` (`crossingJd`, `distanceKm`, `lightTimeHours`), `src/tour/VoyagerNow.tsx`, `docs/HOW_ITS_CHECKED.md` (`epilogue.lightDay`).
   - **The issue:** `crossingJd` finds when the instantaneous geometric distance $|\mathbf{r}_{\text{V1}}(t) - \mathbf{r}_\oplus(t)| = c \times 86400\text{ s}$. However, a one-way light-time (down-leg or up-leg) is defined by the retarded/advanced equation $|\mathbf{r}_{\text{V1}}(t) - \mathbf{r}_\oplus(t \pm \Delta t)| = c \Delta t$. Over 1 day, Earth moves $\sim 2.59 \times 10^6\text{ km}$ ($\sim 8.6$ light-seconds) along its orbit. Depending on whether NASA's `10:16:07 UTC` figure is down-leg light time, up-leg light time, or instantaneous geometric range, an 8.6-second light-time difference translates to **several minutes** of crossing-time difference (since the range rate is $\sim 36\text{ km/s}$). Your 11-second agreement with NASA (`10:16:18` vs `10:16:07`) proves NASA's press figure is also geometric range, but calling it "the time a radio message takes" in `VoyagerNow.tsx` conflates geometric range with light-time.
   - **Independent check:** Solve $|\mathbf{r}_{\text{V1}}(t - \Delta t) - \mathbf{r}_\oplus(t)| = c \Delta t$ for $\Delta t = 86400\text{ s}$ and compare it against Horizons' `LT` column (`VEC_TABLE=3`, which you already have in `docs/research/data/voyager/lightday.py`). State both the geometric range crossing and the true down-leg light-time crossing in `Our Frame`.

2. **Pulsar proper-motion back-projection ignores the $1/d$ scaling of angular motion (Medium)**
   - **Where:** `src/science/pulsarIdentify.ts` (`backProjected`, lines 84-91).
   - **The issue:** `backProjected` moves the unit vector $\hat{\mathbf{n}}$ linearly in tangent space by $\boldsymbol{\mu} \cdot \Delta t$ using the present-day proper motion $\boldsymbol{\mu}$. For a star moving at constant 3D velocity $\mathbf{v}$, the angular rate $\mu(t) = v_\perp / d(t)$ changes as distance changes, and the tangent plane itself rotates. For nearby fast pulsars (like B1929+10 at $0.31\text{ kpc}$ or B0950+08 at $0.26\text{ kpc}$) over 44,100 years, an unknown radial velocity of $\sim 200\text{ km/s}$ changes $d$ by $\sim 9\text{ pc}$ ($\sim 3\%$), changing the integrated proper motion by $\sim 0.1^\circ$. Meanwhile, `backProjectedPositionPc` (line 195) does a 3D Cartesian back-projection assuming $v_r = 0$. The two functions use slightly different kinematics when $d$ is known.
   - **Independent check:** Propagate a synthetic star with $d = 0.25\text{ kpc}, \mu = 100\text{ mas/yr}, v_r = \pm 200\text{ km/s}$ forward 44,100 yr in 3D Cartesian space, then run `backProjected` on the end state and measure the angular residual against the true initial position.

3. **Two-clock purity test (`spot.purity`) uses an uncalibrated asymptotic $\chi^2_1$ cutoff (Medium)**
   - **Where:** `src/science/clocks.ts` (`testStartHypothesis`, `acceptedStartRange`), `src/chapters/spot/checkers.ts` (`REJECT_P = 0.05`).
   - **The issue:** In `HOW_ITS_CHECKED.md` (`clocks.uranium.purity05`), you note that for a pure start ($r_0 = 0$, on the boundary of the parameter space $r_0 \ge 0$), the likelihood-ratio test rejects the truth 2.7% of the time at the nominal 5% level (Chernoff's 1954 $\frac{1}{2}\chi^2_0 + \frac{1}{2}\chi^2_1$ theorem). However, `acceptedStartRange` uses the same unadjusted $\chi^2_1$ critical value for interior points $r_0 > 0$ as well as the boundary, and `seedCheck.ts` had to add a workaround (`pureStartRefusedAtOneDay: 44` out of 2,000 seeds!) where the bot proposes the fitted $r_0 > 0$ instead of $0$ when $0$ is refused. A player who dials $0$ (pure U-238, the true historical answer) has a 2.2% chance of being told by the game that their answer is wrong!
   - **Independent check:** Either use the boundary-corrected critical value for $r_0 = 0$ and widen the acceptance to 99.9% (as you did in D-A28 for `trail.origin` so players never hit a false rejection on the truth), or test $r_0 = 0$ against $r_0 = 1$ (Bayes factor / likelihood ratio between the two physical hypotheses) rather than against an unrestricted $r_0$ MLE.

4. **Table 14 (`teaching.planets`) marks 8 discrepancies as "cause UNVERIFIED" when they are 1977 historical values (Low)**
   - **Where:** `docs/HOW_ITS_CHECKED.md` (row 14, `teaching.planets`), `src/science/teaching.ts`.
   - **The issue:** Row 14 says 8 cells outside the outer planets differ from today's NASA Planetary Fact Sheet and calls their cause "UNVERIFIED". They are not mysterious: in 1977 (pre-Voyager, pre-Magellan, early radar), Mercury's diameter was listed as $4840\text{ km}$ (e.g., *Allen's Astrophysical Quantities*, 3rd ed., 1973), Venus's radar rotation period was rounded to $243\text{ d}$, and Mercury's mass $1/19\text{ M}_\oplus$ is $0.0526$ vs $0.0553$ (rounded unit fraction).
   - **Independent check:** Check the numbers against a 1970s reference table (e.g., *Allen's Astrophysical Quantities* 1973 or *CRC Handbook* 1976) rather than a 2025 fact sheet.

---

### 2. Bugs and fragile code

1. **`tools/check.mjs` does not fail on CLAUDE.md Rule 13 (em-dash ban), and `docs/CREDITS.md` currently violates it (High)**
   - **Where:** `docs/CREDITS.md` line 89 (`"To the makers of music – all worlds, all times"` contains `U+2013` en-dash; check if any em-dashes `U+2014` slip in), `src/tour/script.ts`, `tools/check.mjs`.
   - **The bug:** `PLAN.md` ("Automated checks #12: Hygiene: no em dashes in tracked text, no secrets, every file under 20 MB, links valid") promises a hygiene check in `npm run check`, unless it is buried in a unit test not shown here. If a doc or tour edit introduces an em-dash, `check.mjs` should catch it.

2. **Tour spotlight and "Do it for me" race when the player clicks controls manually while an action is running (Medium)**
   - **Where:** `src/tour/Guide.tsx` (`Turn`, lines 43-54), `src/tour/actionsKit.ts`.
   - **The bug:** When the user clicks `Do it for me`, `busy` is local to `Turn`, but the instrument itself is not pointer-blocked. If the child clicks on the platter, cover, or chart while `SHOW_ME[stop.id]()` is awaiting `sleep(...)` or `waitFor(...)` (some of which take 15-60 seconds, like `player.firstSound` or `pictures.album`), the player's click mutates the instrument signals (`selectedLine`, `picked`, `quarterTurns`, turntable needle) mid-script, causing the action to either propose the wrong thing or time out after 60s.
   - **Fix:** Add a `tourBusy` signal or `pointer-events: none` on `.bench-main` while a `Show me` / `Do it for me` promise is in flight (with a "Cancel" button if they want to take over).

3. **Main-thread blocking in `GalaxyPane` / `MapInstrument` on entry (`enter` perf test flake) (Medium)**
   - **Where:** `src/chapters/map/MapInstrument.tsx`, `src/chapters/map/CoverMap.tsx` (line 13: `const geom = parseCoverMap(svgText);` at module top-level!), `src/chapters/shared/coverData.ts` (`export const coverModel = parseCoverSvg(svgText);` at module top-level!), `src/chapters/pictures/PicturesInstrument.tsx` (`const plate = picturesPlate(svgText);` at module top-level!).
   - **The bug:** In `PROGRESS.md` ("Known issues"), you note that the `enter` browser test is flaky on entering The Map (86 to 166 ms main-thread task vs 100 ms limit) and suspect machine power state or WebGL setup. Look at `GalaxyPane.tsx`: `mountGalaxy` is deferred with `setTimeout(..., 0)`, which is good, **but** when `prepare(seed)` finishes in `src/chapters/map/load.ts`, setting `model.value = m` and `phase.value = 'ready'` triggers a synchronous Preact render of `GalaxyPane` + `CoverMap` + `LinePanel` + `mountGalaxy` (which synchronous-compiles shaders, builds 4,366 pulsar `Float32Array` buffers, and runs `new THREE.WebGLRenderer` in one task). Creating a `THREE.WebGLRenderer` alone takes 40-90 ms on Windows Chrome (ANGLE D3D11 context creation).
   - **Fix:** Split `createChartRenderer` (WebGL context creation) from `buildGalaxy` + `makePoints` across two `requestAnimationFrame` / `setTimeout(0)` ticks, or pre-warm the shared WebGL context.

4. **Module-level `initialised` flags break "Start over" (`save.reset`) in `PicturesInstrument` and `MapInstrument` (Medium)**
   - **Where:** `src/chapters/pictures/PicturesInstrument.tsx` (line 28: `let initialised = false;`), `src/chapters/map/MapInstrument.tsx` (line 17: `let resumedFor: string | null = null;`), `src/chapters/map/load.ts` (`let regionDone = false;`), `src/chapters/pictures/album.ts` (`album.value` is never cleared on `save.reset`).
   - **The bug:** If a player plays into The Pictures, develops frames into `album`, then opens Settings and clicks **Start over** (`save.reset`), `game.records` and `game.seed` reset, **but** `initialised` in `PicturesInstrument.tsx` stays `true`, `album.value` keeps all 156 developed frames, `watched.value` and `thumbs.value` in `seen.ts` keep the watched frames, and `workState.ts` (`view`, `numeralTable`, `markedColumn`, etc.) keeps the old answers!
   - **Fix:** Subscribe to `game.seed` (or a reset counter) to clear chapter-local signals (`album`, `watched`, `thumbs`, `workState`, `initialised`, `assignments`, `picked`, `marked`), or reset them inside `resetSave()` in `src/game/gameService.ts`.

5. **Audio memory pressure in `voices` + `turntable` on 32-bit/low-RAM tablets (Low)**
   - **Where:** `src/media/audio.ts` (`decodedBudgetBytes = 768 * 1024 * 1024`), `src/chapters/voices/analysisClient.ts` (`decoded = new Map<string, Promise<Float32Array>>()`, unbounded).
   - **The bug:** `analysisClient.ts` caches decoded mono `Float32Array`s forever in `decoded` and `settled` without eviction, separate from `AudioStore`'s 768 MB budget.

---

### 3. Portrait and Our Frame (Design for a 12-year-old + parent)

**What to avoid:**
- **Do not make Portrait a reading exam or a drag-and-drop tax return.** The blind critic (`2026-10-16-M4-player-critic.md`) already warned: *"The finish is flat: the codex ends as a ledger of glyph rows and equations."* If Portrait is just a table of 43 numbers in alien glyphs, a 12-year-old's eyes will glaze over.
- **Do not introduce new fiddly mechanics.** After 55 stops, they have earned the payoff.

**How to design Portrait:**
- **Visual:** A single, dark, quiet canvas - the Finder's "museum exhibit" or "plaque of the senders". Around the centre sit cinco/six empty slots, each corresponding to one of the big questions: **Their Star**, **When They Sent It**, **Their World**, **Their Bodies**, **Their Minds (Numbers & Music)**, **Their Companions**.
- **The single deduction (`portrait.senders` or `portrait.who`):** *"Four clocks dated this machine. Do they tell one story, or four?"*
  - Have the instrument display the four independent timelines side-by-side on a single time bar:
    1. The RTG plutonium-to-thorium decay age (`arrival.fuelAge`)
    2. The cover's uranium-238 spot age (`spot.age`)
    3. The pulsar map's reframed spin-down age (`trail.when`)
    4. The star trail's distance-over-speed travel time (`trail.age`)
  - All four error bars overlap around **44,100 years ago**. The player's action is to slide a single marker ("When it left") into the overlapping window where all four clocks agree, and press **Assemble the portrait**.
  - Why this works scientifically and emotionally: It is the ultimate triumph of consilience - nuclear physics, pulsar astrophysics, and stellar kinematics all pointing to the exact same century - and it requires one clear, visual action.
- **The ending beat of Portrait:** Once confirmed, the decoded colour picture of Earth (`L013-L015`), the two human figures (`L039`) scaled next to one of the alien's "reaches", and the whale call / Bach Gavotte appear together, and the camera pans up to the encounter sky and zooms in on the bright warm-white star (-0.14 mag) sitting right next door.

**How to design Our Frame (Epilogue):**
- **The transition:** A deliberate 2-second fade to black where the alien glyphs gently morph into plain English typography, and the alien units flip to kilometres, hours, and years. The voice changes from *"you (the Finder)"* to *"us (Earth, today)"*.
- **Three beats on one screen:**
  1. **Right Now (Live):** Your `VoyagerNow` component (already great!) showing the live ticking distance in km and light-hours, plus which instruments are still alive (`MAG` and `PWS` on V1; `CRS`, `MAG`, `PWS` on V2) and the 18 November 2026 light-day milestone.
  2. **The 6-Year Secret:** A short note revealing what the science core found: the pulsar map on the cover dates to **1971**, six years *before* Voyager launched in 1977, because Sagan and Drake reused their 1972 Pioneer plaque periods without updating them. Kids love learning that they caught NASA taking a shortcut!
  3. **The Hand-Etched Line:** Show the inner run-out groove of the gold disc, where Timothy Ferris had *"To the makers of music - all worlds, all times"* etched by hand - the one part of the cover not written in binary. Play *Dark Was the Night, Cold Was the Ground* or *Cavatina* softly underneath.

---

### 4. The guided tour: where a 12-year-old will get lost or bored

The script in `src/tour/script.ts` is warm, clear, and well-paced overall, but there are **four specific friction points** where the instructions are either too abstract or ask for too many mechanical sub-steps at once:

1. **The 7-step Picture-Tuning Marathon (`pictures.lineTime` -> `sync` -> `interlace` -> `polarity` -> `aspect` -> `circle` -> `firstFrames`, Steps 18–25)**
   - **The problem:** Seven stops in a row of "turn a knob, press Propose, read why, press Next" before seeing a single real photo from Earth. By `pictures.polarity`, a 12-year-old is just clicking buttons to get through the checklist.
   - **Fix:** Keep the deductions in the graph, but in `pictures.lineTime` and `pictures.aspect`, make the `todo` visceral and playful:
     - *Current `pictures.lineTime` todo:* `"Type the cover's line time, 0.0095748 beats, into the Line time box and press Enter..."` (Typing a 5-decimal float into a text box feels like data entry.)
     - *Better:* Add a button or slider Detent, or say: `"Drag the Line time slider slowly until the diagonal stripes stand up straight (right around 0.00957 beats), or type 0.0095748 into the box..."`

2. **`pictures.units` (Step 33: "Their units")**
   - **The problem:** Look at `todo` in `src/tour/script.ts`:
     > `"Open the Units tab. Copy the numbers from their lesson into the converter (the whole number, the fraction and the power of ten) and see how many of our beats their unit of time is. Then press Propose: their s is this many beats."`
     On the decoded 536×355 image `L003`, the fraction `1 42/100 x 10^9` is tiny and blurry! A 12-year-old will not know which numbers on the crop are `whole`, `num`, `den`, and `power`.
   - **Concrete rewrite for `pictures.units` `todo`:**
     > `"Open the **Units** tab. The cropped line says **1  42/100 × 10⁹ t = 1 s**. Type those four numbers into the converter boxes: whole **1**, and **42** / **100**, × 10 to the **9**. Then press **Propose: their s is this many beats**."`

3. **`voices.many` (Step 27: "One voice, or many?")**
   - **The problem:** Look at `todo`:
     > `"Move Quiet below up until it sits between the hiss and the voices, and shorten Pause at least so each break between speakers counts. Press + under Voices' worth of pitch to say how many voices' worth of high and low you see. Then press Propose."`
     Three abstract signal-processing adjustments in one step ("between the hiss and the voices", "shorten Pause at least", "voices' worth of pitch") with no target numbers. Stewart and his son will almost certainly hit `Do it for me` here unless you give concrete targets.
   - **Concrete rewrite for `voices.many` `todo`:**
     > `"1. Drag **Quiet below** up to about **-30**, so the gold line sits above the quiet hiss between speakers. 2. Drag **Pause at least** down to about **0.3 beats** (0.25 s) so short pauses between speakers count. 3. Look at the pitch dots below: one person's voice fits inside the gold ruler box, and these dots spread across about **3 or 4** boxes. Set **Voices' worth of pitch** to **3** or **4**, then press **Propose**."`

4. **`map.periods` (Step 40: "Lines and lighthouses")**
   - **The problem:** A 4-part instruction across three different widgets (the dial, the gold cover SVG, the 3D WebGL galaxy chart, and the propose button), AND if they pick a young pulsar (lines 8, 11, 14) or line 2 (B1929+10, which isn't a pass-1 anchor!), the checker **refuses** it!
   - **Concrete rewrite for `map.periods` `todo`:**
     > `"1. Turn the dial until **long line to the centre** reads **0.0 deg**. 2. Click **line 6** (or **line 1**) on the gold cover map on the right. 3. On the galaxy chart on the left, click the bright pulsar sitting right on that line. 4. Press **Propose: this line is this pulsar**."`

---

### 5. What a V1.0 needs that is missing

1. **Reset / Chapter-State Cleanup (`save.reset`):** As noted in Section 2.4, clicking "Start over" leaves chapter-local Preact signals (`album`, `watched`, `workState`, `map/state`, `trail/state`) dirty. If someone finishes the tour and clicks "Start over" to let another family member try, the instruments will be in a half-solved state.
2. **A way to jump to any chapter or part in the Tour once finished:** Right now, `partDots` only lets you click parts up to `tour.furthest`. Once the tour is finished (or in a "Chapter Select" mode promised in `PLAN.md`), let Stewart and his son jump directly to any part (e.g., "let's show Mom the pictures decoding" or "let's look at the whale song again") without having to replay from step 1.
3. **Epilogue Picture & Audio Gallery (promised in `PLAN.md` and `CLAUDE.md` Rule 2):** `CLAUDE.md` Rule 2 mentions *"clean images appear only in tests and in the clearly labelled epilogue gallery."* Even if you don't ship all 116 clean scans (to keep repo size down), `Our Frame` should let the player browse the 156 decoded frames upright and in colour alongside the 27 music tracks as a jukebox, so they can actually *enjoy* the record they just spent 90 minutes decoding.
4. **Open-Graph / Social Preview Meta Tags in `index.html` and `play/index.html`:** When Stewart shares `https://the-finder.stewartgregerson.workers.dev` via text or Discord, `index.html` currently has no `<meta property="og:title">`, `og:description`, or `og:image`. Adding 5 lines of meta tags pointing to `hero.jpg` makes a shared link look like a finished work of art.
5. **The pending Sounds of Earth check (`voices.others`):** `PROGRESS.md` notes that the Sounds of Earth spectrogram test case is still pending your visual reading of the panels.

---

### 6. How I can be useful to this project in future

Where a second model family adds the most value alongside your Claude Code workflow:

1. **Adversarial Science & Statistics Audits (Zero-Context Cross-Checks):**
   - Because I do not share the in-session history of how a module was written, I am less likely to fall into the same framing assumptions (like the boundary $\chi^2$ issue in `spot.purity` or the geometric vs light-time distinction in `epilogue.lightDay`).
   - **What to give me:** The `src/science/*.ts` files, `docs/HOW_ITS_CHECKED.md`, and `docs/checks/results.json`. Ask me to try to break the statistical estimators or find physical effects that were omitted.

2. **Fresh-Eyes Readability & "12-Year-Old Test" on Narrative/Scripts:**
   - For the upcoming **Younger Version (8th-grade / age 12-14 target in `docs/IDEAS.md`)**, I can audit every stop's `look`, `todo`, `why`, and `human` text against the actual DOM controls in the `.tsx` files to catch any place where the prose assumes UI context the child doesn't have.
   - **What to give me:** `src/tour/script.ts` (or `young.ts`), the relevant chapter `.tsx` files, and the target age.

3. **State-Machine & Cross-Module Invariant Reviews:**
   - Subagents building individual chapters (`builder`, `builder-opus`) naturally focus on their own chapter's files and tests, which is how cross-chapter bugs like module-scoped signals surviving `save.reset` or main-thread stalls during chapter transitions slip through.
   - **What to give me:** The full `src/game/`, `src/ui/`, and `src/chapters/*/state.ts` files before a milestone gate.