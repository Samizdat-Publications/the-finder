# Making of: the public face (2026-10-17)

The landing page (https://the-finder.pages.dev, source in `site/`) and the README media were made by
script, not by hand play.

- **Film:** `node tools/showcase/film.mjs` serves the production build (`dist/`), opens `/play/?tour=1` on a
  fresh save at 1366 x 768 (rendered at 1.5x) and walks all 58 stops of the guided tour with the guide's
  own buttons. On the stops it is told to film, a DevTools screencast records from the guide's explanation
  to a few seconds after the result; ffmpeg turns the timestamped frames into 30 fps H.264 at 1280 x 720.
  The whole tour took about 6.5 minutes with no console errors.
- **Cut:** hero = the first pictures developing from the tape; Arrival, The Key, The Pictures (the circle
  comes out round, then Earth in colour), The Spot, The Map (two stops joined), The Trail. Posters at 80%
  of each clip; the README GIF is the hero cropped to the instrument, 640 px, 10 fps, 3 MB.
- **Review:** one contact sheet per clip and the Gemini critic (`tools/critic_gemini/critic.py`, about
  $0.08) on the six clips joined: legible, no stutter; its game notes (the tour explains a lot, "Do it for
  me") are the tour's purpose (D-A33).
- **Build and deploy:** `node tools/showcase/build-site.mjs --deploy` copies `site/` to `site-dist/`, runs
  the showcase kit's `finish-site.mjs` (headers, byte ranges for the clips through `functions/media/`, so
  Safari can play and seek them) and deploys the Pages project `the-finder`. The game stays on its Worker.
- **Social preview image (og.jpg, 2026-10-22):** a fresh capture of the current build (the Portrait plate after the clocks are confirmed, 1440 x 900, from `tests/browser/portrait.browser.mjs`), cropped to the plate and composed with the title "The Finder" in the page's own font stack on the plate's dark ground in headless Chrome, 1200 x 630 JPEG (about 99 KB); the same file is `public/og.jpg` and `site/media/og.jpg`.
