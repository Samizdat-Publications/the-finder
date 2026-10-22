"""Gemini video critic: the one critic that hears the game and sees real motion.

    python -P tools/critic_gemini/critic.py <review folder> [--model MODEL] [--fps 2] [--estimate-only]

<review folder> is a filmed run, for example review/inbox/<timestamp>-slice/ from
tools/harness/film-slice.mjs: it holds slice.mp4 (with sound), frames/*.png and shots.txt. The film, the
same sound again as a separate audio file, four stills and the store-page pitch (the first paragraph of
README.md, read at run time) go to the strongest Gemini Pro model that accepts video, with the blind
player persona from .claude/agents/player-critic.md (read verbatim) and a request for a blind player's
review. The answer is saved as <review folder>/gemini.md, the token usage as gemini-usage.json.

Spend (CLAUDE.md rule 12): the cost is estimated BEFORE the call from the film's length and the model's
published rate; one row is appended to docs/SPEND.md; the script stops without calling if the estimate is
over MAX_ESTIMATE_USD.

Key (rule 8): GEMINI_API_KEY from the environment, else read at run time from
C:\\Users\\stewa\\ClaudeProjects\\Noclip\\.env (only that one line). It is never printed and never written
anywhere in this repo.

Adapted from Stewart's Noclip project (tools/critic_gemini/critic.py); see README.md here.
"""
import argparse
import datetime as dt
import glob
import json
import os
import re
import subprocess
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PERSONA_FILE = os.path.join(ROOT, ".claude", "agents", "player-critic.md")
SPEND = os.path.join(ROOT, "docs", "SPEND.md")
README = os.path.join(ROOT, "README.md")
NOCLIP_ENV = r"C:\Users\stewa\ClaudeProjects\Noclip\.env"

FALLBACK_MODELS = ["gemini-3.1-pro-preview", "gemini-3-pro-preview", "gemini-2.5-pro"]
# USD per 1M tokens (input, output), prompts under 200k tokens. Gemini 3.x Pro preview: $2 in, $12 out
# (Google AI pricing page, as Noclip's script uses); Flash rates kept from Noclip for a forced Flash model.
PRICES = {"pro": (2.0, 12.0), "flash": (0.75, 3.75)}
# Tokens per second of video, conservative: one frame is at most 258 tokens at the default media
# resolution (Gemini API video docs), sampled at --fps; sound is 32 tokens per second (Gemini audio docs),
# counted twice (the film's own track and the separate audio file).
TOKENS_PER_FRAME = 258
AUDIO_TOKENS_PER_S = 32
STILL_TOKENS = 1290  # one 1440x900 still: up to 1,290 tokens (tiled at 768 px; conservative)
TEXT_TOKENS = 6000  # persona, pitch, request
MAX_OUTPUT_TOKENS = 16384
MAX_ESTIMATE_USD = 3.0

REQUEST = """
You are reviewing a filmed run of a vertical slice of an unreleased browser game, played start to finish by
someone who knew the answers. Review it as a blind player who has only this film, the stills and the store
page. Use your usual output format, and after it add these sections, each specific and pointing at moments
in the film (give the time, mm:ss):

## What is clear
## What confuses
## What is beautiful
## What is boring
## Where the sound helps, and where it hurts
## The three changes that would most improve it
""".strip()


def load_key():
    key = os.environ.get("GEMINI_API_KEY")
    if key:
        return key
    try:
        with open(NOCLIP_ENV, encoding="utf-8") as f:
            for line in f:
                m = re.match(r"\s*(?:export\s+)?GEMINI_API_KEY\s*=\s*(.*)$", line)
                if m:
                    return m.group(1).strip().strip('"').strip("'")
    except OSError:
        pass
    return None


def persona():
    text = open(PERSONA_FILE, encoding="utf-8").read()
    parts = text.split("---", 2)
    return parts[2].strip() if len(parts) == 3 else text


def store_page():
    """The README's pitch: the paragraph between the title and the first bold line."""
    text = open(README, encoding="utf-8").read()
    body = text.split("\n", 1)[1]
    return body.split("**", 1)[0].strip()


def pick_model(client, forced=None):
    if forced:
        return forced
    best, best_v = None, -1.0
    try:
        for m in client.models.list():
            name = (m.name or "").replace("models/", "")
            acts = [a.lower() for a in (getattr(m, "supported_actions", None) or [])]
            if acts and not any("generatecontent" in a for a in acts):
                continue
            mm = re.fullmatch(r"gemini-(\d+(?:\.\d+)?)-pro(?:-preview)?(?:-\d{2}-\d{4})?", name)
            if not mm:
                continue
            v = float(mm.group(1)) - (0.001 if "preview" in name else 0.0)
            if v > best_v:
                best, best_v = name, v
    except Exception as e:  # listing can fail; fall back
        print("[gemini] model list failed:", type(e).__name__)
    return best or FALLBACK_MODELS[0]


def ffprobe_seconds(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path],
                       capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def estimate(seconds, fps, stills, model):
    tin = seconds * (fps * TOKENS_PER_FRAME + 2 * AUDIO_TOKENS_PER_S) + stills * STILL_TOKENS + TEXT_TOKENS
    pin, pout = PRICES["flash" if "flash" in model else "pro"]
    return tin, tin / 1e6 * pin + MAX_OUTPUT_TOKENS / 1e6 * pout


