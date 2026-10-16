// Merges the check records written by the tests (harness/out/checks/*.json, from tests/support/record.ts
// and tools/checkrecord.py) into docs/checks/results.json, then renders the results table into
// docs/HOW_ITS_CHECKED.md between the generated markers. Run by tools/check.mjs after the test steps,
// so the page always shows what the last full check run measured.
// Exits 1 if a record is malformed or the markers are missing; a failing check is reported, not fatal
// here (the test step that produced it already failed).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IN_DIR = join(ROOT, 'harness', 'out', 'checks');
const OUT_JSON = join(ROOT, 'docs', 'checks', 'results.json');
const PAGE = join(ROOT, 'docs', 'HOW_ITS_CHECKED.md');
const START = '<!-- generated:results:start -->';
const END = '<!-- generated:results:end -->';
const FIELDS = ['id', 'claim', 'measured', 'expected', 'tolerance', 'pass'];

const records = [];
const problems = [];
if (existsSync(IN_DIR)) {
  for (const file of readdirSync(IN_DIR).filter((f) => f.endsWith('.json')).sort()) {
    try {
      const rec = JSON.parse(readFileSync(join(IN_DIR, file), 'utf8'));
      const missing = FIELDS.filter((f) => !(f in rec));
      if (missing.length) problems.push(`${file}: missing ${missing.join(', ')}`);
      else records.push(rec);
    } catch (e) {
      problems.push(`${file}: ${e.message}`);
    }
  }
}
records.sort((a, b) => a.id.localeCompare(b.id));

// Table cells: keep pipes and line breaks from breaking the markdown table.
/** A table cell: objects (a record's measured value may be one) as "key value; key value", never "[object Object]". */
const flat = (v) =>
  v !== null && typeof v === 'object'
    ? Object.entries(v).map(([k, x]) => `${k} ${typeof x === 'object' && x !== null ? JSON.stringify(x) : x}`).join('; ')
    : String(v ?? '');
const cell = (v) => flat(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const today = new Date().toISOString().slice(0, 10);

const clean = records.map(({ at: _at, ...rest }) => rest);
mkdirSync(dirname(OUT_JSON), { recursive: true });
writeFileSync(OUT_JSON, `${JSON.stringify({ generated: today, count: clean.length, checks: clean }, null, 2)}\n`);

const passed = records.filter((r) => r.pass).length;
const lines = [
  START,
  `_Generated ${today} from \`docs/checks/results.json\` by \`tools/how-checked.mjs\`: ${passed} of ${records.length} checks pass._`,
  '',
  '| Test | Claim | Measured | Compared with | Tolerance | Result |',
  '|---|---|---|---|---|---|',
  ...records.map(
    (r) =>
      `| \`${cell(r.id)}\` | ${cell(r.claim)} | ${cell(r.measured)} | ${cell(r.expected)} | ${cell(r.tolerance)} | ${r.pass ? 'PASS' : '**FAIL**'} |`,
  ),
];
const withNotes = records.filter((r) => r.notes);
if (withNotes.length) {
  lines.push('', '**Notes and honest error bars**', '');
  for (const r of withNotes) lines.push(`- \`${r.id}\`: ${String(r.notes).replace(/\r?\n/g, ' ')}`);
}
lines.push(END);

const page = readFileSync(PAGE, 'utf8');
const a = page.indexOf(START);
const b = page.indexOf(END);
if (a < 0 || b < a) {
  console.error(`[how-checked] markers not found in ${PAGE}`);
  process.exit(1);
}
writeFileSync(PAGE, page.slice(0, a) + lines.join('\n') + page.slice(b + END.length));

console.log(`[how-checked] ${records.length} records (${passed} pass) -> docs/checks/results.json and docs/HOW_ITS_CHECKED.md`);
for (const p of problems) console.error(`[how-checked] bad record: ${p}`);
process.exit(problems.length ? 1 : 0);
