# Printable relief plate of the Voyager record cover

A 3D-printable copy of the aluminium cover that rides on the Voyager Golden Record: the record and stylus,
the picture diagrams, the pulsar map and the hydrogen atom, all as raised lines on a flat gold-ready disc.
Hold it up while you play The Finder's guided tour.

## Which file to print

| File | Across | Bed needed (square, at least) | Good for |
|---|---|---|---|
| `voyager-cover-200mm.stl` | 200 mm (7.9 in) | 210 mm | Ender 3, Prusa MK4, Bambu A1, P1 and X1 |
| `voyager-cover-250mm.stl` | 250 mm (9.8 in) | 256 mm | Bambu X1/P1 (256 bed), Prusa XL, other large beds |
| `voyager-cover-full-305mm.stl` | 304.8 mm (12 in) | 310 mm | True size, big printers only |

The `*-preview.png` pictures are a lit top view of each plate so you can see what to expect.

## Shape

Solid disc 3.0 mm thick, a 1.2 mm raised rim at the edge, and every drawing line raised 0.8 mm above the
disc. Total height 3.8 mm. Lines are never thinner than 0.6 mm at print size, so at the 200 mm size the
tiny binary ticks are fatter than on the real cover and a few neighbouring ticks touch.

## Suggested print settings

- Lay it flat, relief facing up. No supports, no brim needed (a brim helps on a thin-bed printer).
- 0.4 mm nozzle. 0.2 mm layers works; use 0.12 mm if you want the fine marks sharper.
- PLA is fine. Two or three wall loops, 15 to 20 percent infill.
- The relief is 0.8 mm, which is four layers at 0.2 mm or about seven at 0.12 mm.

## Painting tips

1. Prime (grey or black spray primer).
2. Gold spray paint or metallic gold acrylic over the whole plate.
3. Wipe a dark wash (thinned black or brown acrylic) over it and dab it off the raised lines with a paper
   towel, so it stays around the lines and the drawing pops. (Or the other way round: paint the plate dark,
   then dry-brush gold lightly across it so the raised lines catch the gold.)

## Source and credit

The artwork is the cover drawing rebuilt by this project from NASA/JPL photo GPN-2000-001978 (1977, public
domain), stored as `public/media/cover/cover.svg`. The plate is produced by `tools/print/build_plate.py`
(needs the Python 3.12 environment in `tools/print/.venv`; see the top of that script). Rerunning it
rebuilds every file here.
