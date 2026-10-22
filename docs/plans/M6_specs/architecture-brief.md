# M6 architecture brief: adding Portrait (ch. 8) and Our Frame (ch. 9)

_Read-only survey of the code as of 2026-10-22 (an Explore helper; saved by the lead). Paths are from the repo
root; `file:N` is a line number._

## 1. Chapters: registration, rendering, the ring

- `src/chapters/registry.ts`
  - `:8` `export interface ChapterInstrumentProps { chapter: ChapterId; }` (the only prop an instrument gets)
  - `:15` `export function registerInstrument(chapter: ChapterId, component: ComponentType<ChapterInstrumentProps>): void`
  - `:20` `export function instrumentFor(chapter: ChapterId): ComponentType<ChapterInstrumentProps> | undefined`
- `src/chapters/index.ts:3-10`: one side-effect import per chapter (`import './voices/index';`). Add
  `./portrait/index` and `./epilogue/index`. Loaded by `src/play/main.tsx:23`.
- A chapter's `index.ts`: `src/chapters/spot/index.ts:9-10` `registerInstrument('spot', SpotInstrument);
  installSpotCheckers(spotModel);`; `src/chapters/voices/index.ts:8-9` `registerVoicesCheckers();
  registerInstrument('voices', VoicesInstrument);`
- `src/game/graph.ts`
  - `:9-19` the `ChapterId` union already includes `'portrait' | 'epilogue'`; `:22` `type ChapterView = ChapterId | 'hub'`.
  - `:24-33` `interface ChapterDef { id; title; gloss; requires: string[]; built: boolean }`.
  - `:63-74` `CHAPTERS` (array order = ring order, clockwise from top).
    - `:72` `{ id: 'portrait', title: 'Portrait', gloss: 'Who sent it.', requires: ['pictures.firstFrames'], built: false }`
    - `:73` `{ id: 'epilogue', title: 'Our Frame', gloss: 'Where the machines are now.', requires: ['pictures.firstFrames'], built: false }`
    - Set `requires` to the real gating set and flip `built: true` as the last change.
- Gating (`src/game/deductions.ts`): `:80` `chapterOpen(chapter, confirmed)`; `:86-92` `chapterStatus(chapter,
  confirmed): 'later'|'locked'|'open'|'done'`. **'done' needs `mine.length > 0`** (`:91`): a chapter with zero
  nodes (Our Frame) can never be 'done'. Consequences: Hub.tsx:37-38 `finished` never true;
  `tests/browser/game.browser.mjs:234` (every built chapter 'done') fails. `:94` `nodeStatus(id, confirmed)`.
- `src/game/gameService.ts:34-43` `enterChapter(view)` refuses if not built ("is for later") or locked.
- `src/ui/Hub.tsx`: the ring. `:13` `angle(i)` spaces CHAPTERS evenly; `:18` `needs()` shows `requires[0]`'s
  question as the locked tooltip; buttons `:67-85` send `chapter.enter`; label `<GlyphLabel k={c.title}>`.
- `src/ui/Workbench.tsx:83-145`: chapter header, `instrumentFor()` or the "being built" placeholder, the
  notebook (`nodesOf(chapter)`, HintBox `:18`, three tiers). With the tour on, the notebook column is `<Guide/>`.
- Routing: `src/play/router.ts` (`#portrait`, `#epilogue` via `parseChapterHash`, graph.ts:418).
  `src/game/save.ts:64-69` `cleanChapter` sends a saved unbuilt chapter back to 'hub'.

## 2. Deduction graph, checkers, headlines, bus, save, settings

Node shape (`src/game/graph.ts:35-52`):
```ts
export type HintTiers = [nudge: string, method: string, answer: string];
export interface NodeDef { later?: boolean; id: string; chapter: ChapterId; key: string; question: string;
  gloss: string; requires: string[]; checkedRow: number; hints: HintTiers; }
```
- `id` starts with `${chapter}.` (graph.test.ts). `key` is the English glyph key. `question` must not give the
  answer away (graph.test.ts:129). Hints: no em dash, over 10 chars, no typed numbers (compute them as graph.ts:54-61).
