# The Finder: build plan

_Proposed 2026-10-15 by the planning session (Opus 5.5). Status: **approved by Stewart on 2026-10-15.**
Late factual corrections from the cover research were folded in at approval time (the map's directions
are good to about 3 degrees and no lines are swapped; 53.8 minutes per side; the uranium spot is not on
the diagram; the groove spiral sets the rotation); nothing about the product changed._

## The short version: what you will end up with

A website you can share as a link (planned address: `https://the-finder.stewartgregerson.workers.dev`).
Put on headphones and, for about an hour and a half to two hours, you are not human. You are a
scientist from a small red star, about 44,000 years from now. Your sentinels catch a cold, tiny
machine falling past your star: Voyager 1. You start with nothing but the object.

Step by step you work out what it is, how old it is, how to play the gold disc it carries, where it
came from, when it left, and who sent it. You build a record player to the cover's specification
and hear the first sounds come off the disc (wrong, if your speed is wrong). You tune a picture
decoder until the cover's calibration circle comes out round, then watch the senders' photographs
develop line by line, decoded live in your browser from the real signal on the 1977 image master
tape. It ends with your portrait of the senders, then cuts back to today: where the two Voyagers
actually are right now, and the slow future in which Voyager 1 really will pass that red star.

Every answer is the real one. A "How it's checked" page shows, for each step, the physics, the data
and the automated test that proves it.

Also delivered: a landing page and README you can follow without programming, `Play The Finder.bat`
and `Run Checks.bat`, a test bot that plays the whole thing, and (bonus) a 3D-printable relief plate
of the cover diagrams.

## Context

Stewart's kickoff (`C:\Users\stewa\Downloads\golden-record-kickoff.md`, written with Cowork) asks for
an interactive experience where you play the alien who finds Voyager and decodes the Golden Record
from the cover alone, every deduction checked against reality; a new repo in Samizdat-Publications;
web on Cloudflare; the real record content (all 116 images, the greetings, the sounds, the music),
with the images decoded from the actual record audio where possible. Licensing is Stewart's
responsibility and must not shape decisions. The build runs autonomously in fresh sessions from
PLAN.md, PROGRESS.md and HANDOFF.md: the main thread on architecture and judgment, implementation
delegated to cheaper subagents. Folder: `C:\Users\stewa\Documents\Claude\Golden Record` (the name
stays; renaming project folders is off-limits per CLAUDE.md).

## What the research found

Full sourced reports go in `docs/research/` right after approval. The facts that shape this plan:

**The pictures can be decoded from the real thing.**
- A genuine transfer of the original 1977 image master tape is public. Ozma Records digitized the
  Colorado Video reel from the Sony vault in 2016 for the 40th-anniversary project. It circulates as
  `384kHzStereo.wav` (1,455,685,720 bytes, 32-bit float stereo, 473.86 s) in two byte-identical
  Internet Archive items (`voyager.decode`, `voyager_images_384khz`; MD5
  `f543349efdcc258e56c9af3baa9d33c8`). Evidence it is not a re-synthesis: wow and flutter, a 0.16%
  speed offset, AC-coupling droop, clicks and dropouts, alternating sync widths that match a Colorado
  Video patent, visible slide mounts, exactly 20 colour triplets. No commercial release (Ozma 2017,
  Warner 1992, NASA) contains the image audio.
- 116 images are stored as 156 frames: 96 single monochrome frames plus 20 colour images as three
  frames each. Left channel: images 1 to 54 (78 frames). Right channel: images 55 to 116 (78 frames).
  Both play at once.
