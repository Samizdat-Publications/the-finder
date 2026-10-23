# The planets table against a 1970s reference (M7 step 8)

_Written 2026-10-22 by build session 5 from a scout's report. Read before changing `teaching.planets` or its notes._

**Question.** The record's table of planets (teaching frames, `teaching-frames.md`) differs from today's NASA fact
sheets beyond its written precision in 8 cells (`src/science/teaching.test.ts`, `teaching.planets`). A second-opinion
review (Gemini 4 Argon, `docs/consults/2026-10-22-argon-answer.md` item 4) suggested they are simply the accepted
values of the early 1970s. Is there a citable 1970s table?

**Source found.** C. W. Allen, *Astrophysical Quantities*, 3rd edition (Athlone Press, London, 1973; reprinted with
corrections 1976), section 65 "Planetary orbits and physical elements", pp. 140 to 142. Read from the OCR text of
the open scan at https://archive.org/details/AllenAstrophysicalQuantities (the OCR scrambles columns; the page
images have NOT yet been checked by us, so treat every value below as UNVERIFIED until they are). Allen's own
footnotes cite the Explanatory Supplement (1961), the BAA Handbook and the Connaissance des temps 1970.

**Per cell (written value; Allen 1973; verdict):**

| Cell | Written | Today | Allen 1973 | Verdict |
|---|---|---|---|---|
| Mercury diameter | 4840 km | 4879 | 2 x 2425 = 4850 | close (0.2%), not exact |
| Mercury mass | 1/19 e | 0.0553 | 0.054 with satellites (1/18.5) | plausible rounding |
| Mercury day | 57 d | 58.65 | 59 d (the 1965 radar value) | not explained |
| Venus diameter | 12,400 km | 12,104 | 2 x 6070 = 12,140 | contradicted |
| Venus mass | 82/100 e | 0.815 | 0.815 | matches (rounds to 0.82) |
| Jupiter diameter | 142 x 10^3 km | 142,984 | 2 x 71,300 = 142,600 | truncation of 142.6, not rounding |
| Saturn distance | 1428 x 10^6 km | 1432.0 | 9.53884 AU = 1427.0 | off by one in the last digit |
| Saturn day | 43/100 d | 0.444 | 10 h 14 m equatorial = 0.426 d | matches (rounds to 0.43) |

**What this settles.** Two cells (Venus's mass and Saturn's day) are the values of the time. Saturn's is the clearest:
the 10 h 14 m equatorial period of the pre-Voyager era, against today's 10.66 h from Voyager's and Cassini's radio
measurements. Four more are within a last digit or a rounding of Allen's numbers. Mercury's 57 days and Venus's
12,400 km are not explained by Allen; their cause stays UNVERIFIED (a Venus radius of 6200 km would give 12,400;
no 1970s source for it was found). No source was found that names where the table's numbers came from: *Murmurs of
Earth* (1978) could not be read (borrow-locked on archive.org); a search snippet credits the solar-system frames
to Frank Drake, unverified.

**Next if certainty is wanted:** check Allen's page images (pp. 140 to 142), borrow *Murmurs of Earth* for the frames'
picture-list entry, and look at a 1970s CRC Handbook or the Astronomical Ephemeris physical tables.
