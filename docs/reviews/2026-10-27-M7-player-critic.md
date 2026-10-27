# Blind player critic on the polished tour (M7 gate, 2026-10-27)

The `player-critic` agent, blind, on 109 stills of the whole guided tour filmed after the M7 changes
(`review/inbox/2026-10-27T17-50-08-tour-film`, every do step pressed "Do it for me"). Stills only: sound, motion and
performance not judged.

**Scores (2026-10-22 V1 review in brackets):** first impression 6 (4), sense of wonder 7 (6), alien interface 7 (6),
space scenes 6 (5), clues legible 7 (5), clarity of next step 6 (5), satisfaction 8 (n/a), decoded pictures and record
8 (8), typography and layout 6 (5), would keep playing 7 (6). Every score is now 6 or better; M7's target of 7 for
first impression and layout is not met (both 6).

**Working, don't touch (its list):** the guide's structure (part dots, what we're looking at, what we just learned,
the real story, talk about it); our units in brackets and the glyph headers; Arrival's labelled 3D close-ups; the
live decoding (the circle, the album, the mixer); Pluto's mistake; the four clocks; the honesty notes; the gold
record and the hand-etched line.

**Its problems and the lead's decisions**

1. Instrument panels overloaded, "more below" pills. Partly addressed in M7 step 3 (the tour dims everything but the
   step's control); the panels themselves are the instruments. Carried: a hero-control pass per instrument is the
   largest remaining layout lever, worth doing after Stewart's playtest says which screens lose his son.
2. The ending turns into reading, the top of the stage empty. Partly addressed (the turning record fills the first
   finale screen); the other five Our Frame sections are carried for a full-stage treatment.
3. Portrait's "They live there" sky strip is the emotional climax but reads as a footnote. Carried (a staged moment
   with the sky large, as for the other big discoveries).
4. Legibility inside the charts: the Galactic centre label cut off at the chart's edge on the far view. **Fixed:** a
   kept label too long for either side of its point now slides above or below it inside the chart
   (`src/world/labelLayout.ts`, tested). Faint grid text and small pulsar labels: carried.
5. Working shown in several units at once. The tour already leads with the human value (M7 step 4); carried.
6. The guide opens with a sentence cut off at the top after a step is confirmed. **Fixed:** it scrolls so "What we
   just learned" starts at the panel's edge (`src/tour/Guide.tsx`).
7. One visual identity for all 65 steps. Carried as taste for Stewart.
