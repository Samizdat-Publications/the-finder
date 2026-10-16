# M4 step 7 spec: sound for the new moments, the game bots, captures for the critic

Subagent: `builder-opus`. Written by the lead in build session 2 (2026-10-16).

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit; do NOT deploy). Read `CLAUDE.md` (rules 5, 6, 7 and 13 above all), `docs/plans/M4.md` (step 7), `docs/plans/M3_specs/step7-sound.md` and `step8-bots-film-critics.md` (how sound and the slice bots were built), `src/audio/` (cues.ts, synth.ts, ambience.ts, sink.ts, start.tsx; the captions now sit in the top bar on wide screens, `src/ui/captions.css`), `tests/browser/slice.browser.mjs` (the slice bots: `playSlice`, screenshots, manifest, shots.txt), and the three M4 chapters with their browser tests (`src/chapters/map|spot|trail/`, `tests/browser/map|spot|trail.browser.mjs`; the Trail's exports `playTrail` and `seedSave`). The galaxy and neighbourhood charts are in `src/world/`.

## Files you own
`src/audio/*` (extend; keep the cue system's shape), `tests/browser/game.browser.mjs` (new), small exports added to `tests/browser/map.browser.mjs` and `spot.browser.mjs` so the game bot can reuse their play paths (export, do not change what their tests assert), `docs/HOW_ITS_CHECKED.md` (new check ids only), `tools/harness/README.md` (create it: one paragraph per harness tool, including `film-slice.mjs` and `capture-layout.mjs`).

## 1. Sound for the new moments (synthesized, like M3's; no paid calls)
- **Each new chapter its own key and bed.** `synth.ts` CHAPTER_VOICE gives The Map the same key as The Pictures and all three the hub's bed. Give The Map, The Spot and The Trail distinct roots and plucks (keep the existing chapters' values) and a bed each that fits the instrument: The Map a slow, wide, faintly pulsing drone (a sky of clocks); The Spot a close, dry, quiet room (the clicks are the music); The Trail a low moving tone that settles. Quiet, under the ducking rules that exist.
- **The ages snap together** (The Trail's reframe, the first time the frame becomes the origin star's and the old lines agree): a new cue, the scattered tones of the old lines (one short tone per line, pitched from its age's offset) drawing into one chord over about two seconds. Caption: "scattered tones settle into one chord". Fired from game state (the reframe view's frame is instrument state; expose what the cue needs through a signal the chapter already owns or a tiny new one in the chapter's `state.ts`, read by `cues.ts`; the cue must fire for a bot that does the same thing through the same controls).
- **The Sun found** (`trail.origin` confirmed): a warm, low, sustained tone under the usual cadence. Caption: "a warm low tone, held".
- **The neighbour twist** (`trail.neighbour` confirmed): the hush cue M3 uses for the first sound, then the warm tone again, softer.
- Respect the master volume, mute, captions on and off, and reduced motion exactly as M3's cues do. Unit tests in `cues.test.ts` for each new cue (fires once, on the right state change, with its caption, rate-limited).

## 2. The game bots (`tests/browser/game.browser.mjs`)
- **bot.game**: from a fresh save (storage cleared; no seeded saves: rule 5), the right answers through the real interface and `window.__finder` only, in an order the gating allows: the slice (`playSlice`), then The Map, The Spot and The Trail through their instruments (reuse the chapters' play paths). All 31 deductions confirm; the codex holds 31 entries; the ring shows every built chapter DONE with the finished glow; no console errors; the cue log holds the new cues once each, at the right moments. Record check `bot.game` with the measured time.
- **bot.m4Wrong**: in the three M4 chapters, every meaningful wrong result each checker distinguishes (the chapters' Node tests list them), once each, each rejected and shown on the instrument and in the notebook, then the right answer. Record check `bot.m4Wrong`.
- Screenshots at the key moments to `review/inbox/<timestamp>-m4/frames/` at 1440x900 with `manifest.json` (what each shows, plain words) and `shots.txt` (what the player did before each, in plain words, for the blind critic, no code words): at least the ring after The Key (three new chapters open), the map aligned, a line matched with its match quality, the ages across the sky before and after the axis, the region, the spot found on the sweep, a long count, the purity test, the warm-white star's trail, the run-back, the ruler's neighbour message, the region view with the star inside, the reframe in the alien's frame and in the star's, the codex near the end, the ring finished.
- Keep the whole run under about 6 minutes; if it is longer, say how long and where the time goes.

## 3. Looking
Look at every screenshot. Fix what is wrong, unreadable or ugly in your own files; list anything in other files for the lead with the frame that shows it.

## Done when
`npm run check` passes. Report: files, the cue log of the bot.game run (kind, chapter, node, caption), the run time, the capture folder and what each frame shows, anything you could not do.

## Rules
No em dash anywhere. Never read .env. Do not commit, do not deploy. No new dependencies. Files under about 400 lines.