- Each picture is 512 vertical lines. The cover gives the line time in binary,
  `101101001100000000000000` = 11,845,632 hydrogen units = 8.34 ms; the tape measures 8.326 ms. Alternate
  lines carry different sync widths (the cover's "staggered interlace"). More signal means darker, so
  a straight decode is a negative. Nothing says which way is up (60 to 66 frames need a quarter turn).
  Which colour frame is red cannot be proven from the record alone.
- Decoders to learn from: Ron Barry (C++, 2017, the only published index of all 156 frame starts),
  aizquier (Python), Malte Gruber and Marc Baeuerle (browser, from lossy 44.1 kHz copies), gourneau
  (2026 Python reference with a browser port in progress, 96 kHz 16-bit slices of about 0.5 MB per
  frame). **One GitHub repo, `Adriann6842/voyager-golden-record`, is a malware lure: never download
  from it.**
- Five text pages (President Carter's statement, names of members of Congress) were added at the last
  minute and are not on the master tape.

**The cover's clocks work, with real numbers.**
- The 14 pulsars are known: B1727-47, B1451-68, B1240-64, B0833-45 (Vela), B0950+08, B0823+26,
  B0531+21 (Crab), B0525+21, B0329+54, B2217+47, B2016+28, B1933+16, B1929+10, B1642-03. The periods
  are the 1970/1971 values from Sagan, Sagan and Drake (1972). The current ATNF catalogue is v2.9.0
  (2026-10-06, 4,503 pulsars), one 1.25 MB download.
- Decoding the map against today's catalogue dates it to about 1971 (Crab 1971.76; Vela 1971.77 after
  correcting for its glitches; all 13 usable pulsars 1969.7 plus or minus 1.4): six years before
  launch. The map was already old when it flew.
- The map's directions are good: every line sits within about 1 to 3 degrees of its pulsar's true
  galactic longitude. Its limits become story beats rather than problems: B1240-64's period was known
  to only 3 figures (the 30-bit binary hides that), the 1970 distances are off by up to about 6 times
  (Vela is drawn at 1.6 kpc; it is 0.28), and the height ticks say how far a pulsar sits from the
  galactic plane but not on which side. The designers' own claim: the map places the Sun to within
  about 20 parsecs, one star in a thousand. (One re-analysis reported angle errors of 11 to 18
  degrees; it had compared a 3D angle with the map's flat one.)
- The uranium-238 spot: 9.6 Bq (about 0.77 mg). If it started isotopically pure, uranium-234 grows
  in: activity ratio 0.000138 after 49 years, 0.117 after 44,000 years. Measuring thorium-230 as well
  tells you whether it really started pure.
- The power units: three MHW-RTGs, about 12.8 kg of plutonium-238 per spacecraft at launch. After
  44,000 years none is left, but its daughters are: about 11 kg of uranium-234 and 1 kg of
  thorium-230, still giving off about 8 W. Their Th-230/U-234 activity ratio (about 0.35) dates the
  fuel to within a few hundred years.
- At 44,000 years spin-down dating has honest, interesting limits. The young pulsars (Crab, Vela,
  B1727-47) change by 20% to 900% and their unknown braking indices dominate; the old ones change by
  0.03% to 2% and are excellent clocks, but only after correcting for the observer's own motion (up to
  400 years of error per km/s) and for timing noise.

**Where the Voyagers are and will be.**
- Today (2026-10-15): Voyager 1 is 172.06 AU from the Sun and 23.9 light-hours from Earth; Voyager 2
  is 144.2 AU and 20.0 light-hours. NASA: Voyager 1 crosses one light-day from Earth on
  **2026-11-18 at 10:16 UTC**, a month from now. Voyager 1 still runs MAG and PWS; Voyager 2 runs CRS,
  MAG and PWS; NASA expects at least one instrument into the 2030s.
- Future flybys (Bailer-Jones and Farnocchia 2019, from Gaia DR2; our own Gaia DR3 recheck agrees):
  **Voyager 1 passes Gliese 445 at 0.575 pc (1.88 light-years) in about 44,000 years, at 116 km/s;
  Voyager 2 passes Ross 248 at 0.529 pc (1.73 light-years) in about 42,000 years.** At those times both
  stars are among the Sun's nearest neighbours, about 1 pc (3 to 3.5 light-years) away. NASA's pages
  carry older, inconsistent figures (1.6 or 1.7 light-years, "year 40,272"); How it's checked explains
  the difference.

**Practical facts.**
- NASA's Voyager glTF model (3.1 MB, 20,390 triangles, free to use) includes the record cover, but
  only as a soft 222-pixel patch: we build our own record, case, cover and cartridge.
- JPL Horizons sends no CORS headers, so the site ships a precomputed ephemeris (about 1,200 rows for
  2000 to 2100 at 30-day steps, accurate to 2 km).
- Cloudflare Workers static assets: 25 MiB per file, 20,000 files, and Range requests are ignored, so
  long audio is split per track and fetched whole. (R2 would allow streaming, but the current
  Cloudflare login has no R2 permission.)
- The best complete record audio is Ozma's 2017 remaster from the master tapes (an unofficial
  lossless rip of the CD is on the Internet Archive: 31 tracks, 111:18). Program order and durations
  are known. The side facing the spacecraft holds the pictures, greetings, sounds and about a third of
  the music; the side facing out is all music (Smithsonian). The exact break is unconfirmed.
