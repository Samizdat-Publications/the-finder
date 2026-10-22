# HANDOFF: start here

_Last updated: 2026-10-22 by build session 4 (Opus 5.5): M6 built (Portrait and Our Frame), every chapter playable, the V1.0 draft. Whoever stops next updates this block, "Where things stand", and anything below that changed._

## For Stewart: how to start the next session

Start it whenever you like (after your weekly limit resets if you are near it).

**Option A, Claude desktop app (Code tab):**
1. Start a new session in the folder `C:\Users\stewa\Documents\Claude\Golden Record`.
2. Model: **Opus 5.5**. Effort: **high** from M3 on (why: see "Effort" below).
3. Permission mode: **Auto**, so it can work through the plan without stopping to ask about each
   command.
4. Paste the prompt below as the first message, then let it run.

**Option B, Windows Terminal (PowerShell):**

```powershell
cd "C:\Users\stewa\Documents\Claude\Golden Record"; claude --model claude-opus-5-5 --effort high --permission-mode auto
```

Then paste the prompt below.

**The prompt to paste:**

```
Build The Finder, my Voyager Golden Record game where you play the alien who finds Voyager. Read CLAUDE.md, then PROGRESS.md, then HANDOFF.md, then PLAN.md and docs/research/README.md, then the checklist for the current milestone in docs/plans/. Then work autonomously through the plan, milestone after milestone, without stopping at milestone boundaries. Keep the main thread on architecture, integration, science and judgment calls; delegate well-specified implementation to the builder, builder-opus and asset-smith subagents, and run downloads, transcodes, batch decodes, test suites and captures as background scripts. Commit and update PROGRESS.md after every meaningful chunk. Send me preview links, decoded pictures and progress screenshots as they land, but don't wait for my reply. If I type "checkpoint", finish or safely stop the current step, update PROGRESS.md and HANDOFF.md, commit and push everything, and stop. Ask me only about decisions that can't be undone or that change what the final product is. Never use em dashes.
```

**Between sessions (5 minutes):** look at the pictures and links it sent you, then write raw notes at
the top of `C:\Users\stewa\Documents\Claude\Golden Record\docs\STEWART_FEEDBACK.md` ("the circle
moment needs a bigger sound", "I got stuck on the map"). Your notes outrank the AI critics. For later
sessions use the same prompt; each session ends by printing the exact prompt (and effort) for the next.

## Effort: xhigh first, then high

- **xhigh for build session 1.** It covers M1 (ground truth: the real image tape decoded, the cover
  transcribed, the science core) and M2 (the browser decoder, the media pipeline, the turntable audio
  engine, the scaffold). That is where the subtle physics lives (observer-frame Doppler, braking
  indices, the map's own errors, honest error bars) and where an early wrong call costs the most.
  Effort sets how hard the lead session thinks: at xhigh it reasons deeply when a problem demands it
  and stays brief on routine steps.
- **From M3 on, use high** (interface, chapters, sound, polish). Use **max** only for a stuck bug. If
  quota runs tight, high everywhere still works.
- **Delegation is not affected by the lead's effort.** Each helper carries its own model and effort in
  `.claude/agents/` (builders and asset work at medium, critics and auditors at high, the runner on
  Haiku), so cheap work stays cheap whatever the lead is set to.

## Where things stand

- 2026-10-15: plan approved (`PLAN.md`). Research in `docs/research/` (start with its README).
- **Build session 1 (2026-10-15):** M1 step 0 (skeleton, check runner, sources downloaded and verified).
- **Build session 2 (2026-10-15/16):** M1 (ground truth) and M2 (engines and scaffold) built, checked and
  audited; the first preview is live at https://the-finder.stewartgregerson.workers.dev/play/ (the
  instrument bench: the real record on a turntable, and the 156 pictures decoded live from the 1977
  tape). `npm run check` runs 7 steps (9 by session 4), all green; How it's checked has 65 checks, all passing. Two
  science audits found and fixed real problems (Vela's glitch rule, a Th-230 uncertainty typed 10 times
  too small, circular decoder checks, model-conditional coverage); decisions D-A13 to D-A20 record
  every science-driven change. M3 is planned (`docs/plans/M3.md`) and its step 2 (the cover as exact
  SVG) was in flight at the end of the session: see PROGRESS.md "In flight" for whether it landed.
- **Later in build session 2 (2026-10-16):** M3 finished (the slice bots, a blind critic review, the
  layout pass 8b); M4 built: The Map, The Spot and The Trail on a shared epoch model
  (`src/chapters/shared/epochModel.ts`), sound for the new moments, whole-game bots (31 of 31 from a
  fresh save), a science audit and its fixes (honest measured values and cuts on The Trail, coverage
  tests), no dead ends (D-A28: 99.9% acceptance where noise gates progress, and validated seeds),
  messages in the alien's units, a QA audit, two blind critic passes and step 7e (staged moments,
  headline results, the heavy science in a Worker). 147 checks pass; M4 closed. M5 is planned (`docs/plans/M5.md`) with research in `docs/research/teaching-frames.md`
  and `voices.md`.
