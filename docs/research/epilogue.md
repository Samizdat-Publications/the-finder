# Our Frame: the facts the epilogue states

Researched 2026-10-16 by the `scout` agent for M6 (`docs/plans/M6.md`, "Our Frame"); NASA pages read on
that date. Everything the epilogue says comes from here, from `data/ephemeris.json` (JPL Horizons) or from
the science core, and says so on screen.

## 1. The instruments still running

As of NASA's instruments page (last updated 2026-04-17) and the Voyager blog of 2026-08-04:

- **Voyager 1 runs two:** the magnetometer (MAG) and the plasma wave subsystem (PWS). Turned off: the
  cosmic ray subsystem (CRS) 2025-02-25, power; the low-energy charged particle instrument (LECP)
  2026-04-17, power (a 0.5 W scan motor left on so a restart stays possible); plasma science (PLS)
  2007-02-01, degraded; the cameras 1990-02-14, power; IRIS 1998-06-03, power; the photopolarimeter (PPS)
  1980-01-29, degraded; planetary radio astronomy (PRA) 2008-01-15, power; the ultraviolet spectrometer
  (UVS) 2016-04-19, power.
- **Voyager 2 runs three:** CRS, MAG and PWS. Turned off: LECP 2025-03-24; PLS 2024-09-26; the cameras
  1989-10-10 and 1989-12-05; IRIS 2007-02-01; PPS 1991-04-03, degraded; PRA 2008-02-21; UVS 1998-11-12
  (power unless marked).
- **Why:** each craft loses about 4 W a year (NASA), partly as its plutonium decays and partly as the
  generators' thermocouples age (M6 science audit, finding 5; no number for the split). A power rearrangement nicknamed
  "Big Bang" worked on Voyager 2 (2026-08-04): without it another instrument would have gone off before
  the end of 2026; with it the three run "at least an extra year". The same change on Voyager 1 is due "in
  the coming months". No 2027 shutdown is announced (whether the instruments page has been updated since
  August is UNVERIFIED).
- **Sources:** https://science.nasa.gov/mission/voyager/instruments/ ;
  https://science.nasa.gov/blogs/voyager/2026/08/04/nasa-engineers-help-prolong-voyager-2s-science-mission/ ;
  https://www.jpl.nasa.gov/news/nasa-shuts-off-instrument-on-voyager-1-to-keep-spacecraft-operating/
- **Game wording:** "As of NASA's status of 4 August 2026, Voyager 1 still runs two of its ten instruments
  and Voyager 2 three. Their power falls by about 4 watts a year."

## 2. The inscription in the run-out groove

- NASA's making-of page (updated 2025-04-07): the records "also had the inscription 'To the makers of music
  – all worlds, all times' hand-etched on its surface". JPL's "Slice of History" (2015-10-29) places it
  "in between the photoengraved label and the record grooves" and says Timothy Ferris wanted something done
  directly by a human hand; the line also appears on some 14-inch masters in the JPL Archives.
- NASA and JPL write it with a spaced en dash and no full stop; the game writes a spaced hyphen (the
  project's no-dash rule) and says so nowhere it matters.
- UNVERIFIED: which side, or both; the exact date; Ferris's own account (late one night in a New York
  studio, after the master was cut) comes only from a search summary.
- **Sources:** https://science.nasa.gov/mission/voyager/making-of-the-golden-record/ ;
  https://jpl.nasa.gov/blog/2015/10/voyager-golden-record-inscription-1977
- **Game wording:** 'Etched by hand between the label and the grooves: "To the makers of music - all
  worlds, all times". Timothy Ferris asked for one line made by a human hand.'

## 3. One light-day

- NASA's "Where are Voyager 1 and 2 now" (updated 2026-10-15): Voyager 1 is one light-day from **Earth**
  on Wednesday 2026-11-18 at 2:16:07 a.m. PST, that is **10:16:07 UTC** (16.094 billion miles, 25.902
  billion km).