- Tools are ready on this PC: Node 24, Python 3.14 with numpy and scipy, ffmpeg 9, Blender 5.1, gh
  logged in as Samizdat-Publications, wrangler logged in. Cut & Fill's handoff, agents and gotchas are
  the template; the 3I/ATLAS console already ships precomputed Horizons tables.

## The story frame (the biggest product decision)

**Recommendation: the real future.** You are a Finder from Gliese 445, a small red star. About 44,000
years after launch, Voyager 1 passes 1.9 light-years from your star, exactly as the published
trajectories say it will. Your sentinels flag a cold object crossing the outskirts of your system;
you match its speed and bring it aboard.

- **It is the real future**, taken from published Gaia-based trajectories, so the frame itself is
  checkable.
- **It makes every deduction matter.** The pulsars have drifted measurably, the plutonium is long gone
  and its daughters tell the age, the uranium spot has grown a measurable crop of daughters, and the
  senders' star is not obvious. Found today at 172 AU, "where did it come from?" would be trivial and
  the clocks would barely move.
- **A twist the data hands us:** at that time the Sun is your nearest neighbour, about 3.3
  light-years (1.02 pc) away, and the fifth-brightest star in your sky (magnitude -0.1, after Sirius,
  Canopus, Vega and Altair). The senders were next door. (Confirmed in M1 with Gaia DR3 and the HYG
  star model, checks `epoch.neighbours`, `epoch.neighbourDistance`, `epoch.sunBrightness`; D-A15.)
- **The epilogue snaps back to today:** where the real Voyagers are this month, Voyager 1 crossing one
  light-day on 18 November 2026, and "in about 44,000 years it will pass Gliese 445", which is where
  you just were.

Rejected: present day (the clocks barely move, the senders' star is obvious). Kept as a one-line swap:
Voyager 2, found by a Finder from Ross 248 at 42,000 years. The scenario (craft, epoch, home star) is
one config file; all the "when" and "where" math is computed from it, and the tests check it at any
epoch.

## The experience, chapter by chapter

After Arrival and The Key, the cover becomes a hub: work its regions in any order the physics allows
while the codex fills in. Play time is about 90 to 120 minutes, more if you listen to all the music.
The real basis of every step lives in `docs/HOW_ITS_CHECKED.md`.

### 0. Arrival (about 10 minutes)
- **See and do:** your vessel's lamps sweep a tiny machine under the real sky of that place and time:
  the Sun a bright, warm-white star behind it, the Milky Way from Gaia's all-sky map. Scan it for
  structure, heat and isotopes.
- **Work out:** it was built to talk across great distances (the dish) and to sense (the booms). Three
  cylinders are faintly warm, about 9 W in all (computed: 8.7 W): mostly uranium-234 (about 11 kg) and
  thorium-230 (about 1 kg), no plutonium-238, some plutonium-239 and uranium-235, and almost no
  uranium-238 (U-238/U-234 about 2e-4 by atoms, where natural uranium has about 18,000). Uranium-234
  with almost no uranium-238 means it was born from something heavier that someone made: they can make
  elements. On the decay-clock instrument, the thorium ratio says the heat source was made about
  44,000 years ago. First codex entry. (Corrected in build session 2 from the clocks module: the
  earlier "no plutonium" was wrong, see D-A13.)
- **A wrong answer shows:** suppose the uranium-234 came from natural uranium: then it must sit with
  about 18,000 times as much uranium-238, which is not there, so no age fits (the thorium ratios alone
  cannot tell the chains apart; the missing uranium-238 does, D-A14).

### 1. The Key (about 10 minutes)
- **See and do:** the cover under raking light you control; your atlas of atoms.
- **Work out:** two kinds of marks in long strings are binary digits (a bar across the line of
  writing is 1, a dash along it is 0); the single mark between the two drawn states of hydrogen is
  "1"; the unit is hydrogen's spin-flip transition, which gives both a time (0.704 ns) and a length
  (21 cm). Read as lengths, the cover's numbers are absurd (the record's number would be a million
  kilometres); read as times, they make sense.
- **A wrong answer shows:** choose another hydrogen transition and every later number turns absurd (a
  record that turns in microseconds, pulsars spinning impossibly fast), and the workbenches say so.

