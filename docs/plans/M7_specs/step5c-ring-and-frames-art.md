# M7 step 5c: the hub ring as an alien instrument, instrument frames, ring labels on phones

**Why:** Free play should feel like an alien instrument (PLAN "Look, feel and sound"; M7 step 5). Today the hub ring
is a clean green circle with nine boxes, and every instrument panel is a plain rounded rectangle. Both critics like
the colours and the type: keep the palette (`src/ui/theme.css` tokens), the fonts and every word. This is CSS and
SVG decoration plus one size fix; no behaviour changes.

**Files you own:** `src/ui/Hub.tsx`, `src/ui/shell.css` (the `.hub`, `.ring*`, `.chap`, `.core` rules), `src/ui/theme.css`
(only to add new tokens, never to change existing values), and the shared panel frame rule (find the class every
instrument panel uses, probably in `src/ui/shell.css` or a workbench CSS file such as `src/ui/Workbench.tsx`'s stylesheet;
change only that shared rule, not per-chapter CSS). Nothing in `src/chapters/`, `src/tour/` or `src/world/`.

**Do:**
1. **The ring as a dial.** Inside the existing `svg.ringlines` (viewBox -50..50): a ring of fine radial ticks just
   outside the track (120 ticks, every 10th longer and a little brighter), and a second sparse ring of ticks just
   inside the faint inner track (36 ticks). Colours from the tokens (`--line`, `--cyan` at low opacity). Optional:
   the outer tick ring turns very slowly (one turn in about 4 minutes, CSS `transform: rotate` on a `<g>` with
   `transform-origin: center`), stopped entirely when the reduced-motion setting is on (the app sets a class or
   attribute for it: find it, for example `data-reduced-motion` on the root or `@media (prefers-reduced-motion)`;
   honour both) and under `prefers-reduced-motion`. Ticks must never cross a chapter box or the centre text.
2. **Instrument frames.** Give the shared panel frame small corner brackets: thin L-shaped marks at the four
   corners in the accent colour at low opacity (pseudo-elements `::before` and `::after` with borders, or a
   background-image with linear gradients so all four corners come from one rule). The panel's border itself gets
   quieter so the corners read as the frame. It must not cover content, take clicks (`pointer-events: none`), or
   break panels that already use `::before` or `::after` (search for them first; if the shared class already uses
   both, use the background-image method). The chapter boxes on the ring get the same corner treatment.
3. **Ring labels on phones (M7 step 8 leftover):** at 390x844 the chapter names are about 11 px and the
   OPEN/DONE tags about 9 to 10 px. Raise them to at least 12 px for names and 11 px for tags at that width
   without boxes overlapping each other or the centre button (shrink the glyph row or the padding first; the
   ring may grow to the full width). Check at 390x844 and 360x740.
4. **Contrast:** `src/ui/contrast.test.ts` must still pass; nothing decorative may lower the contrast of text.

**Rules:** CLAUDE.md hard rules 7, 10 (stage and commit nothing), 13 (no em dashes, in comments too). Do not touch
any text content.

**Commands that must pass:** `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`; `npx vitest run src/ui`
(run it as `node node_modules/vitest/vitest.mjs run src/ui` if npx misbehaves); `node tools/harness/browser-tests.mjs a11y`;
`node tools/harness/browser-tests.mjs layout` if such a test exists (list `tests/browser/`). Screenshots: before you start,
`node tools/harness/free-look.mjs --chapters hub,key,spot,map --sizes 1440x900,390x844,360x740 --out review/archive/frames-before`
and `--open` (a fresh player's ring) at 1440x900; the same after into `review/archive/frames-after`. Look at them
yourself and check nothing overlaps.

**Report:** files changed, test results, the screenshot paths, the label sizes at 390x844 before and after, and
anything you were unsure about.
