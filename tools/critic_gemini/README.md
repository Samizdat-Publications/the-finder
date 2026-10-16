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

Use it at the M3 gate and at M7 only (HANDOFF.md).

## Credit

Adapted from `tools/critic_gemini/critic.py` in Stewart's own Noclip project
(`C:\Users\stewa\ClaudeProjects\Noclip`, private, same owner; it carries no separate licence). Changes:
the review folder is an argument, the key comes from the environment or the Noclip `.env` by a plain line
read (no `python-dotenv`), the cost is estimated and logged before the call with a $3 stop, the request
asks for the step 8 review sections, and the usage is saved beside the review.
