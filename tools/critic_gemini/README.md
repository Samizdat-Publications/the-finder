# Gemini video critic

The one critic that hears the game and sees real motion. It sends a filmed run (with its sound), four
stills and the store-page pitch to Gemini with the blind player persona from
`.claude/agents/player-critic.md`, and saves a blind player's review next to the film.

```
python -P tools/critic_gemini/critic.py review/inbox/<timestamp>-slice [--model MODEL] [--fps 2] [--estimate-only]
```

- **Input:** a review folder made by `node tools/harness/film-slice.mjs` (`slice.mp4`, `frames/*.png`,
  `shots.txt`). The store page is the first paragraph of `README.md`, read at run time.
- **Output:** `gemini.md` (the review) and `gemini-usage.json` (model, tokens, cost) in the same folder.
- **Model:** the newest `gemini-N-pro` the key can use (listed at run time), else
  `gemini-3.1-pro-preview`, then `gemini-3-pro-preview`, then `gemini-2.5-pro`. Files go up through the
  Files API (`client.files.upload`), the video sampled at `--fps` (default 2), plus the film's sound again
  as a separate MP3.
- **Spend:** before calling, the cost is estimated from the film's length (2 frames a second at up to 258
  tokens each, sound at 32 tokens a second, counted twice, four stills, up to 16,384 output tokens, at the
  Pro preview rate of $2 in and $12 out per million tokens). The script stops without calling if the
  estimate is over $3; otherwise one row goes into `docs/SPEND.md` once the uploads are accepted, just
  before the paid call. A refused upload (for example a spend cap on the Google project) exits with the
  reason and logs nothing. `--estimate-only` prints the estimate and stops.
- **Key:** `GEMINI_API_KEY` from the environment, else read at run time from
  `C:\Users\stewa\ClaudeProjects\Noclip\.env` (that one line only). Never printed, never copied here.
- **Needs:** Python with `google-genai` (2.27 here; run as `python -P`, the packages are in the user
  site-packages), `ffmpeg` and `ffprobe` on PATH.

Use it at the M3 gate and at M7 only (HANDOFF.md). Stewart has since asked for it throughout the build
(each chapter as it lands, the whole tour at the end): see the next section.

## Filming the guided tour, and the one-command watch

```
node tools/harness/film-tour.mjs [--from <stopId>] [--to <stopId>] [--chapters a,b] [--out <folder>] [--hold 1]
node tools/critic_gemini/watch.mjs [same flags] [--estimate-only]
```

- **film-tour.mjs** drives the tour as `tests/browser/tour.browser.mjs` does (fresh save, `/play/?tour=1` at
  1440 x 900 on the Vite dev server, only the guide's own buttons) and films it with the game's real sound,
  using the same clapperboard sync and mux as `film-slice.mjs` (H.264 and AAC, under 50 MB; the encoder
  raises the CRF, then shrinks the frame, if a long film would go over). Output:
  `review/inbox/<timestamp>-tour-film/` with `slice.mp4` (that name so `critic.py` works unchanged),
  `frames/` (each stop before and after), `shots.txt` (`file: what it shows | what the player just did`),
  `manifest.json` and `film.json` (length, stops filmed with their seconds in the film, the audio offset
  corrected, how long the fast-forward took).
- **Choosing the stretch:** `--from` and `--to` are stop ids from `src/tour/script.ts`; `--chapters` names
  tour parts (`key`, `player`, `pictures`, `voices`, `numbers`, `spot`, `map`, `trail`; a chapter view such
  as `hub` also works). The film runs from the first selected stop to the last. Stops before it are
  fast-forwarded with the guide's own "Do it for me" and Next, with no tap, clap or screenshots; the film
  starts at the first selected stop. With nothing chosen it films the whole tour (long: the picture album
  develops for minutes).
- **Pacing:** each stop holds its guide text for about 1 s per 15 words (at most 12 s), then acts, then holds
  the result about 4 s. `--hold 0.5` halves the reading time, `--hold 2` doubles it.
- **watch.mjs** runs film-tour, then `python -P tools/critic_gemini/critic.py <folder>`, and prints the
  review's path (`gemini.md`). `--estimate-only` films, then prints the critic's cost estimate and stops.
  If the film or the critic fails for any reason (upload refused, spend cap, estimate over $3, model error,
  empty answer) it exits non-zero and writes `<folder>/CRITIC_FAILED.txt` with the reason (the child's own
  last lines, with anything key-shaped removed).
- **Spend:** the critic's own rules apply (estimate first, $3 stop, one `docs/SPEND.md` row per paid call).
  `critic.py` still words that row as "the filmed M3 slice"; the folder path in the row says which film it was.
- **Needs:** Chrome (Playwright's installed channel), `ffmpeg` and `ffprobe` on PATH; the script starts the
  Vite dev server itself. Review folders are gitignored.

## Credit

Adapted from `tools/critic_gemini/critic.py` in Stewart's own Noclip project
(`C:\Users\stewa\ClaudeProjects\Noclip`, private, same owner; it carries no separate licence). Changes:
the review folder is an argument, the key comes from the environment or the Noclip `.env` by a plain line
read (no `python-dotenv`), the cost is estimated and logged before the call with a $3 stop, the request
asks for the step 8 review sections, and the usage is saved beside the review.