- **Paused 2026-10-16 (quota):** M5's chapters (The Pictures complete, The Voices) are live with 43
  deductions; the M5 science audit's fixes are half done: 6b's code is in (its docs left), 6a is partly
  done and not wired in. Start from PROGRESS "Next (exact)" and the two progress notes in
  `docs/plans/M5_specs/` (`step6a-progress.md`, `step6b-progress.md`). Stewart's open items:
  `docs/NEEDS_STEWART.md` (the Gemini cap, a stray folder, the optional Firefox check).
- **Build session 3 (2026-10-16 evening):** Stewart played the start and got lost at the gold disc. The
  audience is now explicit: Stewart walking his almost-12-year-old son through it. Built the guided tour
  (D-A33, `src/tour/`): the landing page's first button, 58 stops over all 43 deductions in one order (now 65 stops, 44 deductions, session 4),
  a guide panel with "Do it for me" on every step, live Voyager-now finale; printable cover STLs in
  `print/`. Deployed and live-checked. 6a (the Voices' audit fixes) handed to a builder-opus helper.
- **Build session 4 (2026-10-22): the V1.0 draft.** Portrait and Our Frame built (D-A36, D-A37) with tour stops,
  bots and audits; Gemini 4 Argon added as a second-opinion reviewer (D-A34, `tools/consult_gemini/consult.py`,
  triage in `docs/consults/`); the Gemini video critic back and ongoing (`tools/critic_gemini/watch.mjs`); fixes
  from Argon, the critic and the M6 science audit (`docs/reviews/2026-10-22-*`). Every chapter from a fresh save
  to Our Frame: bot.game 44 of 44; the tour bot through all 65 stops.
- **How session 2 worked (keep doing this):** every helper got a written spec saved in
  `docs/plans/Mx_specs/` before launch; the lead reviewed every report, looked at every picture and
  capture, ran the tests itself before each commit, and resumed the same helper (SendMessage) for
  follow-ups so its context carried over. Science helpers were told to leave a failing test failing and
  report rather than tune; three real findings came from that.

## Delegation playbook

- **Lead (main thread):** architecture, integration, reviewing every delegated diff, reading
  screenshots and decoded pictures, science and taste calls, writing specs, merging.
- **Spec template for any subagent:** goal; files it owns (create or modify, nothing else); interfaces
  (types and signatures); the hard rules that apply (real data only, pure science code, determinism,
  one command bus); exact commands that must pass; done criteria; report format (files changed, final
  test output, open issues).
- **Which agent:**
  - `builder` (Sonnet, medium): clearly scoped TypeScript: scaffold, Preact interface components,
    scene plumbing, loaders, harness tooling, saves, settings, the landing page.
  - `builder-opus` (Opus, medium): exactness matters: the reference decoder (Python) and the browser
    decoder (TypeScript), `src/science/` (pulsars, triangulation, decay clocks, kinematics, the epoch
    model), audio timing, data builders.
  - `asset-smith` (Sonnet, medium): the media pipeline (ffmpeg transcodes, picture slices), Blender
    (record, case, cover, cartridge; NASA model clean-up), the cover SVG rebuild, ElevenLabs sound,
    Gemini concept art, the print plate.
  - `scout` (Sonnet, medium): current API facts before version-sensitive work, and any research item
    marked "could not confirm" before it is relied on.
  - `runner` (Haiku): long suites, batch decodes and captures; returns a short failure summary.
  - `player-critic` (Sonnet, high, blind, guarded): after notable visual or interaction changes and at
    milestone gates. Prompt it with only "A new build is in review/inbox. Play it."
  - `science-auditor` (Opus, high, read-only): whenever a deduction is added or changed, and at every
    gate: checks each How it's checked claim against `docs/research/` and the test output.
  - `qa-auditor` (Sonnet, high, read-only): before every handoff and milestone gate.
- **Parallel work:** independent modules can run as parallel background agents when their files do not
  overlap; otherwise sequence them. Never merge blind: read the key files and run `npm run check`
  yourself.
- **Background scripts, not thinking:** downloads (the image tape is 1.46 GB), transcodes, batch
  decodes, test suites and captures run with the Bash tool's background mode; you are notified when
  they finish, so never poll.
- **Gemini video critic** (adapt Noclip's `tools/critic_gemini/critic.py`; it can hear audio): at the
  M3 gate and at M7 only; log spend in `docs/SPEND.md`.

## Tools and paths on this PC

| What | Where / how |
|---|---|
| Blender 5.1 | `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe` (headless: `-b --factory-startup -P script.py -- args`) |
| Chrome for Playwright | Installed Chrome (`channel: 'chrome'`); Playwright's bundled Chromium fails to spawn here ("spawn UNKNOWN") |
| Node / npm | Node 24.19, npm 11.17 |
| Python | 3.14.3 with numpy 2.4.3, scipy 1.17.1, soundfile. Many pip packages fail on 3.14: for psrqpy, build123d and the like use `uv venv --python 3.12 tools/<name>/.venv` |
| ffmpeg | 9.0.2 full build on PATH |
| GitHub | `gh` logged in as Samizdat-Publications (scopes repo, workflow) |
| Cloudflare | wrangler OAuth login exists (Workers write; **no R2 scope**). Pin wrangler as a devDependency and use `npx wrangler` from the project folder. If the login expired, `npx wrangler login` opens a browser: put that in `docs/NEEDS_STEWART.md` |
| GPU | RTX 5070 Ti Laptop + Intel Arc 140T iGPU (the "decent laptop" stand-in). Headless Chrome gets the RTX for WebGL2 (this project's renderer). Working iGPU flags: `--force_low_power_gpu --use-angle=d3d11` (see Cut & Fill `tools/harness/browser.mjs`) |
| API keys | Environment first, else `C:\Users\stewa\ClaudeProjects\Noclip\.env` (OPENAI_API_KEY, GEMINI_API_KEY, ELEVENLABS_API_KEY, PIXELLAB_API_KEY, SKETCHFAB_TOKEN, MESHY_API_KEY; no Tripo key found). Load inside scripts, never print, never copy into this repo |

**Code worth copying from his other projects** (read-only there; copy and adapt here):
- `C:\Users\stewa\Documents\Claude\Excavator Sim\tools\check.mjs` (check runner that spawns tools
  through `process.execPath`, writes a `LAST_RUN.md`), `tools\harness\browser.mjs` and
  `tools\harness\capture.mjs` (Playwright with installed Chrome, GPU flags, captures into
  `review/inbox/`), `Play Cut and Fill.bat` and `Run Checks.bat` (the .bat style Stewart knows).
- `C:\Users\stewa\ClaudeProjects\Noclip\spike\threejs\capture.mjs` and
  `tools\critic_gemini\critic.py` (Gemini critic that watches video and hears audio).
- `C:\Users\stewa\ClaudeProjects\Hot Wheels Sim\tools\` `film.mjs` and `media.mjs` (footage for the
  landing page), `site.mjs` (landing site).
- `C:\Users\stewa\ClaudeProjects\seked\scripts\web-assets.ts` (gltf-transform: meshopt, texture
  compression, the 25 MiB limit).
- `C:\Users\stewa\Documents\Claude\3I ATLAS Anomaly Console\tools\fetch_ephemeris.py` (JPL Horizons to
  shipped JSON) and its `README.md` (the README and landing style Stewart likes: badges, screenshots,
  plain language, honest sourcing).
- `C:\Users\stewa\Documents\Claude\Ranch Defense Force\tools\harness.ts` (starts Vite through
  `process.execPath` to dodge the npx.cmd ENOENT problem).
- `C:\Users\stewa\Documents\Claude\13F Fire Support Sim\index.html` (boot-error overlay).
- Public repo `Samizdat-Publications/antikythera` (astronomy dashboard on Cloudflare): clone read-only
  if its astronomy or audio code helps.

## Gotchas (each one cost his other projects time, or was found in planning)

- **The image tape:** `384kHzStereo.wav` is 1.46 GB of 32-bit float stereo labelled 384 kHz (most
  likely a 192 kHz transfer relabelled to restore the cover's timing). Verify MD5
  `f543349efdcc258e56c9af3baa9d33c8` before use; read it in chunks (soundfile), never whole into memory;
  the Internet Archive supports byte ranges, so make the download resumable.
- **Browser audio:** `decodeAudioData` resamples to the AudioContext's rate, so decode the 96 kHz picture
  slices in an `OfflineAudioContext` at 96,000 Hz (or parse WAV/FLAC ourselves) and assert the decoded
  length equals the source length. Set `preservesPitch = false` (plus the webkit and moz prefixes) so
  `playbackRate` shifts pitch like a real turntable. Negative `playbackRate` is unsupported: pre-render
  reversed clips for the wrong-direction lesson.
- **Cloudflare static assets ignore Range requests:** fetch each audio track whole (with a progress
  bar), then play from a Blob URL. Keep every file under 20 MB.
- **JPL Horizons sends no CORS headers:** ship precomputed tables (30-day Hermite nodes, accurate to
  2 km).
- **ATNF:** the web form wraps CSV in HTML; parse `psrcat.db` from the versioned tarball instead
  (`psrcat_pkg.v2.9.0.tar.gz`) so results are reproducible.
- **Map angles:** compare map angles with galactic longitude, never with a 3D angle from the galactic
  centre (that mistake produced the "11 to 18 degree errors" in older write-ups).
- **Third-party decoders:** learn from them, but copy no code without checking its licence; never run
  downloaded binaries; never touch `Adriann6842/voyager-golden-record` (malware lure).
- **The Claude Browser pane pauses requestAnimationFrame between tool calls** and refuses pointer lock:
  use Playwright for real captures.
- **Wrangler through `npx.cmd` breaks on paths with spaces** (this folder has one): run it from the
  project folder with relative paths (`dist`).
- **Git Bash rewrites `/paths` inside environment variables:** set `MSYS_NO_PATHCONV=1` when needed.
- **Shell heredocs through the Bash tool break on apostrophes:** write scripts with the Write tool into
  the scratchpad, then run them.
- Keep `.claude/worktrees` out of Vite's watcher and Vitest.
- **Gitignored generated assets once shipped a silent game** (Ranch Defense Force): commit the
  compressed runtime media.
- **three.js:** `vertexColors: true` without a color attribute renders black with no error; never run
  two animation loops; clamp dt.
- **Defect shapes his projects keep producing** (13F): world logic placed in the frame loop; interface
  text promising a control that does not exist; safeguards that exist only in prose; measurements that
  agree with themselves; boot-order mistakes. Here, add: a test that compares the science core with
  itself instead of with the research numbers.

- **Python packages are in the user site-packages:** run scripts as `python -P script.py` (safe path),
  not `python -I` (isolated mode hides numpy). Entry scripts add their own folder to `sys.path`.
- **The image tape downloads at about 3 to 4 MB/s** (about 7 minutes); `node tools/fetch-sources.mjs
  image-tape` resumes a partial download and refuses a file whose MD5 differs.
- **The Pioneer plaque SVG lives at** `https://upload.wikimedia.org/wikipedia/commons/0/02/Pioneer_plaque.svg`
  (M1.md's guessed b/b5 path is wrong); `tools/sources.json` has the right one.
- **Chrome's `decodeAudioData` scales 16-bit samples asymmetrically** (positives divided by 32767,
  negatives by 32768): exact integers need `restoreInt16` in `src/media/frames.ts`. Anything that wants
  exact 16-bit samples in the browser needs the same.
- **The Bash tool turns `\\n` inside heredocs into real newlines** (seen in session 2): for scripts with
  escapes, use the Write tool (or Edit) rather than a heredoc.
- **Browser tests** live in `tests/browser/*.browser.mjs` and run through
  `node tools/harness/browser-tests.mjs [filter]` against the Vite dev server, so a test can
  `await import('/src/...')` inside `page.evaluate`. They are step 4 of `npm run check`.
- **`npm run check` clears `harness/out/checks/`** at the start: two helpers running it at once can wipe
  each other's records; rerun at the end. It also rewrites `docs/HOW_ITS_CHECKED.md` and
  `docs/checks/results.json` (tracked): commit them after a full green run.
- **Python check ids are `decoder.ref.*`** (the reference decoder); the browser decoder's are `decoder.*`.
- **Firefox and WebKit are not installed for Playwright** here (only the installed Chrome works); do not
  download browsers without a reason logged in DECISIONS.
- **Recovering a stopped helper's spec:** its prompt is the first user message in
  `~/.claude/projects/C--Users-stewa-Documents-Claude-Golden-Record/<session>/subagents/agent-<id>.jsonl`.
  Save specs into `docs/plans/` before launching long helpers so a session switch never loses them.

- **`data/seeds.json` holds the validated playthrough seeds** (D-A28). Rebuild it with
  `node tools/seeds/build-seeds.mjs` (about 8 minutes, 15 worker processes) after any change to a
  checker, the epoch model or its data; `src/chapters/seedCheck.test.ts` replays a sample.
- **Checker messages carry quantity tokens** (`{{q|dim|SI|digits}}`, `src/ui/message.ts`); every place
  that shows a message renders it with `renderMessage(text, gloss)`. Test logs print the raw tokens;
  that is expected. `src/ui/messageUnits.*.test.ts` fails on any human unit word with the gloss off.
- **The blind critic reads everything in `review/inbox/`:** before running it, move older capture
  folders to `review/archive/` so it sees one build; `node tools/harness/browser-tests.mjs game` writes
  a fresh whole-game capture (`<timestamp>-m4/` with `shots.txt` for the critic).
- **The epoch model's heavy parts** (identification, region, trail rows) take 0.2 to 1 s on the RTX
  machine; anything new that calls them on the main thread must go through step 7e's off-thread path.
- **Backslashes in Bash heredocs get mangled** (seen twice in session 2): write scripts with the Write
  tool and edit code with the Edit tool.
- **A helper that cannot delete something must not ask the lead to do it for it:** surface the request
  to Stewart instead (a stray folder `C:\Users\stewa\Documents\Claude\Golden%20Record\` left by a QA
  script is waiting for his decision).

- **Deductions can be defined before they are playable:** a node with `later: true` (in
  `src/game/nodesM5.ts` and future node files) stays out of `NODES` (play, gating, counts, notebook) and
  sits in `ALL_NODES`; its builder clears the flag once its checker and instrument pass, as `built` does
  for a chapter. Add a milestone's nodes yourself before parallel builders start, so two never edit the
  graph at once.
- **The dev server sometimes drops or times out a request under load** (connection reset on a page,
  `ERR_CONNECTION_TIMED_OUT` on a module); the browser-test runner retries a page open three times and
  each test once, and reports FLAKY. A test that fails twice is real.

- **Second opinions (D-A34):** `python -P tools/consult_gemini/consult.py --ask <question.md> --out <answer.md>
  [--include a,b] [--exclude-tests]` packs the tracked text into one prompt for Gemini 4 Argon (about 1M tokens
  whole, about $2). Check every finding against the code before acting; its physics was once overstated.
- **The ongoing video critic:** `node tools/critic_gemini/watch.mjs --chapters <tour parts>` films that stretch of
  the guided tour with sound (`tools/harness/film-tour.mjs`) and runs `critic.py`; on any failure it writes
  `CRITIC_FAILED.txt` in the review folder: tell Stewart.
- **Our Frame has no deduction:** it counts as done once visited (`game.visited`, saved); its section is a signal
  the guide sets per stop (`showEpilogueSection`); while the tour is on, its own Next, dots, arrow keys and Back
  to the ring are hidden.
- **The guided tour is the main way in (D-A33).** Every deduction is a stop in `src/tour/script.ts` (the
  lead writes the narration: plain words, the real story, a question for the child) with a "Do it for me"
  in `src/tour/actions/<chapter>.ts` and spotlight selectors in `src/tour/actions.ts`; the tests fail if a
  playable deduction is missing. Changing an instrument's controls, labels or right answers means updating
  its tour action and the script's "Your turn" text, then `node tools/harness/browser-tests.mjs tour`
  (about 3 minutes; `TOUR_ARCHIVE=1` writes its capture to `review/archive/` instead of the inbox).
  `node tools/harness/live-tour.mjs` checks the deployed site.

## End-of-session protocol

1. Finish or safely stop the current step; `npm run check` green or the failure written down.
2. Run `qa-auditor` on the claims you are about to make (skip only on a "checkpoint" stop).
3. Update `PROGRESS.md` (current milestone, done, in flight, known issues, exact next steps) and this
   file (the "Last updated" line, "Where things stand", new gotchas).
4. Commit with explicit paths, push.
5. End with short bullets for Stewart: what shipped, links, what needs him, and the exact prompt and
   effort for the next session.
