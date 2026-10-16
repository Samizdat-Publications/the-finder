# Controls digest (2026-10-16): how a human completes each of the 43 deductions

Made by a read-only survey of the instruments and the bots, for the guided tour (D-A33). Selectors and
labels are quoted from the source as of commit 3ec48e9. Verify against the source before relying on one.

## General

- Bot handle: `window.__finder = { dispatch, state(), waitFor() }` (dev server or `?harness=1`). In-app code
  imports `dispatch` from `src/game/bus.ts` and `snapshot`/signals from `src/game/state.ts` directly.
- Results: `[data-result="<id>"]`; `data-ok` is "1"/"0" in Arrival and The Spot, "true"/"false" elsewhere.
- Staged moments after `pictures.colour`, `pictures.home`, `pictures.height`, `voices.octave`, `map.region`,
  `spot.age`, `trail.origin`, `trail.neighbour`, `trail.when`: overlay `[data-moment="<id>"]`, skip with
  `[data-moment-skip]` "Continue" (bots: `tests/browser/moments.mjs` `skipMoments()`).
- Units: beat 0.871 s, reach 1.37 m, heft 2.29 kg. `humanGloss` adds SI in brackets everywhere.

## ARRIVAL
Ready: `[data-instrument="arrival"][data-scene="ready"]` (scans work even if `failed`). Tabs
`[data-scan-tab="structure|heat|isotopes|clock"]` ("Structure", "Heat", "Isotopes", "Decay clock").
Choice buttons `button.ar-choice[data-choice=...]` propose immediately on click.
- arrival.purpose: tab structure; click `[data-choice="radio"]` "It sends and receives radio across distance".
  Bot: click tab, `{type:'deduction.propose', id:'arrival.purpose', answer:'radio'}`.
- arrival.heat: tab heat; `[data-choice="decay"]` "Radioactive decay inside". answer 'decay'.
- arrival.madeNotMined: tab isotopes; `[data-choice="made"]` "Made: born from a heavier element someone made". answer 'made'.
- arrival.fuelAge: tab clock; radio `[data-chain-choice="pu238"]` (default) "Plutonium-238 to uranium-234 to
  thorium-230"; submit `button[data-propose-chain]` "Date the heat source with this chain". answer 'pu238'.

## THE KEY
Ready: `.keyinst[data-key-ready="true"]`. Lamp `svg[data-lamp]` (ArrowDown x14 to "135,10", cosmetic).
Panels `section.kpanel[data-panel="key.*"]`, radios `fieldset[data-propose="<id>"] input[data-choice=...]`,
Propose `[data-propose-button="<id>"]` (disabled until a radio is picked).
- key.binary: `[data-choice="across-one"]`; answer `{reading:'positional', one:'across'}`.
- key.unit: atlas rows `button.atlasrow[data-atlas="hyperfine"]` "spin flip" (cosmetic); radio
  `[data-choice="hyperfine"]` "The spin flip transition"; answer 'hyperfine'.
- key.timesNotLengths: radio `[data-choice="times"]`; answer 'times'. Table `[data-times-lengths]`.

## THE PLAYER
Ready: `.playerinst[data-player-ready="true"]`. T = parseInt(cover.record.rotationPeriod.binary, 2) /
1420405751.768 (about 3.59994 s, 4.1331 beats).
Controls: speed slider `input#pspeed` (`data-speed-beats`), box `input.pnum` ("Beats per turn"), propose
`[data-propose-button="player.speed"]` "This is the time of one turn"; direction
`button.pdir[data-direction="cw"]` "Clockwise, seen from above", propose `[data-propose-button="player.direction"]`
"This is the way it turns" (appears after a direction click); `button[data-drop]` "Drop the needle" (disabled
until a direction is clicked), `button[data-lift]` "Lift"; drop radius by clicking the platter
`svg.platter[data-target-mm]` (viewBox units = mm; lead-in 146.05 to 149.05 mm, label "the outermost groove").
- player.speed: `{type:'turntable.setSpeed', secondsPerTurn:T}` then propose `{secondsPerTurn:T}`.
- player.start: the Drop button proposes it. Bot: `{type:'turntable.load', side:1}` then propose
  `{radiusMm:147.5, secondsPerTurn:T}`.
