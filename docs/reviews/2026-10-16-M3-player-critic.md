# M3 slice: blind player-critic review (2026-10-16)

Reviewer: the `player-critic` agent (blind: 16 stills and a list of what the player did; no code, no plan).
Build: the M3 slice (Arrival, The Key, The Player, The Pictures), commit b47a9e3.

## Scores (1 to 10)

| Category | Score |
|---|---|
| First impression | 5 |
| Sense of wonder | 6 |
| Alien interface: strange yet readable | 6 |
| Spacecraft and space scenes | 6 |
| Clues on screen and legible | 5 |
| Clarity of what to do next | 6 |
| Satisfaction of figuring things out | 6 |
| The decoded pictures and the record | 8 |
| Typography and layout | 4 |
| Would keep playing | 7 |

Steam one-liner: "Clever, rigorous, and the moment a galaxy comes out of a buzz is unforgettable. The rest looks
like a physics dashboard in a dark theme. Recommended with reservations."

## Top problems (the critic's ranking) and what the lead decided

| # | Problem | Decision |
|---|---|---|
| 1 | The layout does not fit 1440x900: scenes, the microscope, decoder controls and thumbnails fall below the fold | Fix now (layout pass, M3 step 8b) |
| 2 | Panels scroll under the header and get sliced | Fix now (8b) |
| 3 | Clue text too small and too dim (the readouts are the evidence) | Fix now (8b): clue text bigger and brighter than decoration |
| 4 | The alien script is a skin: every glyph has an English caption; nothing asks you to read it | Design follow-up: give one chapter a real glyph puzzle (candidate: the alien's own numerals in The Key's tally, or the codex notation); logged for M4 to M6 |
| 5 | Arrival plays as a four-option quiz, not a deduction | Design follow-up: make the player gather evidence from the scans (select the measurements that support or refute) before choosing; logged for M6 hint and polish, sooner if Stewart agrees |
| 6 | Two unit systems and scientific notation side by side | Fix now (8b): only the alien unit unless the human gloss is on; friendlier powers of ten |
| 7 | The ring: LATER vs LOCKED unexplained; no flourish when chapters finish | Fix now (8b): a small legend and a lit ring for finished chapters |

## Working, don't touch (the critic's list)

The Pictures sequence (noise, circle, "They see.", galaxy, numbers); the scope trace; the raking-light lamp
on the cover; the ring hub; the codex with How it's checked links and the "THIS HOLDS." stamp; the probe
and its star field; the turntable and groove-microscope idea.
