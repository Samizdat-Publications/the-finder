# The Finder: project rules

A browser experience where you play an alien who, about 44,000 years from now, finds Voyager 1 and
decodes the Golden Record from the cover alone: what it is, how old it is, how to play it, where it
came from, when it left, and who sent it. Every deduction is the real one, checked against real data.
Web (Vite, TypeScript, three.js on WebGL2, Preact, Web Audio, Workers) on Cloudflare Workers static
assets. Owner: Stewart, who is not a programmer and has delegated all technical judgment.

## Read order, every session

1. `PROGRESS.md`: where the build is and exactly what to do next.
2. `HANDOFF.md`: how to work here (delegation, tools and paths, gotchas, checkpoint protocol).
3. `PLAN.md`: the approved plan. Read the sections for the current milestone and its
   `docs/plans/Mx.md` checklist (write that checklist first if it does not exist yet).
4. `docs/research/README.md`: the research index and the cross-report corrections. Build on the
   research; do not redo it.
5. `docs/STEWART_FEEDBACK.md`: his notes outrank everything except the hard rules below.

Reference: `docs/research/`, `docs/DECISIONS.md`, `docs/HOW_ITS_CHECKED.md`.

## Working mode

- **Autonomous through the plan**, milestone after milestone, without stopping at milestone
  boundaries. Stop only for "checkpoint", a usage limit, or a decision that is genuinely Stewart's
  (irreversible or product-defining). Decide everything else, log it in `docs/DECISIONS.md` (tag AI,
  with a revert note), and keep going.
- The main thread keeps architecture, integration, science and taste calls, and reading screenshots
  and decoded pictures. Well-specified implementation goes to subagents (HANDOFF.md "Delegation
  playbook").
- Stop where you can land it: finish and verify a step rather than half-starting the next.
- Commit and update `PROGRESS.md` after every meaningful chunk; push when a step is done.
- Send Stewart preview links, decoded pictures and progress screenshots as they land (SendUserFile);
  never wait for his reply.

## Hard rules

1. **Real data, never faked.** Every number the player sees comes from `data/` (built by scripts from
   the cited sources in `docs/research/`) or from `src/science/` computing on it. No hand-typed
   "expected answers" in interface code. Values projected to the story's epoch come from the epoch
   model and are labelled as projections in How it's checked.
2. **The pictures are decoded from the real image tape.** Never show a clean published image in place
   of a decoded frame inside the experience (clean images appear only in tests and in the clearly
   labelled epilogue gallery). Never re-encode images into audio.
3. **Every deduction is checked before it ships.** Each one has an entry in
   `docs/HOW_ITS_CHECKED.md` and an automated test. Error bars are computed, never chosen. A science
   claim without a passing test is UNVERIFIED.
4. **Science and signal code is pure.** `src/science/` and `src/dsp/` never import three.js, Preact or
   the DOM; they run identically in Node (Vitest) and the browser.
5. **One command bus.** The interface and the bots issue the same commands; no bot-only shortcuts into
   game state.
6. **Deterministic where it matters.** Simulated measurement noise, timing-noise and glitch
   realizations come from seeded streams; the same seed gives the same result.
7. **Nothing is done until verified:** tests run, and screenshots or decoded pictures actually looked
   at. Otherwise say UNVERIFIED.
8. **Keys:** never read, print or commit API keys or `.env` files. Scripts load keys at run time
   (environment first, then `C:\Users\stewa\ClaudeProjects\Noclip\.env`) and never print them.
9. **Downloads:** only from sources named in `docs/research/`, each recorded in `tools/sources.json`
   with URL, size and checksum (MD5 where the source publishes one, SHA-256 always). Raw downloads go
   under `sources/<source-id>/` (gitignored), each in its own folder. Never run downloaded code. Never
   download from `Adriann6842/voyager-golden-record` or anything that asks to disable antivirus.
10. **Git:** stage explicit paths only. Never `git add -A` or `git add .` (a plugin database lives in
    `.claude/data/`). Never force-push or rewrite pushed history.
11. **Media:** every shipped file under 20 MB (Cloudflare refuses files over 25 MiB). Compressed runtime
    media is committed; raw sources are not.
12. **Credits and spend:** every external asset and data source gets a line in `docs/CREDITS.md`. Every
    paid generation call is logged in `docs/SPEND.md` (soft cap about $20 per session). Stewart has
    taken responsibility for licensing the record's content; licensing does not drive decisions, but
    sources are always credited.
13. **Writing:** never use an em dash anywhere (code, comments, docs, interface text, commits, chat).
    Use a comma, colon, period, or spaced hyphen.
14. **Commands for Stewart:** Windows PowerShell 5.1, one line, starting with `cd "<full path>";`,
    chained with `;`, fenced as `powershell`. Use full absolute paths whenever pointing him at a file or
    folder.

## Project facts

- Folder: `C:\Users\stewa\Documents\Claude\Golden Record` (the name stays; never rename or move
  project folders). Repo: `https://github.com/Samizdat-Publications/the-finder` (private), remote
  `origin`, branch `main`. Site (once deployed): `https://the-finder.stewartgregerson.workers.dev`.
- The story scenario (craft, epoch, home star) lives in one config, `data/scenario.json`: Voyager 1,
  found about 44,000 years after launch near Gliese 445 (D-A02). Everything "when" and "where" is
  computed from it.