- player.direction: `{type:'turntable.setDirection', direction:'cw'}` then propose `{direction:'cw'}`.
- player.firstSound: auto-proposed by the instrument after about 10 to 20 s of play.
  Bot: `{type:'turntable.drop', radiusMm:147.5}`, waitFor confirmed (90 s), `[data-heard="lines"]`, then lift.

## THE PICTURES (first 7)
Ready: `.picinst[data-pictures-ready="true"]` and `decoder.status === 'done'`.
Knobs: `[data-knob="lineTime"]` (box `input.pic-num`, Enter/blur), `[data-knob="syncLock"]`
("Free-running" | "Lock to each pulse"), `[data-knob="interlace"]` ("Leave" | "Undo the stagger"),
`[data-knob="polarity"]` ("Lighter" | "Darker"), `[data-knob="rows"]` (range `#pic-rows`, 200 to 600).
Segment buttons: `[data-knob="X"] .pic-seg button:nth-child(2)` is the "on" option.
Panels `section.pic-panel[data-panel="pictures.*"]` each with `[data-propose-button="<id>"]` proposing the
current knobs. Bot `set(name, value)` = setParam then `decoder.run 'fast'`.
- lineTime: set lineTimeMs 8.3396; propose `{lineTimeMs: bench.lineTimeMs}`. Box value 0.0095747 beats.
- sync: set syncLock true; `{lineTimeMs:8.3396, syncLock:true}`.
- interlace: `{interlace:true}`. polarity: `{polarity:'negative'}` ("Darker"). aspect: rows 355, `{rows:355}`.
- circle: `{lineTimeMs:8.3396, syncLock:true, interlace:true, polarity:'negative', rows:355}`; "Propose: the circle is true"; then `p.pic-they` "They see."
- firstFrames: "Play on" `[data-play-on]` or `[data-develop="L001"]`...; watched at record speed;
  "Watched: n of 3 needed."; bot selects L001, R001, L002 (`FIRST_FRAMES` in src/chapters/pictures/checkers.ts)
  with `decoder.select` + `decoder.run 'record'`, waits 3 `.pic-seen [data-seen]`, proposes
  `{watched:[...], settings:{five}}`.

## THE PICTURES (M5; tests/browser/album.browser.mjs playPicturesM5)
View tabs `button.pic-tab[data-view="decoder|album|colour|turn|numerals|units|planets|height"]`
("Decoder", "Album", "Mixer", "Turn", "Counting", "Units", "Circles", "Figures").
- album: tab album; `[data-album-develop]` "Develop the rest at once"; wait `[data-album-count="156"]` (up
  to 300 s); click first `[data-propose-button="pictures.album"]`.
- colour: tab colour; click `[data-album-frame="L013"] button`; wait `[data-composite="L013,L014,L015"]`;
  propose.
- down: tab turn; `[data-album-frame="L039"] button`; `[data-turn="1"]` "Turn clockwise" once; propose.
- numerals: tab numerals; click `[data-numeral-pick="g:n"]` for g0->1 ... g8->9, g9->0 (from
  data/teaching.json L002.digits); wait `[data-sum="2 + 3 = 5"][data-holds="true"]`; propose.
- units: tab units; inputs `[data-reading="whole"]` 1, `num` 42, `den` 100, `power` 9; output
  `[data-converter-beats]` "= 1.148 beats"; propose.
- home: tab planets; `button.pic-tcircle[data-column="3"]`; propose (moment follows).
- slip: same view; `button.pic-tcell[data-cell="9:distance"]`; propose.
- height: tab height; input `[data-reading="cm"]` 160; output "= 1.174 reaches"; propose (moment).

## THE VOICES (tests/browser/voices.browser.mjs)
Ready `[data-instrument="voices"]`; tools appear after Worker analyses (`.vo-progress`). Tracks: play
`[data-play="ozma-NN"]`, view `button.vo-name[data-view="ozma-NN"]`; spectrogram
`.vo-spec[data-spectrogram=<id>][data-ready]`, box `.vo-specbox` (drag marks a stretch).
Propose `[data-propose-button="voices.*"]`. Bot sets volume `{type:'turntable.setVolume', value:0.25}`;
`setRange` sets an input's value and dispatches `input`.
- many: `[data-panel="voices.many"] [data-control="threshold"]` -30, `[data-control="gap"]` 0.25 (s);
  `[data-groups="plus"]` twice; propose. Labels "Quiet below", "Pause at least", "Voices' worth of pitch".
