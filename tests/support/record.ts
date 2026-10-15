// Records the outcome of a science or decoder check for How it's checked.
// Each call writes one JSON file under harness/out/checks/; tools/how-checked.mjs merges them into
// docs/checks/results.json and renders the table in docs/HOW_ITS_CHECKED.md, so the page cannot
// drift from the tests. Call it from inside a test, after computing the value and before asserting.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface CheckRecord {
  /** Stable dotted id matching the "Test" column of docs/HOW_ITS_CHECKED.md, e.g. "clocks.uranium.coverage". */
  id: string;
  /** One plain-language sentence a curious non-scientist can read. */
  claim: string;
  /** What was measured or computed, as shown to a reader (numbers already rounded sensibly). */
  measured: string;
  /** The independent truth it was compared with, and where that truth comes from. */
  expected: string;
  /** The tolerance or interval, and where it comes from (computed, published uncertainty, design claim). */
  tolerance: string;
  pass: boolean;
  /** Optional caveats or the honest error bar. */
  notes?: string;
}

const OUT_DIR = resolve(process.cwd(), 'harness', 'out', 'checks');

export function recordCheck(rec: CheckRecord): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const safe = rec.id.replace(/[^A-Za-z0-9._-]/g, '_');
  writeFileSync(join(OUT_DIR, `${safe}.json`), JSON.stringify({ ...rec, at: new Date().toISOString() }, null, 2));
}