- `src/game/nodesM5.ts` exports `M5_QUESTIONS: Record<string,string>` (`:9`) and `M5_NODES: readonly
  Omit<NodeDef,'question'>[]` (`:24`); every node starts `later: true`, cleared by the builder last. Add
  `src/game/nodesM6.ts` (`M6_NODES`, `M6_QUESTIONS`) and merge:
  - `:397` `export const ALL_NODES = [...RAW_NODES, ...M5_NODES].map((n) => ({ ...n, question: QUESTIONS[n.id] ?? M5_QUESTIONS[n.id] ?? '' }));`
  - `:400` `export const NODES = ALL_NODES.filter((n) => !n.later);`; `:405` `nodeDef(id)` (ALL_NODES); `:413` `nodesOf(chapter)` (NODES).
- Tests to change: `src/game/graph.test.ts:26` `ALL_NODES.length` toBe(43); `:34` `checkedRow <= 16` (Our Frame
  is row 15; a Portrait row would be 17); `:167-176` expects portrait/epilogue 'later' with no NODES.

Checkers (`src/game/deductions.ts`):
```ts
export type Answer = string | number | boolean | null | Answer[] | { [key: string]: Answer };      // :13
export interface Reading { key: string; value: number | string; dim?: Dim; }                       // :16 (SI when dim)
export interface CheckResult { ok: boolean; result: Reading[]; message: string; }                   // :23
export interface CheckContext { attempts: number; confirmed: ReadonlySet<string>; seed: string; }  // :31
export type Checker = (answer: Answer, ctx: CheckContext) => CheckResult;                          // :42
export interface Attempt { answer: Answer; ok: boolean; result: Reading[]; message: string; at: number; } // :44
export function registerChecker(id: string, checker: Checker): void;   // :57, throws if nodeDef(id) is missing
export function evaluate(id, answer, confirmed, attempts, seed = DEFAULT_SEED): CheckResult; // :116
```
- Pattern: pure `checkX(answer, ...)` plus `registerXCheckers()` (voices/checkers.ts:229-234) called from the
  chapter's index.ts. Wrong answers return `ok:false` with what was computed; a malformed answer throws.
- `installTestCheckers()` (`:136`) answers "correct" for nodes without a checker (`?testcheckers=1`).

Message tokens (`src/ui/message.ts`): `{{q|<dim>|<SI>}}` or `{{q|<dim>|<SI>|<sig figs>}}`. `:30` `q(dim, si,
digits?)`; `:87` `renderMessage(text, humanGloss)`; `:107` `messageTokens(text)`; `:73` `alienText`; `:80`
`quantityInMessage`. MsgDim = Dim (`time|length|mass|speed|frequency|energy|power|temperature`, ui/units.ts:16)
plus `acceleration|area|specificEnergy|heatCapacity`. Alien units `BEAT_S=0.871`, `REACH_M=1.37`, `HEFT_KG=2.29`.

Headlines (`src/ui/headline.ts`):
```ts
export type HeadlineFrom = { reading: string } | { token: number; label: string }
  | { count: (r: readonly Reading[]) => number; label: string };                     // :10
export interface HeadlineDef { from: HeadlineFrom; sentence: string; }              // :18 (no digits in sentence)
export function headlineOf(def, a): Headline | null;                                 // :35
```
Per chapter `src/chapters/<ch>/headlines.ts` exports `<CH>_HEADLINES`; spread into `src/chapters/headlines.ts:12-14`.
`headlines.test.ts` checks every Node-confirmable result; ResultView.tsx:152 uses it.

Command bus (`src/game/bus.ts:18-40`, `dispatch(cmd)` `:42`): `turntable.load{side}`, `turntable.drop{radiusMm}`,
`turntable.setSpeed{secondsPerTurn}`, `turntable.setDirection{direction}`, `turntable.setVolume{value}`,
`turntable.lift`, `decoder.select|setParam|reset|run|composeColour`, `chapter.enter{chapter}`,
`deduction.propose{id, answer}`, `hint.request{id}`, `codex.open{id?}`, `codex.close`, `settings.set{name,value}`,
`settings.panel{open}`, `tour.start{step?}`, `tour.goto{step}`, `tour.exit`, `save.reset`. A new command needs a
union member plus a `case` (a `never` check enforces it). UI: `send()` (src/ui/send.ts); bots:
`window.__finder.dispatch` (src/harness/api.ts:30). `gameService.propose(id, answer)` (`gameService.ts:45-58`).

State (`src/game/state.ts`): `:77` `NodeRecord { confirmed; attempts: Attempt[]; hints }`; `:85-99` `game = {
records, chapter, settings, seed, codexOpen, codexFocus, settingsOpen, tour, error }` (signals); `:101`
`confirmedSet`; `:132` `snapshot()`.