def wait_active(client, f, limit_s):
    t0 = time.time()
    while not f.state or f.state.name != "ACTIVE":
        if f.state and f.state.name == "FAILED":
            raise RuntimeError("file processing failed")
        if time.time() - t0 > limit_s:
            raise RuntimeError("file processing timed out")
        time.sleep(4)
        f = client.files.get(name=f.name)
    return f


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--model", default=None)
    ap.add_argument("--fps", type=float, default=2.0)
    ap.add_argument("--estimate-only", action="store_true")
    a = ap.parse_args()
    folder = os.path.abspath(a.folder)
    clip = os.path.join(folder, "slice.mp4")
    frames = sorted(glob.glob(os.path.join(folder, "frames", "*.png")))
    if not os.path.exists(clip) or not frames:
        sys.exit(f"{folder} is missing slice.mp4 or frames/")
    pick = [frames[int(i * (len(frames) - 1) / 3)] for i in range(4)]
    seconds = ffprobe_seconds(clip)

    key = load_key()
    if not key:
        sys.exit("GEMINI_API_KEY not found in the environment or the Noclip .env")
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=key)
    model = pick_model(client, a.model)
    tin_est, usd_est = estimate(seconds, a.fps, len(pick), model)
    print(f"[gemini] model {model}; film {seconds:.1f} s at {a.fps} fps; estimate {tin_est:,.0f} input tokens, "
          f"at most {MAX_OUTPUT_TOKENS:,} out: ${usd_est:.2f}")
    if usd_est > MAX_ESTIMATE_USD:
        sys.exit(f"[gemini] estimate ${usd_est:.2f} is over ${MAX_ESTIMATE_USD:.2f}: not calling")
    if a.estimate_only:
        return
    rel = os.path.relpath(folder, ROOT).replace("\\", "/")

    # Uploads are free; the spend row is logged once they are accepted, just before the paid call.
    try:
        f = client.files.upload(file=clip)
    except Exception as e:
        sys.exit(f"[gemini] the upload was refused, nothing was called or charged: {type(e).__name__}: {str(e)[:300]}")
    audio_part = None
    mp3 = os.path.join(folder, "slice_audio.mp3")
    try:
        # The film's own sound again as a separate file: Gemini has reported a clip silent although it was not
        # (Noclip's LEDGER L038), so it gets both.
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", clip, "-vn", "-ac", "2", "-b:a", "128k", mp3], check=True)
        fa = wait_active(client, client.files.upload(file=mp3), 300)
        audio_part = types.Part(file_data=types.FileData(file_uri=fa.uri, mime_type=fa.mime_type))
    except Exception as e:
        print("[gemini] separate audio not sent:", type(e).__name__, e)
    finally:
        if os.path.exists(mp3):
            os.remove(mp3)
    f = wait_active(client, f, 600)

    intro = (
        "You are receiving the files directly instead of a folder. Here is everything you get:\n"
        "1. The store page (below).\n"
        f"2. slice.mp4: a {seconds:.0f}-second film of someone playing the build, WITH the game's own sound. "
        "You can hear it and see real motion, so judge Sound and motion from the film.\n"
        "3. Four still frames from the same session (the images after the film).\n"
        "4. slice_audio.mp3: the same session's sound as a separate file (identical to the film's own track).\n"
        "There is no previous build to compare to.\n\n"
        f"--- store page ---\n{store_page()}\n--- end of store page ---\n\n{REQUEST}\n"
    )
    contents = [types.Part(file_data=types.FileData(file_uri=f.uri, mime_type=f.mime_type),
                           video_metadata=types.VideoMetadata(fps=a.fps))]
    for p in pick:
        contents.append(types.Part.from_bytes(data=open(p, "rb").read(), mime_type="image/png"))
    if audio_part is not None:
        contents.append(audio_part)
    contents.append(intro)
    cfg = types.GenerateContentConfig(system_instruction=persona(), max_output_tokens=MAX_OUTPUT_TOKENS, temperature=0.7)
    with open(SPEND, "a", encoding="utf-8", newline="\n") as s:
        s.write(f"| {dt.date.today().isoformat()} | Gemini ({model}) | Video critic on a filmed run ({seconds:.0f} s), {rel}/gemini.md | {usd_est:.2f} (estimate before the call) |\n")
    resp = None
    for attempt in range(4):
        try:
            resp = client.models.generate_content(model=model, contents=contents, config=cfg)
            break
        except Exception as e:
            wait = 10 * (2 ** attempt)
            print(f"[gemini] attempt {attempt + 1} failed ({type(e).__name__}); retry in {wait}s")
            time.sleep(wait)
            if attempt == 1 and a.model is None and model in FALLBACK_MODELS and model != FALLBACK_MODELS[-1]:
                model = FALLBACK_MODELS[FALLBACK_MODELS.index(model) + 1]
                print("[gemini] falling back to", model)
    try:
        client.files.delete(name=f.name)
    except Exception:
        pass
    if resp is None or not resp.text:
        sys.exit("no response from Gemini")
    text = resp.text.strip()
    out = os.path.join(folder, "gemini.md")
    open(out, "w", encoding="utf-8", newline="\n").write(text + "\n")
    um = resp.usage_metadata
    tin = getattr(um, "prompt_token_count", 0) or 0
    tout = (getattr(um, "candidates_token_count", 0) or 0) + (getattr(um, "thoughts_token_count", 0) or 0)
    pin, pout = PRICES["flash" if "flash" in model else "pro"]
    cost = tin / 1e6 * pin + tout / 1e6 * pout
    usage = {"model": model, "inputTokens": tin, "outputTokens": tout, "costUsd": round(cost, 4),
             "estimateUsd": round(usd_est, 4), "filmSeconds": round(seconds, 2), "fps": a.fps}
    open(os.path.join(folder, "gemini-usage.json"), "w", encoding="utf-8", newline="\n").write(json.dumps(usage, indent=2) + "\n")
    print(f"[gemini] saved {out} ({len(text)} chars); {tin:,} in / {tout:,} out tokens, about ${cost:.2f}")


if __name__ == "__main__":
    main()
