# Blind player critic on the guided tour (2026-10-16)

Capture: `review/inbox/2026-10-16T20-38-23-tour/` (102 stills of the tour bot pressing "Do it for me" on a
fresh save, 58 stops). Scores: first impression 6, wonder 7, alien interface 6, space scenes 6, clues legible
7, clarity of what to do next 7, satisfaction 6, pictures and record 8, typography and layout 5, would keep
playing 7. One-liner: "the picture-album reveal is magic. I just wish it trusted me enough to stop explaining."

Liked: the ring, the circle and the album, the units with human numbers in brackets, "show working", the
amber serif "real story" boxes, the finale (live distance, the light-day, "Look up").

## Findings and what we did

1. **The guide explains too much, before the player has committed.** Declined for the tour: Stewart's brief
   (docs/STEWART_FEEDBACK.md, 2026-10-16) asks for exactly this, every stage made obvious with its why, for a
   parent walking a child through. "What we just learned" and "The real story" already appear only after the
   step is confirmed. Free play keeps the unexplained game.
2. **Guide text clipped at the top after the auto-scroll; the learned box flush to its border.** Fixed: the box
   is padded, the scroll leaves room above it, and the guide's top edge fades.
3. **Trail readout wrapped one word per line** (glossed values in a narrow column). Fixed: label above value.
4. **Instrument panels need inner scrolls at 1440x900** ("more below"). Known since M4 (PROGRESS, known
   issues); not changed tonight.
5. **It does not look alien enough; 6. the spacecraft is crowded by panels.** Carried to the M6/M7 polish.
7. **Sound button label ghosting on the hub; "LATER" chapters show the build is unfinished.** Ghosting not
   reproduced from the code (one label); the later chapters are M6.