### 2. The Map (about 20 minutes)
- **See and do:** 15 lines from one point, 14 carrying binary numbers. Your pulsar catalogue (the real
  ATNF catalogue projected 44,000 years forward) and a 3D chart of the galaxy.
- **Work out:** the numbers are pulsar periods, and nearly every one is shorter than today's: the map
  is old (the exceptions are a clue for later). Anchor on old pulsars by period and direction, then
  find the young ones (Crab, Vela, B1727-47) by direction alone, because they have slowed down a lot.
  Fit the map onto the chart: the directions agree to a degree or two, the old distances do not, and
  the origin comes out as a region about 20 parsecs across, roughly a thousand stars, not far from
  you. The codex records the senders' limits: one crude period, distances off by up to six times.
- **A wrong answer shows:** a wrong match makes the lines refuse to converge; the fit stays visibly
  poor.

### 3. The Spot (about 5 minutes)
- **See and do:** a 2 cm spot on the cover that no diagram mentions, found only because it is faintly
  radioactive. Count longer for tighter error bars.
- **Work out:** it started as nearly pure uranium-238; its daughters give about 44,000 years. Two
  independent clocks agree.
- **A wrong answer shows:** short counts give honest, wide error bars; the wrong starting assumption
  fails the check against the second isotope.

### 4. The Trail (about 10 minutes)
- **See and do:** the object's measured velocity against your catalogue of nearby stars.
- **Work out:** exactly one star has the object flying straight away from it: the bright warm-white one,
  2.4 light-years behind. Distance divided by speed gives about 44,000 years, a third clock, and that
  star sits inside the map's region. Reframe the pulsar periods into that star's rest frame and the
  map's ages snap together too. WHERE and WHEN are complete.
- **A wrong answer shows:** for any other star the object moves sideways; without the reframe, the
  pulsar ages scatter by thousands of years.

### 5. The Player (about 10 minutes)
- **See and do:** the cover's record drawing: binary around the rim, the stylus at the edge, a side
  view with the playing time. Build a turntable to match.
- **Work out:** one turn every 3.6 seconds (16 2/3 rpm), start at the outer edge, about 54 minutes
  per side (the side view's binary). No arrow says which way it turns; the groove's spiral under your
  microscope does. Drop the needle: the first sound off the disc.
- **A wrong answer shows:** wrong speed shifts pitch and tempo exactly as a real turntable would; a
  wrong start gives silence or runout clicks; the wrong direction plays backward.

### 6. The Pictures (about 20 minutes, plus browsing)
- **See and do:** an oscilloscope of the signal beside the cover's picture diagrams.
- **Work out:** line time 8.34 ms, vertical lines, the staggered interlace, 512 lines, polarity and
  aspect, much like a television's horizontal hold. The circle resolves. Then all 156 frames decode
  live from the 1977 tape as the record plays. Triples are colour (the order is marked "probable",
  honestly); find "down" and turn the pictures upright; the counting and unit pictures teach their
  numerals and units, which makes the solar-system pictures readable (third planet, a blue world) and
  tells you how tall the senders are.
- **A wrong answer shows:** a wrong line time slants and tears the picture; a wrong interlace makes
  jagged edges; a wrong aspect squashes the circle into an ellipse; a wrong turntable speed from
  chapter 5 slants every picture.

### 7. The Voices (about 15 minutes, open-ended)
- Greetings in 55 languages, the UN greetings and whale songs, the 12-minute Sounds of Earth and 27
  pieces of music (90 minutes). Spectrograms and your notes: how many languages, the intervals in
  their music, the story of their world told in sound. Light matching puzzles; mostly listening. This
  chapter is the reward.

### 8. Portrait (about 5 minutes)
- The codex assembles: where they live, when they sent it, what they look like, their world, their
  voices. You look up at that bright warm-white star in your sky.

### 9. Our frame (epilogue, about 5 minutes)
- Today: where the Voyagers are right now (from shipped JPL tables, counting up live), Voyager 1
  crossing one light-day on 18 November 2026, which instruments still run, and the slow future. The
  map's periods were measured six years before launch. The words etched between the record's takeout
  grooves: "To the makers of music - all worlds, all times." Credits and How it's checked.

**Principles from the kickoff:** the player reasons; hints exist in three tiers per deduction (nudge,
method, answer) but appear only when asked; every wrong answer produces a meaningful wrong result;
every deduction is physically correct and documented.

**Also:** progress saved in the browser and a chapter select after finishing; settings for a "human
gloss" (human units beside the alien ones, off by default), sound captions, reduced motion and
volume. Desktop and laptop first (Chrome, Edge, Firefox); tablets supported; phones get a "best on a
bigger screen" note but must not break. Safari is best effort (no Mac here to test on).

## Look, feel and sound

- **Gold means human.** The alien interface is cool and luminous (deep indigo, cyan-green, violet);
  warm gold appears only on the human artifact and on what has been decoded from it, so you watch
  understanding spread.
- **Alien instruments:** radial and spiral readouts, strange dials, glyph labels with a quiet English
  gloss under each (the translation layer for you, the human player), and the alien's own notation
  for deductions in the codex. Measurements are in alien units; the gloss setting adds human ones.
- **The spacecraft:** tiny and cold, lit by your vessel's lamps with gold glints, the Sun a bright star
  far behind it, the real sky of that place and time (stars moved 44,000 years forward,
  constellations subtly changed).
- **Sound:** instrument hums and resonant interface plucks (synthesized live in Web Audio, plus
  ElevenLabs textures), the stylus touching down, the first crackle, a harmonic swell when the circle
  resolves. The record's own audio stays clean and real.
- **References:** Outer Wilds (wonder), Return of the Obra Dinn and Heaven's Vault (the deduction
  notebook), Chants of Sennaar (decipherment), the decoding scenes in Contact.