Save (`src/game/save.ts`): `SAVE_KEY = 'finder.save.v1'`, `SAVE_VERSION = 1`; `SaveV1 { version: 1; nodes;
chapter; settings; seed; tour? }` (`:19-29`); `migrate(raw)` (`:77`). `cleanNodes` (`:52`) keeps every stored
Attempt with its readings, so confirmed results persist across reloads. `cleanSeed` (`:36`). Autosave 250 ms
(`:150`). A new optional field follows `tour?`: SaveV1, migrate, serialize (`:98`), applySave (`:109`), the
autosave read list (`:162`).

Settings (`src/game/settings.ts:4-15`): `{ humanGloss; masterVolume; reducedMotion; soundCaptions; showWorking }`;
`:20` `SettingCommand`, `:22` `defaultSettings`, `:29` `coerceSetting`, `:48` `normalizeSettings`.

## 3. The codex and reading confirmed results

- `src/ui/Codex.tsx` (89 lines): lists `NODES.filter(confirmed)` (`:69`); each Entry (`:30-64`) shows the glyph
  title, gloss, the last ok attempt's readings in alien notation (`<Value reading>`, Glyph.tsx:63), refused
  answers, and `/checked/#row-${node.checkedRow}` (`:58`).
- Accessor to copy: `src/chapters/moments.ts:52` `const lastOk = (id: string): Attempt | undefined =>
  [...(game.records.value[id]?.attempts ?? [])].reverse().find((x) => x.ok);` and `:49` `reading(a, key)`.
- Reading keys Portrait needs:
  - Warm-white star: `trail.origin` `'star'` (trail/checkers.ts:103); moments use `starName(originRow(m).star)`.
  - Neighbour: `trail.neighbour` `'distance from your star'` (length), `'rank by distance'`, `'magnitude in your
    sky'`, `'rank by brightness'` (trail/checkers.ts:179-185).
  - Clocks: `arrival.fuelAge` `'age'`, `'age low, 95%'`, `'age high, 95%'` (time, s; arrival/checkers.ts:178-180).
    `spot.age` `'age'` with low/high (spot/checkers.ts:116-118). `spot.purity` `'fitted age'`. `trail.age` message
    token 1. `trail.when` message tokens 0-2 (estimate, low, high), token 3 travel time (moments.ts:104-108).
    `map.old` `'years ago'`.
  - Heights: `pictures.height` `'their heights'` (string), `'taller figure'`, `'shorter figure'` (length).
  - Numerals `pictures.numerals` `'their base'`; units `pictures.units` `'their second'`, `'their metre'`.
  - World: `pictures.home` `'place outward'`, `'distance from their star'`, `'mass'`, `'day'`.
  - Voices: `voices.many` `'stretches of voice between pauses'`, `"voices' worth of pitch"`; `voices.octave`
    `'repeating ratio'`, `'steps in it'`, `'one step, as a ratio'`; `voices.hearing` `'falls into the hiss'`;
    `voices.others` `'longest call'`.
- Staged moments: `src/chapters/moments.ts` `MomentDef` (`:33-47`), `MOMENTS` `:54`; triggers
  `src/ui/momentState.ts:12` `MOMENT_IDS` (copied in `tests/browser/moments.mjs:4`); `src/ui/Moment.tsx`
  (reduced motion still, `:48`).

## 4. The encounter scene and sky

- `src/world/encounter.ts:80` `mountEncounter(canvas, opts = {}): EncounterHandle`; `:21` `EncounterOptions {
  scenario?; stars?; modelUrl?; skyUrl?; reducedMotion?; shadows? }`; `:32` `EncounterInfo { decimalYear;
  craftPosPc; sun: { dirIcrs; appMag; distPc }; counts }`; `:40-61` handle: `ready`, `info()`, `hotspots`,
  `project(id)`, `projectSky(dirIcrs)`, `frame(id|'overview', {durationS?})`, `setView`, `getView`,
  `setReducedMotion`, `setFov(20..90)`, `frameStats`, `benchmark`, `probeSky`, `dispose`.
- Camera `OrbitRig` (`src/world/rig.ts:27`), `OrbitView { target; azDeg; elDeg; dist }` in the craft's frame;
  `OPENING` (encounter.ts:64). No "look at star X" API; the dish (+Y) faces the Sun (encounter.ts:190), so
  `setView({ elDeg: -89 })` looks at the Sun past the craft; `projectSky(info().sun.dirIcrs)` places a label.