- Ours (`epilogue.lightDay`): **10:16:17.5 UTC** (shown rounded, 10:16:18), the geometric distance from
  Earth's centre in the JPL Horizons tables, about 10 s after NASA's (within the check's tolerance; NASA's
  exact method is not stated). The research's geometric crossing, about 10:15:51 UTC
  (`docs/research/voyager.md` 4), is the same crossing from Earth's centre, to the minute. From the Sun the
  light-day comes later: 2027-02-03 21:39 UTC on the same tables (M6 science audit, 2026-10-22).
- A radio message's one-way time is within about 5 s of the geometric light-day at the crossing (up-leg
  4.86 s more, down-leg 4.86 s less), so after it the time is "a full day or more (to within seconds)".
- **Source:** https://science.nasa.gov/mission/voyager/where-are-voyager-1-and-voyager-2-now/
- **Game wording:** "18 November 2026, about 10:16 UTC: Voyager 1 is one light-day from Earth (NASA:
  10:16:07; the shipped JPL tables: 10:16:18)."

## 4. The real Gliese 445 pass

- Bailer-Jones and Farnocchia 2019, RNAAS 3, 59 (Gaia DR2; https://arxiv.org/abs/1912.03503): Gliese 445
  (AC+79 3888) at 44.0 (5 to 95%: 44.0 to 44.1) thousand years, 0.575 (0.574 to 0.576) pc (1.88 ly),
  116.0 km/s. Table 1's times are "from now", the paper's own epoch (RNAAS, 3 April 2019): about 2019, not
  launch, so 44.0 kyr from 2019 is about 44,040 years after launch.
- NASA's popular wording: "Voyager 1 will actually get within 1.7 light years of AC +79 3888 (aka Gliese
  445) in 40,000 years", NASA image article "It's Reaching for the Stars", 2013-09-11,
  https://www.nasa.gov/image-article/reaching-stars (read 2026-10-22). The earlier note sourced a
  "1.6 to 1.7 light-years" wording to the where-now page, which has no Gliese 445 content (M6 science
  audit, finding 6); 1.6 light-years appears on Wikipedia and in secondary sources, not on a NASA page found,
  so the game gives NASA's 1.7 only. (A "1.7 light-years in AD 40,272" FAQ wording is attributed to NASA by secondary sources only; not found on a NASA page in a search on 2026-10-22, so not used.)
- Ours, from Gaia DR3 (`epoch.discovery`): 0.573 pc at 44,100 years after launch (44,059 years after 2019),
  1 sigma 0.0008 pc and 57 years from DR3's own errors (`epilogue.gliese445`).
- **Game wording:** "NASA says about 1.7 light-years in about 40,000 years. A Gaia-based study
  (Bailer-Jones and Farnocchia 2019) gives 1.9 light-years at about 44,000 years from about 2019. This
  game, from Gaia DR3: 0.573 pc (1.9 light-years) at 44,100 years from launch."

## 5. The map is older than the machine

- Sagan, Sagan and Drake 1972, Science 175, 881, Table 1: the periods are of the "1970/1971 epoch"; the
  Voyager cover reuses the Pioneer periods unchanged (`docs/research/clocks.md`, `cover.md`). Our own
  recomputed epochs per pulsar run from 1966.6 to 1971.8, mean 1969.7 (`clocks.md`, `epilogue.mapOlder`);
  launch was 1977-09-05, so the periods are on average about 8 years older than the launch. The map clock
  Portrait combines (its kept pulsars, weighted) runs about 9 (8 to 10 over 200 seeds) years longer than the
  time since launch (`portrait.coverage`); beside a combined sigma of about 68 years this cannot be seen.
- **Game wording:** "The map's periods were published as the 1970/1971 epoch; the periods themselves date
  from 1966.6 to 1971.8, on average about eight years before launch" (numbers computed on the page).
