# M3 step 8 spec: the slice bots, a filmed run with sound, and the critic inputs

Subagent: `builder-opus`. Written by the lead in build session 2 (2026-10-16).

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit; do NOT deploy). Read `CLAUDE.md` (rules 5, 7, 8, 12), `PLAN.md` "How it's checked" item 11 (the bot) and "How the build runs", `docs/plans/M3.md` step 8, `HANDOFF.md` (the Gemini video critic note; gotchas), every browser test in `tests/browser/` (arrival, key, player, pictures, shell, sound: each already plays its chapter through `window.__finder`), `tools/harness/` (browser, serve, capture, browser-tests), `src/audio/mixer.ts` and `src/game/turntableService.ts` (two AudioContexts today), `.claude/agents/player-critic.md` (what the blind critic reads: `review/inbox/`), and, read only, `C:\Users\stewa\ClaudeProjects\Noclip\tools\critic_gemini\critic.py` (a Gemini critic that watches video and hears audio).

This is M3 step 8: prove the slice plays start to finish through the real interface, film it with its sound, and prepare what the critics need.

## Files you own
`tests/browser/slice.browser.mjs`, `tools/harness/film-slice.mjs`, `tools/critic_gemini/` (adapted copy, with a README), `docs/SPEND.md` (append rows only), the smallest change in `src/game/turntableService.ts` and `src/audio/mixer.ts` to share one AudioContext (the turntable uses `sharedContext()`), and a harness-only audio tap (`src/harness/audioTap.ts`, active only when the harness API is on).

## 1. The slice bot (`tests/browser/slice.browser.mjs`, id `bot.slice`)
- From a fresh save (cleared storage), through `window.__finder` only (rule 5: the same commands the interface sends; no state written directly), play Arrival, The Key, The Player and The Pictures with the right answers, in the order the gating allows, to `pictures.firstFrames`. Assert all 18 slice deductions confirmed, the codex has 18 entries, and no console errors.
- A wrong-answer pass in the same file (id `bot.wrongAnswers`): from a fresh save, every wrong choice each checker offers, once, each rejected with its result shown, then the right answer; count them in the record.
- Screenshots at the key moments into `review/inbox/<timestamp>-slice/` with `manifest.json` (what each shows, in plain words, for a reader who knows nothing about the code): the opening scene, each scan, the decay clock, the cover under raking light, the atlas, the turntable and the first sound, the free-running decoder, the round circle, a frame developing, the codex, the ring at the end. Keep the bot under about 4 minutes (use fast decode where the chapter allows it, record speed for one frame).

## 2. One AudioContext and a harness audio tap
- The turntable creates its own `AudioContext`; make it use `sharedContext()` from `src/audio/mixer.ts` (the smallest change; run the turntable, player, sound and instrument browser tests after).
- `src/harness/audioTap.ts`: when the harness API is on, connect the master output to a `MediaStreamAudioDestinationNode` and record it with `MediaRecorder` (Opus in WebM), started and stopped through `window.__finder` (add two harness-only functions, not bus commands).

## 3. The filmed run (`tools/harness/film-slice.mjs`)
- Run the same right-answer path as the bot in installed Chrome at 1440x900 with Playwright's `recordVideo`, the audio tap recording at the same time, with deliberate pauses where a player would look (a few seconds on the opening scene, the first sound, the circle resolving, a frame developing at record speed). Mux video and audio with ffmpeg into `review/inbox/<timestamp>-slice/slice.mp4` (H.264 and AAC, under 50 MB; this file is review material, never shipped), and note the audio offset you corrected.
- Watch nothing yourself beyond checking the file plays, has sound and is the right length; the lead and the critics review it.

## 4. The Gemini video critic (`tools/critic_gemini/`)
- Adapt Noclip's `critic.py` (copy, then edit; keep its licence and credit in the README): send `slice.mp4` and a prompt asking for a blind player's review (what is clear, what confuses, what is beautiful, what is boring, where the sound helps or hurts, the three changes that would most improve it), and save the answer as `review/inbox/<timestamp>-slice/gemini.md`.
- Key: `GEMINI_API_KEY` from the environment, else from `C:\Users\stewa\ClaudeProjects\Noclip\.env` loaded at run time; never print it, never copy it into this repo (rule 8). Use the model and upload method the Noclip script uses unless a scout says it is outdated.
- Spend: estimate the cost before calling (video length times the model's published rate), log one row in `docs/SPEND.md` (date, service, purpose, estimated cost); stop and report if the estimate is over $3.
- Run it once on the filmed slice.

## Done when
`npm run check` passes with the bot tests; `slice.mp4` plays with sound; `gemini.md` exists. Report: files, the bot's run time and deduction count, the wrong answers it played, the film's length, size and audio offset, the Gemini model and cost, and the path of the review folder. Do not summarise Gemini's review; the lead reads it.

## Rules
No em dash anywhere. Never read .env except to load the one key at run time, never print it. Do not commit, do not deploy.