- The sky is seen from the craft, not from Gliese 445: `computeSky(scenario, cat, limit)` (skyModel.ts:123) uses
  `disc.craft.posPc` (`:126`). The Finder's own sky needs an observer parameter (`homeObserver(scenario, stars,
  t).posPc`, epoch.ts:191).
- Arrival embedding (`src/chapters/arrival/Arrival.tsx:76-97`): mount once, `ready.then`, `dispose()` on unmount;
  per scan `h.setFov(def.fov); void h.frame(def.frame)`; overlay markers in a rAF loop with `h.project()`.
- 2D alternative already built: `SkyBackdrop` (trail/moments.tsx:76) draws the Finder's own sky (Hammer
  projection from the home star, origin star ringed) with `brightestStars` and `bvToSrgb`.

## 5. Science for the epilogue

- `src/science/ephemeris.ts`: `:15` `hermiteState(body, jdTdb): { posKm; velKmS }`; `:42` `distanceKm(a, b)`;
  `:47` `lightTimeHours(km)`; `:57` `crossingJd(craft, earth, lightHours, jdFrom, jdTo)`. No `distanceAt(Date)`
  helper: the recipe is `src/tour/VoyagerNow.tsx:29-52` (`jd = isoUtcToJd(iso) + 69.184/86400`; bodies '399',
  '-31', '-32'). `TDB_MINUS_UTC_DAYS` is private in VoyagerNow.tsx:12 and ephemeris.test.ts:19: promote it and a
  `voyagerNow(bodies, date)` into src/science.
- `data/ephemeris.json`: bodies '399' Earth (10-day nodes, 2020-2040), '-31' Voyager 1 and '-32' Voyager 2
  (30-day, 2000-2099); rows `[x,y,z,vx,vy,vz]` km, km/s, Sun-centred ICRF TDB. Load lazily.
- Checks recorded (`src/science/ephemeris.test.ts`): `epilogue.ephemeris`, `epilogue.today`,
  `epilogue.lightDay` (from Earth: ours 10:16:18 UTC, NASA 10:16:07). M6.md's "from the Sun" is wrong.
- `src/science/epoch.ts` exports: `craftStateAt` `:68`, `starStateAt` `:81`, `findHomeStar` `:92`,
  `discoveryState(scenario, stars)` `:120`, `homeObserver` `:191`, `nearestStars` `:232`, `SUN_ABS_MAG_V` `:254`,
  `apparentMagnitude` `:262`, `brightestStars` `:272`.
- `data/scenario.json`: craft (Voyager 1, launch 1977-09-05T12:56:00Z, asymptote), homeStar (Gliese 445),
  alternative, discoveryRule, sources.
- The Our Frame facts (instruments, inscription, the Gliese 445 pass, the map's epoch) live only in
  `docs/research/epilogue.md`; rule 1 wants a sourced data file (e.g. `data/epilogue.json`).

## 6. The guided tour

- `src/tour/types.ts`: `PartId` `:9-20`; `StopKind = 'story'|'do'|'watch'` `:33`;
  `Stop { id; part; kind; chapter; node?; title; look; todo?; why?; human?; ask?; widget?: 'cover' | 'voyagerNow' }` `:35-57`.
- `src/tour/script.ts`: `PARTS` `:23-35`, `STOPS` `:37`; finale story stops on the hub: `finale.portrait` `:536`,
  `finale.carter` `:544`, `finale.now` `:552` (`widget: 'voyagerNow'`).
- `src/tour/VoyagerNow.tsx` (113 lines), rendered by `Guide.tsx:153`.
- `src/tour/actions.ts`: `SHOW_ME` `:34-85` (lazy `./actions/<chapter>.ts`), `TARGETS` `:90-161` (1 to 3
  selectors). `src/tour/actionsKit.ts`: `sleep`, `waitFor`, `waitVisible`, `waitEnabled`, `press`, `setValue`,
  `key`, `pointer`, `drag`, `clickAt`, `ensureChapter` (`:208`), `proposeAndConfirm` (`:219`), `proposeWith`
  (`:241`), `proposeOnBus` (`:248`), `skipMoments` (`:256`), `finish` (`:271`).
- Tests: `src/tour/script.test.ts:97-101` (every built playable node in a stop), `:47` order, `:60` gating;
  `src/tour/actions.test.ts:31-33` hard-codes 43 acting stops; `:35` SHOW_ME per do/watch stop; `:46` TARGETS.

## 7. Sound

- `src/audio/synth.ts:52-64` `CHAPTER_VOICE`: portrait `{ rootHz: 61.74, pluckHz: 246.94, bed: 'hub' }`,
  epilogue `{ rootHz: 55.0, pluckHz: 220.0, bed: 'hub' }`. A new bed: the `Bed` union (`:38`), `buildBed`
  (`src/audio/ambience.ts:38`), `BED_TRIM` (`:24`), levels test in `tests/browser/sound.browser.mjs`.
  `src/audio/cues.test.ts:207-221` pins keys and beds of built chapters.
- Cues (`src/audio/cues.ts`): `CueKind` `:11`, `confirmationCue(added)` `:85`, `CAPTIONS` `:54`; a new cue needs
  CueKind, MIN_GAP_MS, CAPTIONS, a sink case (`src/audio/sink.ts`), a renderer (`src/audio/ui.ts`).
- Playing the record quietly over the bus: `turntable.load {side: 1}`, `turntable.setVolume {value}`,
  `turntable.drop {radiusMm}` (music from `R_OUTER_MUSIC_MM = 146.05`, record/groove.ts:22-33); speed and
  direction default right; `turntable.lift` stops; beds duck 12 dB automatically.

## 8. Bots, harness, How it's checked

- Browser tests `tests/browser/*.browser.mjs` (`run({ page, baseUrl, record, assert, log })`, run by
  `node tools/harness/browser-tests.mjs [filter]`): album, arrival, charts, decoder, encounter, enter, game
  (bot.game, bot.m4Wrong), instrument, key, map, moments, pictures, player, shell, slice (exports `SLICE_IDS`,
  `freshStart`, `playSlice`, `reviewFolder`, `stamp`), smoke, sound, spot, tour (bot.tour), trail (`playTrail`),
  turntable, voices (`VOICES_IDS`, `playVoices`).
- bot.game: hard-coded `ALL_IDS` (`game.browser.mjs:30`); asserts `g.confirmed.length === ALL_IDS.length`
  (`:232`) and every built chapter 'done' (`:234`); headlines for every confirmed node (`:132-137`); record text
  at `:248-250` says 31.
- bot.tour reads STOPS from the page, presses `[data-tour-act]`, waits for confirmation and no `[data-moment]`,
  then `[data-tour-next]`.
- How it's checked: tests call `recordCheck({ id, claim, measured, expected, tolerance, pass, notes? })`
  (`tests/support/record.ts`) into `harness/out/checks/<id>.json`; `tools/how-checked.mjs` regenerates the
  results table in `docs/HOW_ITS_CHECKED.md`; the deduction table rows (`#` column) are hand-written and list
  check ids; a node links by `checkedRow`; `src/checked/main.ts:24-30` anchors `row-N`. Row 15 "Our frame" exists
  (`epilogue.*`). Portrait needs row 17.
- Seeds: `src/chapters/seedCheck.ts:64` `verifySeed(inputs, seed)`, `data/seeds.json`.

## 9. Accessibility and settings present

- Reduced motion: `<html class="calm">` (play/main.tsx:58-60), CSS animates under `:root:not(.calm)`; moments
  become stills; the encounter stops drifting.
- Captions: `soundCaptions`, Captions.tsx (`role="status" aria-live="polite"`).
- Gloss: `humanGloss` (tour forces it on, gameService.ts:116).
- Keyboard: Escape closes drawers; moments end on any key; `useDrawerFocus` (src/ui/focus.ts:7); `onKeyDown` on
  Dial, SkyAges, Knobs, CoverViewer, LampDial, SweepPanel. No automated keyboard-only or a11y test yet.
- Contrast: `src/ui/contrast.test.ts` (4.5:1 over theme tokens).

## 10. Conventions

- Tokens (`src/ui/theme.css`): `--bg`, `--bg-raised`, `--bg-sunk`, `--line`, `--text`, `--text-dim`, `--cyan`,
  `--violet`, `--gold` (reserved for the human artifact), `--danger`, `--heat`, `--cold`, `--fs-label`,
  `--fs-value`, `--topbar-h`, `--font-sans`, `--font-mono`. Each chapter has `<chapter>.css`.
- Files mostly under 450 lines; chapters split into Instrument plus panels, `checkers.ts`, `data.ts`,
  `headlines.ts`, `moments.tsx`, `parts.tsx`, `<ch>.css`, `index.ts`. Every file opens with a plain-English header.
- Tests: `*.test.ts` beside the code (vitest, 60 s timeout); browser tests as above; dotted check ids.
- `npm run check` (`tools/check.mjs`): typecheck, hygiene, vitest, vite build, browser tests, Python reference
  checks, data checks, How it's checked page; writes `harness/LAST_RUN.md`.
