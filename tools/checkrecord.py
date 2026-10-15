"""Records the outcome of a Python check for How it's checked (the Python twin of tests/support/record.ts).

Each call writes harness/out/checks/<id>.json; tools/how-checked.mjs merges them into
docs/checks/results.json and the results table in docs/HOW_ITS_CHECKED.md. Call it after computing the
value and before deciding pass or fail. Import it with:

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # the tools/ folder
    from checkrecord import record_check
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parents[1] / "harness" / "out" / "checks"


def record_check(
    id: str,
    claim: str,
    measured: str,
    expected: str,
    tolerance: str,
    passed: bool,
    notes: str | None = None,
) -> None:
    """id: stable dotted id; claim: one plain sentence; measured / expected / tolerance: as a reader sees them."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", id)
    rec = {
        "id": id,
        "claim": claim,
        "measured": measured,
        "expected": expected,
        "tolerance": tolerance,
        "pass": bool(passed),
        "at": datetime.now(timezone.utc).isoformat(),
    }
    if notes:
        rec["notes"] = notes
    (OUT_DIR / f"{safe}.json").write_text(json.dumps(rec, indent=2), encoding="utf-8")