- Gemini concept art explores the alien interface early. Nothing generated ever stands in for real
  record content.

## How it's checked

`docs/HOW_ITS_CHECKED.md` (also a page on the site) lists every deduction: the claim, the real
physics, the data source, the test that proves it, and honest error bars and caveats. Test results
feed it, so it cannot drift from the code.

Automated checks (`npm run check`, or double-click `Run Checks.bat`):

1. **Cover numbers:** every binary string transcribed from the cover decodes to its documented value
   (3.6 s per turn, 53.8 minutes per side, 8.34 ms per line, 512 lines, the 14 pulsar periods of
   Sagan, Sagan and Drake 1972).
2. **Pulsar identification is unique:** each map line has exactly one consistent match among all
   4,503 catalogue pulsars, at today's date and at the story's epoch.
3. **Triangulation lands on the Sun:** the honest region fitted from the real map geometry contains
   the Sun; its size is reported, not hidden.
4. **Map dating today:** reproduces about 1971 (Crab 1971.76, glitch-corrected Vela 1971.77, all
   usable pulsars 1969.7 plus or minus 1.4).
5. **Map dating at the story's epoch:** in the senders' rest frame the elapsed time lands within
   honest error bars of the truth; without the reframe it scatters as the physics says it should.
6. **Uranium and RTG clocks:** seeded simulated measurements; the 95% interval contains the truth in
   about 95% of trials.
7. **The trail:** among catalogue stars within 10 pc, exactly one has the craft moving radially away
   from it (the Sun), and distance over speed matches the elapsed time.
8. **Pictures:** the calibration circle decodes from the real tape with an axis ratio of 1.00 plus or
   minus 0.01 at the right settings; a wrong line time produces the predicted slant; all 156 frames
   decode; the browser decoder matches the offline reference (SSIM at least 0.98); each frame
   correlates with its published clean image above a sanity floor.
9. **The player:** a speed error of k changes the measured pitch by exactly k; the wrong direction
   reverses the audio.
10. **Epilogue:** the shipped ephemeris matches fresh Horizons spot checks within 100 km.
11. **The bot:** plays the whole experience through the real interface in headless Chrome, chapter by
    chapter, to the epilogue; a wrong-answer bot confirms each meaningful wrong result; screenshots at
    key moments.
12. **Hygiene:** no em dashes in tracked text, no secrets, every file under 20 MB, links valid.

On top of that: the lead reads screenshots every milestone, blind critics review captures, a science
auditor reviews every claim, and Stewart's playtest notes outrank all of them.

## Architecture

- **Stack:** Vite and TypeScript (strict); three.js with the WebGL2 renderer (pinned) for the 3D
  scenes; Preact with signals for the instrument interface; Canvas 2D and SVG for scopes, spectrograms
  and decoded pictures; Web Audio; Web Workers for signal processing; Vitest; Playwright driving the
  installed Chrome. No server: Cloudflare Workers static assets.
  - Why WebGL2 rather than WebGPU: the 3D needs are modest, WebGL2 runs everywhere, and headless Chrome
    on this PC has no WebGPU adapter (a Cut & Fill finding), while the bot and capture loop must run
    headless.
