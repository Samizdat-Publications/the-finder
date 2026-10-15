# Decisions

USER = Stewart decided. AI = Claude decided; Stewart can overrule any of these. Newest at the bottom.
The reasoning for the AI decisions is in `PLAN.md` ("The story frame", "Key decisions") and
`docs/research/`.

| ID | Date | Tag | Decision | Why | How to reverse |
|---|---|---|---|---|---|
| D-U01 | 2026-10-15 | USER | An interactive experience where you play the alien who finds Voyager and decodes the Golden Record from the cover alone; every deduction checked against reality; new repo in Samizdat-Publications; web on Cloudflare as a shareable link | The kickoff (`C:\Users\stewa\Downloads\golden-record-kickoff.md`) | n/a |
| D-U02 | 2026-10-15 | USER | Use the real record content (116 images, greetings, sounds, music); decode the images from the actual record audio where possible; licensing is Stewart's responsibility and must not shape decisions | The kickoff | n/a |
| D-U03 | 2026-10-15 | USER | Autonomous build from PLAN, PROGRESS and HANDOFF; main thread on architecture and judgment, cheaper subagents for implementation; "checkpoint" protocol; ask only about irreversible or product-defining choices; never use em dashes | The kickoff | n/a |
| D-U04 | 2026-10-15 | USER | Plan approved as written | Chat, planning session | n/a |
| D-A01 | 2026-10-15 | AI | Name stays **The Finder**; private repo `the-finder`; site `the-finder.stewartgregerson.workers.dev` | The record is addressed to whoever finds it | Rename the repo and Worker before launch (the URL changes) |
| D-A02 | 2026-10-15 | AI | Story frame: Voyager 1, found about 44,000 years after launch by a Finder from Gliese 445, at the real projected flyby (0.575 pc, Bailer-Jones and Farnocchia 2019) | The real future; every clock and the "where" puzzle matter; at that time the senders are near neighbours (to confirm in M1) | Edit `data/scenario.json` (Voyager 2 and Ross 248 at about 42,000 years is the prepared alternative); story text changes |
| D-A03 | 2026-10-15 | AI | Web stack: Vite, strict TypeScript, three.js on the WebGL2 renderer (pinned), Preact with signals, Canvas 2D and SVG, Web Audio, Web Workers, Vitest, Playwright with installed Chrome; Cloudflare Workers static assets | A shareable link; his conventions; WebGL2 runs everywhere and headless Chrome here has no WebGPU adapter | Renderer swap is contained in `src/world/`; the rest is plain TypeScript |
| D-A04 | 2026-10-15 | AI | Pictures decoded live in the browser from Ozma's 2016 transfer of the 1977 image master (`384kHzStereo.wav`), never re-encoded; clean images only in tests and a labelled epilogue gallery | The kickoff's authenticity rule, and the genuine tape exists | None planned; if the source vanished, the checksum-verified copy in `sources/` still rebuilds the slices |
| D-A05 | 2026-10-15 | AI | Record audio from Ozma's 2017 remaster (from the master tapes); NASA SoundCloud as a cross-check | Best available quality and provenance | Swap files in the media pipeline |
| D-A06 | 2026-10-15 | AI | Hub structure: after Arrival and The Key, the cover's regions can be worked in any order the physics allows | Agency; mirrors real decipherment | Lock the deduction graph to a linear order |
| D-A07 | 2026-10-15 | AI | Alien units in-world, with an optional "human gloss" setting showing SI units (off by default) | Keeps the alien perspective without locking anyone out | Default the gloss on |
| D-A08 | 2026-10-15 | AI | The colour channel order, the record's side break and the uranium spot's position are shown as honest inferences or documented choices | The record and the sources do not settle them | Change the text if new evidence appears |
| D-A09 | 2026-10-15 | AI | Desktop and laptop first (Chrome, Edge, Firefox); tablets supported; phones best effort; Safari untested | The puzzle interface needs room; no Mac here | Add a phone layout pass |
| D-A10 | 2026-10-15 | AI | Compressed runtime media committed to git; raw sources re-fetched by script with checksums | A deploy never depends on regenerating media (Ranch Defense Force shipped silent once) | Move media to R2 (needs a wrangler login with R2 scope) |
| D-A11 | 2026-10-15 | AI | Long audio split per track and fetched whole (then a Blob URL), because Workers static assets ignore Range requests | Seeking works everywhere without R2 | Serve from R2 through a Worker with Range support |
| D-A12 | 2026-10-15 | AI | Helper agents: builder, builder-opus, asset-smith, scout, runner, player-critic, science-auditor, qa-auditor (`.claude/agents/`), adapted from Cut & Fill | Proven setup; a science auditor added because correctness is the product | Edit the agent files |
