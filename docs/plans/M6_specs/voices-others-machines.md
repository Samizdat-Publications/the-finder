# Spec: voices.others must not count machine tones as other creatures

**The lead's reading (2026-10-22)** of `review/archive/2026-10-16T18-14-57-sounds-spectrograms/` (Sounds of
Earth, ozma-04, panels by `tools/voices/panels.py`):
- 293.11 to 296.77 and 296.98 to 298.38 s: harmonic arcs at 300 to 1,500 Hz that glide up and down (animal
  calls in the animal section). Right to accept.
- 302.95 to 312.62 s: the same kind of gliding harmonic howls (about 300 to 1,000 Hz). Right to accept.
- 417.37 to 473.56 s: the "calls" are machines: at 429 and 432.5 s a dead-flat line at about 3.7 kHz inside
  rhythmic broadband hammering (the tools and machines section), and at 464 to 470 s keyed dashes of a flat
  1 kHz tone (Morse code; NASA's contents list for Sounds of Earth includes Morse code between the riveter
  and the ships). **Wrong to accept as other creatures.**
- 620.26 to 675.18 s: the calls at 664.6 to 665.8 s are a harmonic stack with a falling, wavering fundamental
  near 400 Hz (a horse's whinny is the likely source; horse and cart follows the ships in NASA's list). Right to
  accept.
Decision (lead): machine tones are the senders' own making, not other voices. A held call whose pitch is
machine-steady does not count.

**Change.**
1. `tools/voices/others.py`: for each held call, measure its pitch track's steadiness (for example the spread of
   the fundamental, in cents, after removing nothing: the standard deviation or the 10 to 90% range over the
   call's frames) and its vibrato. Classify a call as machine-steady when the spread is below a threshold; derive
   the threshold from the measured calls across all tracks the pass already analyses (the gap between the
   steady Morse and 3.7 kHz calls and every creature call, including the whale stretch on track 03 and the
   animals above), put it in the middle of the gap, and print the gap's two edges. If there is no clean gap,
   STOP and report the distributions instead of tuning.
2. A stretch is accepted only with at least one non-machine held call (and no speech, as now). Keep the data in
   `data/voices.json` `others` (add the per-call steadiness and the machine flag), rebuilt by the analysis
   script; byte-identical rebuilds as now.
3. `src/chapters/voices/checkers.ts` `checkOthers` and `data.ts`: a stretch whose only calls are machine-steady is
   refused with a message (quantity tokens as elsewhere) that says the calls held one pitch exactly, like a
   machine, so they are not another creature's voice. The tour (`src/tour/actions/voices.ts`) must still pick an
   accepted stretch.
4. Turn the `it.todo` in `src/chapters/voices/checkers.test.ts` (line about 118) into real cases from the lead's
   reading above (accept 293 to 298, 303 to 313, 620 to 675; refuse 417 to 474 as machines), and the PENDING line
   in `tools/voices/checks.py` into a check. Record the reading's provenance (this spec, the panels folder, NASA's
   contents list: https://science.nasa.gov/mission/voyager/golden-record-contents/sounds/ if that page lists
   them; otherwise cite the research note that does) in the test record text.
5. How it's checked row 16 text (edit the row source, not the generated file) and D-A32 amendment in
   `docs/DECISIONS.md` (tag AI, revert note).

**Rules.** CLAUDE.md hard rules; no em dashes; stage nothing, do not commit. Run Python as `python -P`. Other
helpers are working in src/chapters/pictures and new chapter files: touch only voices files, the data file, the
row source and DECISIONS.

**Must pass.** `npx tsc --noEmit`; `npx vitest run src/dsp src/chapters/voices src/game src/tour`;
`python -P tools/voices/checks.py` (report its new lines); `node tools/harness/browser-tests.mjs voices`.

**Report.** The steadiness numbers for every held call on ozma-04 and the whale stretch, the gap and threshold,
files changed, test tails.
