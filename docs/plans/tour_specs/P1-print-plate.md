# P1: the printable relief plate of the cover (asset-smith)

PLAN.md M8 bonus, pulled forward: Stewart will 3D print the cover, paint it gold, and hold it up while he and
his son play the guided tour. Build STL files of the Voyager record cover as a raised relief, from the exact
rebuilt drawing, sized for common printers.

## Input

`public/media/cover/cover.svg`: millimetres, viewBox 0 0 304.8 304.8, origin top left, every drawing element
a stroked path, line, circle or polyline with its own `stroke-width` (or `.dot` filled circles). Read it with a
real XML parser; handle every element type and transform present (check: `grep -o "<[a-z]*" | sort | uniq -c`).
Skip the outer edge circle as relief (it becomes the plate's rim instead, see below).

## Output (new folder `print/`, committed; every file under 20 MB)

- `print/voyager-cover-200mm.stl`: plate 200 mm across (fits most printers: Ender 3, Prusa MK4, Bambu A1/P1/X1).
- `print/voyager-cover-250mm.stl`: 250 mm (Bambu X1/P1 256 bed, Prusa XL, larger beds).
- `print/voyager-cover-full-305mm.stl`: true size, 304.8 mm (12 inches), for big printers.
- `print/voyager-cover-200mm-preview.png` (and one for full size if cheap): a rendered top view (raking light) to
  check the result; and `print/README.md` (plain English, for Stewart, who is not a programmer): what each file
  is, printer bed needed, suggested settings (0.2 mm layers, or 0.12 mm for the fine marks; 0.4 mm nozzle; no
  supports; print flat, relief up), painting tips (prime, gold spray or metallic gold acrylic, then dry-brush
  or wipe a dark wash into the grooves so the lines pop: or paint gold and lightly sand the raised lines), and
  the source credit (NASA/JPL 1977 photo GPN-2000-001978, public domain, as rebuilt by this project). No em
  dashes.
- The generator script `tools/print/build_plate.py` (rerunnable; any venv under `tools/print/.venv`, gitignored:
  check `.gitignore` and add the line if needed).

## Geometry

- Base: a solid disc, 3.0 mm thick at every size, with a raised rim ring at the edge (1.2 mm wide, same height
  as the relief) so the edge reads like the cover's.
- Relief: every stroke turned into its outline polygon at its own stroke width times the scale factor, but never
  thinner than 0.6 mm at print size (thicken thin lines to 0.6 mm; at 200 mm scale most binary ticks will hit
  this floor; that is fine), unioned, and extruded 0.8 mm up from the base top. Dots stay dots (minimum
  diameter 0.8 mm). Ticks that touch must merge cleanly (union), no internal faces.
- Orientation as the SVG (as in NASA's photo), relief on +Z, base at Z=0, centred at the origin, millimetres.
- The mesh must be watertight and manifold (check with trimesh `is_watertight`, `is_volume`, and report
  triangle counts and file sizes). Binary STL.
- Suggested tools: Python 3.12 venv via `uv venv --python 3.12 tools/print/.venv` with shapely (buffer with
  cap_style flat for butt caps, join_style round), manifold3d or trimesh (extrusion and boolean union), numpy.
  Run Python as `python -P` per HANDOFF. No downloads other than PyPI packages into that venv; never run
  downloaded code beyond the installed packages.

## Check

- Render the preview PNG and look at it: every drawing on the cover present (the record and stylus top left,
  the picture diagrams top right, the pulsar map bottom left, the hydrogen atom bottom right), binary ticks
  visible as separate marks, nothing missing or blobbed.
- Report: files, sizes, triangle counts, watertight results, the minimum feature sizes at each scale, any
  element type skipped, and the preview image paths. Do not commit; the lead commits.
