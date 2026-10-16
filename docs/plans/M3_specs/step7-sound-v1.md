# M3 step 7 spec: sound v1 (the instruments' voice)

Subagent: `builder`. Written by the lead in build session 2 (2026-10-16).

---

Project: The Finder, `C:\Users\stewa\Documents\Claude\Golden Record` (git, main; work in place; do NOT commit; do NOT deploy). Read `CLAUDE.md` (rules 5, 6, 12, 13), `PLAN.md` "Look, feel and sound" (instrument hums and resonant interface plucks synthesized live in Web Audio, the stylus touching down, the first crackle, a harmonic swell when the circle resolves; the record's own audio stays clean and real), `src/game/state.ts`, `bus.ts`, `settings.ts` (master volume, sound captions), `src/record/engine.ts` and `sounds.ts` (the turntable's own stylus and crackle; do not duplicate them), `src/science/random.ts`, `src/ui/` (shell). Other helpers are building The Player (`src/chapters/player/`) and The Pictures (`src/chapters/pictures/`); do not edit chapter folders.

This is M3 step 7: the alien interface gets a voice, quietly, synthesized live, never covering the record's real audio.

## Files you own
`src/audio/` (`mixer.ts`: one AudioContext shared with the turntable if it exposes one, else a small accessor both can use: read `src/record/engine.ts` and propose the smallest change; `ui.ts`: the interface sounds; `ambience.ts`: per-chapter instrument hums; `cues.ts`: the event-to-sound mapping driven by game state; tests), `src/ui/Captions.tsx` and its CSS (sound captions), and one import line in `src/play/main.tsx` to start the sound layer.

## The sounds (all synthesized in Web Audio; seeded randomness only)
- **Interface:** a soft resonant pluck on a confirmed deduction (pitch tied to the chapter), a dull, low two-note cadence on a rejected answer (gentle, never a buzzer), a tick on hover and focus of instrument controls (very quiet, rate-limited), a breath-like swell when the codex opens.
- **Instrument hums (ambience):** each chapter a low, slowly beating drone in its own key (Arrival cold and sparse; The Key a faint resonant ring; The Player a warm mechanical bed; The Pictures a scanning shimmer), crossfading when chapters change, ducked by 12 dB whenever the record is playing (the turntable engine's position events or a playing flag).
- **The moments:** when `pictures.circle` confirms, a harmonic swell (stacked partials rising into a chord over about 3 s); when `player.firstSound` confirms, a brief hush (ambience dips) so the first sound off the disc stands alone.
- Levels: everything well under the record (state the targets in dBFS), master volume from settings, a global mute, reduced-motion does not affect sound, sound captions (when on) show a short text line for each cue ("a soft pluck", "the instruments hush") in a caption strip.
- Autoplay: nothing starts before the first user gesture; resume the context on it.
- Every cue is driven by game state through one subscription (`cues.ts`), so bots trigger them by the same commands (rule 5).

## Tests and looking
- Node tests for `cues.ts` (which state changes map to which cue, rate limits, ducking logic) with a fake audio graph.
- A browser test (`tests/browser/sound.browser.mjs`): render each cue in an `OfflineAudioContext` and check it is finite, non-silent, peaks below the stated level, and is deterministic for a seed; with a live context muted, drive the game through `window.__finder` (confirm a node, open the codex, switch chapters) and check the cue log and captions; no console errors.
- Record a short WAV of each cue into `build/sound/` and describe what each sounds like in the report (spectral centroid, duration, peak); the lead will listen.

## Done when
`npm run check` passes (or fails only on another helper's in-flight files, named). Report: files, the cue list with levels and durations, the WAV paths, any change you needed outside your files.

## Rules
No em dash anywhere. Never read .env. No paid generation in this step (ElevenLabs textures are a later option). Do not commit, do not deploy.