- others: view `ozma-03` ("voices 3"); wait `[data-spectrogram="ozma-03"][data-ready="true"]`; drag on
  `.vo-specbox` from 193.64 s to 233.09 s (whale song 190.64 to 236.09 s, about 78% to 97% across); propose.
  Bot helper `markStretch` in voices.browser.mjs.
- hearing: click `svg[data-hearing-chart]` at x = 44 + hz/20000*470 (hz 17127.3), y 60 (viewBox units;
  see `clickChart`); propose.
- octave: click `svg[data-octave-chart]` at x = 30 + 1200/2400*482, y 60; wait `[data-control="teeth"]`;
  set 12; propose; skip moment.

## THE MAP (tests/browser/map.browser.mjs, game.browser.mjs playMap)
Seed-dependent: answers from `epochModel(game.seed)` (src/chapters/shared/epochModel.ts). Ready:
`.mapinst[data-map-phase="ready"]` and `.map-chart[data-chart-ready="true"]`; `p.map-measuring` while busy.
Dial `svg.map-dial[data-dial]` (keys; turn until `[data-angle-to-centre]` reads 0.0); line buttons
`button.map-lb[data-line-button=1..14]`; clicking a pulsar on the chart (window `__mapChart` handle:
`frame({jname})`, `project`) assigns it; step chips `button.map-chip[data-step=...]`; propose
`[data-propose-button=<id>]`. Documented identities in data/cover.json; lines 8, 11, 14 young.
- periods: align dial; assign an old pass-1 anchor line; select it; propose `{line, jname}`.
- old: clock slider `input#map-clock[data-clock]` (years, negative past, step 50) to
  `-round(clockCrossingYearsAgo(line)/50)*50`; wait `[data-clock-line="N"].agrees`; propose.
- identify: assign all 14; propose.
- motion: chip `[data-step="map.motion"]`; click `svg[data-sky-plot]` at best axis (`bestAxisOnGrid`); nudge
  in `details.working`; `[data-axis-chi2-reading]` `data-decides="inside"`; propose.
- region: chip `[data-step="map.region"]`; wait region fit; click `svg[data-plane]` at
  `m.region().centerPc`; propose; skip moment.

## THE SPOT (tests/browser/spot.browser.mjs)
Ready `[data-instrument="spot"] .coverviewer svg.strokes`. Spot at cover (150, 32) mm.
- find: click at (150, 32) mm via `svg.strokes.getScreenCTM()`; `[data-propose="spot.find"]` "Something is here".
- age: `[data-count-beats="100000"]` "+10^5"; read `[data-ratio]`; set `input[data-age-input]` (years) to
  `round(ageFromRatio(R)/50)*50`; `[data-propose="spot.age"]` "The spot is this old"; skip moment.
- purity: `input[data-start-input]` 0; `.sp-meter[data-agree="1"]`; `[data-propose="spot.purity"]` "It began like this".

## THE TRAIL (tests/browser/trail.browser.mjs, game.browser.mjs playTrail)
Ready `.trinst[data-trail-ready="true"] .tr-chart[data-chart-ready="true"]`. Tabs
`button.tr-tab[data-tool-tab="trail|run|ruler|region|reframe"]` ("Trail", "Run back", "Ruler", "Region",
"Reframe"); propose `button.tr-propose[data-propose-button=<id>]`. Sun = star id 0 ("the warm-white star");
stars clicked via `chartHandle().frame({starId})` + `project` + click on `.tr-canvas`.
- origin: tab trail; pick star 0; propose `{starId:0}`; skip moment.
- age: tab run; `input.tr-num[data-run-input]` (years) = round(meeting(m, sun).yearsAgo/10)*10, Enter; propose.
- neighbour: tab ruler; home star then star 0; "Propose this distance"; skip moment.
- where: tab region; click `[data-region-star="0"]` on `.tr-region`; propose `{starId:0}`.
- when: tab reframe; `[data-frame-select]` "0"; wait `.tr-reframe[data-frame="0"]`; cursor at
  round(ages('sun').combined.estimate/10)*10; propose; skip moment.

## Order (game.browser.mjs)
slice (Arrival 4, Key 3, Player 4, Pictures 7), Pictures M5 (album, colour, down, numerals, units, home,
slip, height), Voices (many, others, hearing, octave), Map, Spot, Trail (43 nodes).
