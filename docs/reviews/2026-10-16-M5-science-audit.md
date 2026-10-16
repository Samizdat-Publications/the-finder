# M5 science audit (2026-10-16)

Reviewer: the `science-auditor` agent, adversarial, read-only. Scope: commits 84a17de to 6893bd3 (the
decoders' 536-line raster, the identification's age window, The Pictures complete, The Voices). It ran the
Python reference checks (decoder and voices), the M5 tests (33 of 33 pass) and four scratch audits (kept in
`review/archive/science/m5audit/`, gitignored), fetched Barry's `voyager.cpp` and NASA's Planetary Fact
Sheet, and looked at L002, L003, L004, L005, L012 and L039 itself.

**Sound:** the raster-end rule and the whole L004 and L005; decoder parity with the reference; the
identification's maths (the clock's pivot, the exact timing-noise widening, the 500-seed result and row
5's anchor statement); the teaching readings; Barry's orientation semantics; the pitch statistics (the
spread F-test, the BIC result, the piano's 12-step comb); Python and TypeScript agreement; no clean image
in the game.

## The lead's own independent truth for the whale song

Read by the lead from spectrograms of the Ozma UN-greetings track (03), rendered from the lossless
transfer (`docs/research/figures/ozma03-whale-spectrogram.png`, `ozma03-whale-onset.png`): speech (dense
harmonic stacks, formant bands) runs to about 188 s; gliding tonal calls (whale song, mostly 400 to 2,500 Hz,
with low pulses under 200 Hz) are faintly present under the last speakers from about 182 s and alone from
about 189 s to about 236 s; low moans then fade to digital silence at about 239.5 s.

## Findings and the lead's decisions

| # | Severity | Finding | Decision |
|---|---|---|---|
| 1 | Checker misjudges | `voices.others` refuses any track but 03 with "every voice on this track is one of theirs", false for the Sounds of Earth (birds, frogs, hyena, elephant, whale, chimpanzee, dogs) | Fix (6a): judge every track by measurement (a stretch with held calls and no measured speech is "not theirs"); for the Sounds of Earth, the lead reads spectrograms to give the test independent truth |
| 2 | Checker misjudges | `voices.others` demands containment inside the code's own call intervals and calls the edges "speech" when they are not; its test truth is its own output | Fix (6a): accept any span with at least one held call and no measured speech (from voicing and pitch); the test's truth is the lead's reading above |
| 3 | Wrong science | The repetition curve does not single out 2:1 (9:8 0.497 > 2:1 0.426 > 4:3 > 3:2), so refusing 3:2 with "the pattern does not repeat there" is false | Fix (6a): an octave-equivalence test that discriminates (fold the note pitches modulo a trial period and measure the concentration, bootstrapped against 3:2 and the other candidates); the message computed from it; state the margin honestly (1406 cents nearly ties) |
| 4 | Checker and claim | `voices.many`'s "reasonable" settings differ between the reference and the checker; silence gives about 55 at some settings, so "cannot give 55" and D-A32's "wholly above 55" are false | Fix (6a): one definition of reasonable settings in both, the count range over it computed and shown; the message says plainly that some settings give about 55 and the count depends on where a pause ends a voice; D-A32 amended |
| 5 | Checker decides from the key | `pictures.colour` accepts by the frame list, not the measurement; six non-triples pass the relative likeness test; the solar spectrum's triple has a weaker likeness than seven non-triples | Fix (6b): an absolute likeness threshold from the measured gap (non-triples at most 0.236, triples at least 0.588 but the solar spectrum); the solar spectrum accepted as the record's frame list says, with the measurement's failure stated |
| 6 | Tuned tolerance | The planets' 5% tolerance is set by Mercury's mass written 1/19, a mis-rounding (4.8% against a written precision of 2.6%) | Fix (6b): each cell against its own written precision; Mercury's mass a stated discrepancy |
| 7 | Overclaim | Hearing: "a voice is made to be heard: they hear at least that high" goes beyond the research, and the 16.6 to 17.5 kHz band is sampling error only (definitions move it 15.0 to 17.0 kHz) | Fix (6a): "they make sounds above their recording's hiss up to about 17 kHz (by the 3 dB rule)" with the definitional spread; gloss and hints reworded (no hearing claim) |
| 8 | Coverage band | The octave interval's coverage is 98.5% and its test band (90 to 100%) cannot fail high | Fix (6a): a two-sided band, or the interval called about 98% |
| 9 | Silent change | The 536-line decode moved the M3 picture checks (interlace 0.58 to 0.73, sync wobble 7.98 to 8.92, polarity margins and a post-raster column in the mount ring) | Fix (6b): measure over each frame's own raster (the first 512 lines for those checks), refresh the expected values; D-A30's "the M1 numbers stand" corrected |
| 10 | Untested model | The identification is tested only under its own timing-noise model; the clock's half-life systematic is left out of the tail | Fix (6b): a misspecified run (for example two-state timing noise, as `dating.epoch.misspecified` does) with its result recorded; the systematic stated (tail about 2.4e-6, harmless) |
| 11 | Self-agreement | The whale and colour tests use the code's own output as truth | Fixed by 1, 2 and 5 |
| 12 | Missing records | `pictures.numerals` has no recorded check; `pictures.slip` is folded into `pictures.home` | Fix (6b): a record each, listed in row 14 |
| 13 to 21 | Wording | The colour order "every other reader uses" (amazing-rando reads B, G, R); "groups" of voices and "separate voices"; "sound alike to them"; "people stand" for Jupiter; 1199.9 vs 1199.30 cents and "fill" in row 16; row 14's stale UNVERIFIED for the planets; D-A19 and a check note's stale numbers; row 5's "only beyond 1e-6 tails" (direction, Doppler and braking index are hard cuts); `pictures.height` showing the same 1.17 for refused and true readings | Fix all (6a for The Voices, 6b for the rest) |

Specs: `docs/plans/M5_specs/step6a-voices-audit-fixes.md`, `step6b-pictures-audit-fixes.md`.
