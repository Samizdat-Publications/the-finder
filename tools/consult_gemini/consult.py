"""Second opinion from a Gemini model that reads the repository.

    python -P tools/consult_gemini/consult.py --ask <question.md> --out <answer.md>
        [--model models/gemini-4-argon] [--include src,docs,...] [--exclude-tests] [--count-only]

The tracked text files (git ls-files) under the --include roots are packed into one prompt, each headed by
its path, followed by the question. Large generated files (package-lock, docs/checks/results.json,
tools/sources.json, assets-src geometry, data/*.json over 40 KB) are left out; data/*.json files are listed
by name and size so the model knows they exist. The answer goes to --out, token usage beside it
(<out>.usage.json), and one row to docs/SPEND.md.

Key (CLAUDE.md rule 8): the same loader as the video critic (environment, else the Noclip .env line). Never
printed. The pack never includes .env files or anything under .claude/.
"""
import argparse
import datetime as dt
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "critic_gemini"))
from critic import load_key  # noqa: E402

SPEND = os.path.join(ROOT, "docs", "SPEND.md")
TEXT_EXT = (".ts", ".tsx", ".mjs", ".js", ".py", ".md", ".css", ".html", ".json", ".txt", ".toml", ".jsonc")
SKIP = {"package-lock.json", "docs/checks/results.json", "tools/sources.json", "assets-src/cover/geometry.json"}
DATA_MAX = 40_000
# USD per 1M tokens (input, output); unknown models are costed at the Pro preview rate, a guess.
PRICES = {"default": (2.0, 12.0)}


def tracked():
    out = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return [p for p in out.splitlines() if p]


def pack(include, exclude_tests, exclude=()):
    parts, listed = [], []
    for p in tracked():
        if include and not any(p == r or p.startswith(r.rstrip("/") + "/") for r in include):
            continue
        if any(p.startswith(x) for x in exclude):
            continue
        if p in SKIP or p.startswith(".claude/") or ".env" in os.path.basename(p):
            continue
        if not p.endswith(TEXT_EXT):
            continue
        if exclude_tests and (".test." in p or p.startswith("tests/")):
            continue
        full = os.path.join(ROOT, p)
        size = os.path.getsize(full)
        if p.startswith("data/") and p.endswith(".json") and size > DATA_MAX:
            listed.append(f"{p} ({size:,} bytes, not included)")
            continue
        with open(full, encoding="utf-8", errors="replace") as f:
            parts.append(f"=== FILE: {p} ===\n{f.read()}\n")
    head = "Large data files present but not included:\n" + "\n".join(listed) + "\n\n" if listed else ""
    return head + "".join(parts), len(parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ask", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="models/gemini-4-argon")
    ap.add_argument("--include", default="")
    ap.add_argument("--exclude", default="", help="comma-separated path prefixes to leave out")
    ap.add_argument("--exclude-tests", action="store_true")
    ap.add_argument("--count-only", action="store_true")
    ap.add_argument("--max-output", type=int, default=32768)
    a = ap.parse_args()

    from google import genai
    from google.genai import types

    key = load_key()
    if not key:
        sys.exit("No GEMINI_API_KEY found (environment or the Noclip .env).")
    client = genai.Client(api_key=key)

    include = [r.strip() for r in a.include.split(",") if r.strip()]
    exclude = [x.strip() for x in a.exclude.split(",") if x.strip()]
    body, nfiles = pack(include, a.exclude_tests, exclude)
    with open(a.ask, encoding="utf-8") as f:
        question = f.read()
    prompt = (
        "Below is the full text of a software repository (one file per '=== FILE: path ===' header), "
        "then a question from the project's lead engineer.\n\n" + body + "\n\n=== QUESTION ===\n" + question
    )
    n_in = client.models.count_tokens(model=a.model, contents=prompt).total_tokens
    pin, pout = PRICES.get(a.model, PRICES["default"])
    est = n_in / 1e6 * pin + a.max_output / 1e6 * pout
    print(f"{nfiles} files, {n_in:,} input tokens, estimate up to ${est:.2f} at ${pin}/${pout} per M")
    if a.count_only:
        return

    t0 = dt.datetime.now()
    resp = client.models.generate_content(
        model=a.model,
        contents=prompt,
        config=types.GenerateContentConfig(max_output_tokens=a.max_output),
    )
    text = resp.text or ""
    um = resp.usage_metadata
    tin = getattr(um, "prompt_token_count", n_in) or n_in
    tout = (getattr(um, "candidates_token_count", 0) or 0) + (getattr(um, "thoughts_token_count", 0) or 0)
    cost = tin / 1e6 * pin + tout / 1e6 * pout
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        f.write(text)
    usage = {"model": a.model, "files": nfiles, "inputTokens": tin, "outputTokens": tout,
             "costUsdAtAssumedRate": round(cost, 4), "seconds": (dt.datetime.now() - t0).total_seconds()}
    with open(a.out + ".usage.json", "w", encoding="utf-8") as f:
        json.dump(usage, f, indent=2)
    purpose = os.path.basename(a.ask)
    with open(SPEND, "a", encoding="utf-8") as f:
        f.write(f"| {dt.date.today().isoformat()} | Gemini ({a.model.split('/')[-1]}) | Repo consult: {purpose}, "
                f"{tin:,} in, {tout:,} out (rate assumed at Pro preview) | {cost:.2f} |\n")
    print(json.dumps(usage))


if __name__ == "__main__":
    main()
