# HANDOFF: start here

_Last updated: 2026-10-15 by the planning session (Opus 5.5). Whoever stops next updates this block,
"Where things stand", and anything below that changed._

## For Stewart: how to start the next session

Start it whenever you like (after your weekly limit resets if you are near it).

**Option A, Claude desktop app (Code tab):**
1. Start a new session in the folder `C:\Users\stewa\Documents\Claude\Golden Record`.
2. Model: **Opus 5.5**. Effort: **xhigh** (why: see "Effort" below).
3. Permission mode: **Auto**, so it can work through the plan without stopping to ask about each
   command.
4. Paste the prompt below as the first message, then let it run.

**Option B, Windows Terminal (PowerShell):**

```powershell
cd "C:\Users\stewa\Documents\Claude\Golden Record"; claude --model claude-opus-5-5 --effort xhigh --permission-mode auto
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

- 2026-10-15: plan approved (`PLAN.md`). Research done and written up (`docs/research/`, start with its
  README). Project rules, decisions log, helper agents, critic guard and settings in place. Private repo
  `https://github.com/Samizdat-Publications/the-finder`, branch `main`.
- **M1 (ground truth) has not started.** No code, no `package.json`, no downloads yet. Checklist:
  `docs/plans/M1.md`. Nothing is running.

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

## End-of-session protocol

1. Finish or safely stop the current step; `npm run check` green or the failure written down.
2. Run `qa-auditor` on the claims you are about to make (skip only on a "checkpoint" stop).
3. Update `PROGRESS.md` (current milestone, done, in flight, known issues, exact next steps) and this
   file (the "Last updated" line, "Where things stand", new gotchas).
4. Commit with explicit paths, push.
5. End with short bullets for Stewart: what shipped, links, what needs him, and the exact prompt and
   effort for the next session.