- **Modules:**
  - `src/science/`: pure TypeScript, no DOM, runs in Node and the browser. Binary and hydrogen units;
    pulsars (identification, spin-down with braking index, glitches, timing noise, observer-frame
    Doppler, light time); triangulation; decay clocks; kinematics; the epoch model that projects real
    data to the story's date.
  - `src/dsp/`: the picture decoder (sync lock on falling edges, interlace, droop inverse, aspect,
    polarity, colour), shared by a Worker and the tests.
  - `src/record/`: the record timeline (both sides) and the turntable engine (speed, direction,
    stylus, crackle).
  - `src/world/`: three.js scenes (encounter, cover close-up, galaxy chart, neighbourhood chart,
    turntable, portrait).
  - `src/ui/`: shell, codex, workbenches, glyphs, hints, settings.
  - `src/game/`: the deduction graph, state, saves, and one command bus that both the interface and the
    bots drive.
  - `src/harness/`: the `window.__finder` test API (dev and harness builds only).
- **Data** (small JSON, committed, built by scripts from the sources): `cover.json` (every etched
  number and the map's line geometry), `pulsars.json`, `stars.json`, `ephemeris.json`, `record.json`
  (the timeline), `images.json` (frames, channels, colour triples, orientation).
- **Media:** one compressed audio file per track, fetched whole (static assets ignore Range); the
  picture signal as 156 per-frame slices (96 kHz, 16-bit, mono, about 0.5 MB each, about 85 MB in all)
  decoded in a Worker. Every file under 20 MB. Compressed runtime media is committed (Ranch Defense
  Force once shipped silent from gitignored assets); raw downloads never are, and a fetch script
  re-downloads them with SHA-256 checks.
- **Site:** `/` landing page, `/play/` the experience, `/checked/` How it's checked.

## Sources

| What | From | Used for |
|---|---|---|
| Picture signal | Internet Archive `voyager.decode`, `384kHzStereo.wav` (Ozma's 2016 transfer of the 1977 master; MD5 above) | Live decoding; the record's picture side |
| Record audio | Ozma 2017 remaster (unofficial lossless CD rip on the Internet Archive, `voyager-golden-record-cd-ozma`); NASA SoundCloud as a cross-check | Greetings, sounds, music |
| Clean images | goldenrecord.org, the Ozma book scans, NASA's gallery | Test references and an epilogue gallery only; never instead of decoding |
| Pulsars | ATNF catalogue v2.9.0 (cite Manchester et al. 2005); Jodrell Bank glitch table and Crab ephemeris | Map, dating |
| Stars | HYG v4.2 or AT-HYG (Gaia-based); Gaia DR3 for Gliese 445 | The alien sky, the trail |
| Sky | ESA Gaia EDR3 all-sky colour map (equirectangular) | Background |
| Spacecraft | NASA `Voyager.glb` (science.nasa.gov) plus our own record, case, cover and cartridge | Arrival |
| Ephemeris | JPL Horizons (-31, -32), 30-day steps, 2000 to 2100 | Epilogue |
| Flybys | Bailer-Jones and Farnocchia 2019 (RNAAS 3, 59) plus our Gaia DR3 recheck | Story frame |
| Constants | Hydrogen 1,420,405,751.768 Hz; LNHB half-lives (U-238 4.468e9 y, U-234 2.455e5 y, Th-230 7.538e4 y, Pu-238 87.74 y) | Everything |
| Cover drawing | NASA's 1977 cover photo (GPN-2000-001978, public domain) and the vector Pioneer plaque map (same 14 pulsars, same periods), rebuilt as exact SVG with every binary string verified (`docs/research/cover.md`) | Cover viewer, puzzles, print plate |

## Milestones

Each milestone: a checklist in `docs/plans/Mx.md`, build, self-test (checks, screenshots, critics at
the gate), commit, push, preview deploy, PROGRESS.md update, then straight on to the next.

| # | Milestone | Done when |
|---|---|---|
| M0 | Setup (this planning session, after approval) | Private repo `Samizdat-Publications/the-finder` with PLAN, PROGRESS, HANDOFF, CLAUDE.md, decisions, research, agents, settings |
| M1 | **Ground truth.** Fetch sources with checksums; an offline reference decoder (Python) decodes the calibration circle and all 156 frames from the real tape; transcribe and verify `cover.json`; the science core in TypeScript with tests for every number above; the epoch model (confirm the neighbour twist); How it's checked skeleton | Science and decoder checks green; the lead has looked at the circle and a contact sheet of all 156 frames |
| M2 | **Engines and scaffold.** The browser decoder in a Worker matching the reference; the media pipeline (per-track audio, frame slices, manifests); the turntable audio engine; Vite scaffold with landing page and `/play/`, wrangler, check script, the two .bat files; first deploy | Engine tests green; preview link live |
| M3 | **Vertical slice:** Arrival, The Key, The Player, and The Pictures up to the circle and a few frames; the alien interface shell; codex v1; encounter scene v1; sound v1 | Bot completes the slice; critics at the gate; **Stewart's first playtest link** |
| M4 | **Where and when:** The Map, The Spot, the RTG clock, The Trail, reframed dating | Bot completes; science checks visible in the interface |
| M5 | **Pictures complete** (all frames, colour, orientation, their notation) and **The Voices** | Bot completes; every frame decodes in the browser; listening works in Chrome, Edge and Firefox |
| M6 | **Portrait and Our frame**; hints, saves, settings, accessibility | Full-playthrough bot; no dead ends |
| M7 | **Polish and ship:** art and sound passes, laptop iGPU performance, landing page with footage, README, How it's checked page, credits | Critics at target; performance targets met; QA audit clean; live link |
| M8 | **Bonus:** printable relief plate of the cover (STL sized to the printer); optional Blender beauty renders for the landing page | The STL opens cleanly in a slicer |

## What Stewart will see, and when (honest expectations)

- **After M1 (about 1 session):** pictures of the calibration circle and all 156 frames decoded from
  the 1977 tape, plus a short report showing the pulsar map dating itself to about 1971 and the clocks
  agreeing. No game yet.
- **After M2 (about 1 session):** a preview link with a landing page and a bare instrument: drop the
  needle, hear the record at right and wrong speeds, watch a picture decode.
- **After M3 (1 to 2 sessions):** the first playable slice, from the arrival to the circle resolving.
  Your notes on it steer the rest.
- **After M4 to M6 (about 3 sessions):** the whole story, start to finish.
- **After M7 (1 to 2 sessions):** polished and shared. **Total: roughly 7 to 10 sessions.**
- **Quality:** a beautiful, thoughtful indie experience, not AAA. The alien interface, the sound and
  the decoding moments are where it can shine. The spacecraft is NASA's model plus our own record. The
  pictures are the real decoded ones: noisy, warped by 1977 tape, and authentic.

## Risks

| Risk | Mitigation |
|---|---|
| Puzzles too opaque | Three-tier hints; every wrong answer teaches; Stewart plays the M3 slice before the rest is built |
| Puzzles solvable by wiggling sliders | Wide ranges, coupled parameters, and reading the cover being faster than guessing |
| Subtle science (frames, braking indices, the map's own errors) gets something wrong | Science core tested against the research numbers; a science auditor reviews every claim each milestone; honest error bars everywhere |
| The picture tape is a 1.46 GB download from the Internet Archive | Two byte-identical mirrors plus Ron Barry's copy; checksum verified; only processed slices ship |
| Decoder quality (wow, flutter, droop, dropouts) | Lock to falling edges, droop inverse, per-frame period fit (published methods); the offline reference first |
| Browser audio quirks (FLAC decoding, pitch on playbackRate, Safari) | Whole-file fetches, `preservesPitch = false`, our own WAV/FLAC parsing as a fallback, tests in three browsers |
| Hosting limits (25 MiB per file, no Range) | Per-track files, per-frame slices |
| Scope (156 frames, 2 hours of audio, 10 chapters) | Vertical slice first; chapters gated; bonus items explicit |
| Malware in the Voyager-decoder ecosystem | Never download binaries; the known lure is named in HANDOFF.md |
| Licensing | Stewart has taken responsibility; it does not drive decisions (noted only) |

## Key decisions

All are AI decisions that Stewart can overrule; each goes in `docs/DECISIONS.md` with how to reverse it.

| ID | Decision | Why |
|---|---|---|
| D-A01 | Name stays **The Finder**; private repo `the-finder`; site `the-finder.stewartgregerson.workers.dev` | The record is addressed to whoever finds it, and that is you. Renaming is cheap before launch |
| D-A02 | Story frame: Voyager 1, found about 44,000 years after launch by a Finder from Gliese 445 | Real future; every deduction matters; the neighbour twist |
| D-A03 | Web stack: Vite, TypeScript, three.js on WebGL2, Preact, Web Audio, Workers; Cloudflare Workers static assets | A shareable link; his conventions; headless testing |
| D-A04 | Pictures decoded live from Ozma's transfer of the 1977 image master, never re-encoded | The kickoff's authenticity rule, and the tape exists |
| D-A05 | Record audio from Ozma's 2017 remaster | Best available, from the master tapes |
| D-A06 | Hub structure after The Key; chapters in any order the physics allows | Agency; mirrors real decipherment |
| D-A07 | Alien units in-world, optional human gloss | Keeps the alien perspective without locking anyone out |
| D-A08 | Colour order and the side break are shown as honest inferences | The record does not settle them |
| D-A09 | Desktop first; tablets supported; phones best effort; Safari untested | The puzzle interface needs room; no Mac here |
| D-A10 | Compressed runtime media committed; raw sources re-fetched by script | A deploy never depends on regenerating media |

## How the build runs

- **Autonomous through the whole plan**, milestone after milestone, without stopping at milestone
  boundaries. It stops only for "checkpoint", a usage limit, or a decision that is genuinely Stewart's
  (irreversible or product-defining). Preview links and progress pictures go to Stewart as they land;
  work continues without waiting.
- **Lead session:** Opus 5.5 at **xhigh** for the first build session (M1 and M2: the sources, the
  decoder, the science core and the architecture, where a wrong call is expensive), then **high** from
  M3 on; **max** only for a stuck bug. Subagents carry their own model and effort in their
  definitions, so delegated work stays cheap whatever the lead is set to. If quota runs tight, high
  everywhere still works.
- **The main thread keeps** architecture, integration, science and taste calls, reading screenshots
  and decoded pictures, and merging. It writes a short spec for everything it delegates (files owned,
  interfaces, tests that must pass, done criteria).
- **Subagents** (`.claude/agents/`, adapted from Cut & Fill): `builder` (Sonnet, medium) for scoped
  TypeScript and interface work; `builder-opus` (Opus, medium) for the decoder, the science core and
  anything numerically delicate; `asset-smith` (Sonnet, medium) for Blender, audio transcoding,
  ElevenLabs and the print plate; `scout` (Sonnet, medium) for current API facts; `runner` (Haiku) for
  long suites; `player-critic` (Sonnet, high, blind) on captures; `science-auditor` (Opus, high) on
  every claim in How it's checked; `qa-auditor` (Sonnet, high) before each handoff. Downloads,
  transcodes, batch decodes, test suites and captures run as background scripts.
- **Checkpoints:** commit and update PROGRESS.md after every meaningful chunk. On "checkpoint":
  finish or safely stop the current step, update PROGRESS.md and HANDOFF.md, commit, push, stop.
- **Paid generation** (ElevenLabs, Gemini, Meshy if ever useful): soft cap of about $20 per session,
  every call logged in `docs/SPEND.md`.

## Right after approval (this session)

1. Write into the repo: this plan (marked approved), `docs/research/` (the four reports in full),
   `PROGRESS.md`, `HANDOFF.md` (paste-in prompt, launch steps, effort and why, delegation playbook,
   tools, gotchas), `CLAUDE.md` (project rules), `docs/plans/M1.md`, `docs/DECISIONS.md`,
   `docs/HOW_ITS_CHECKED.md` (skeleton), `docs/CREDITS.md`, `docs/SPEND.md`,
   `docs/STEWART_FEEDBACK.md`, `docs/NEEDS_STEWART.md`, a `README.md` stub, `.gitignore`,
   `.claude/agents/*`, `.claude/hooks/critic_guard.mjs`, `.claude/settings.json`.
2. `git init`, a first commit with explicit paths, `gh repo create Samizdat-Publications/the-finder
   --private`, push.
3. Add The Finder to the Projects table in `C:\Users\stewa\Documents\Claude\CLAUDE.md` and save a
   project memory note.
4. Stop. The build starts in a fresh session from HANDOFF.md.
