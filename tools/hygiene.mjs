// node tools/hygiene.mjs
//
// Repository hygiene (PLAN.md automated check 12; CLAUDE.md rules 8, 11 and 13): no em dash in any tracked text
// file, no tracked .env file, and every tracked file under 20 MB. Prints each offender with its line and exits 1
// if there is any. Binary files (media, models) are skipped for the dash test.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const TEXT = /\.(ts|tsx|mjs|js|cjs|py|md|css|html|json|jsonc|txt|toml|yml|yaml|svg|bat|ps1|csv)$/i;
const MAX_BYTES = 20 * 1024 * 1024;
const EM_DASH = String.fromCharCode(0x2014);

const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
const problems = [];
for (const f of files) {
  const full = join(ROOT, f);
  let size;
  try {
    size = statSync(full).size;
  } catch {
    continue; // deleted in the working tree
  }
  if (size > MAX_BYTES) problems.push(`${f}: ${(size / 1048576).toFixed(1)} MB, over 20 MB`);
  if (/^\.env(\..*)?$/.test(basename(f))) problems.push(`${f}: an .env file is tracked`);
  if (!TEXT.test(f)) continue;
  const lines = readFileSync(full, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (line.includes(EM_DASH)) problems.push(`${f}:${i + 1}: em dash`);
  });
}
if (problems.length) {
  console.log(problems.join('\n'));
  console.log(`\n${problems.length} hygiene problem(s) in ${files.length} tracked files`);
  process.exit(1);
}
console.log(`hygiene: ${files.length} tracked files, no em dashes, no .env, none over 20 MB`);
