// npm run check: typecheck, unit tests, the site build, then the Python checks when they exist.
// Writes harness/LAST_RUN.md in plain words. Exits 1 if any step FAILED (SKIP is not a failure).
// Tools are spawned through this same node (process.execPath) because npx.cmd is ENOENT for a bare
// spawn on Windows and shell:true breaks on paths with spaces. TypeScript 7's bin/tsc is a node
// launcher that starts the native compiler itself.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'harness');
const TAIL_LINES = 40;

function run(name, command, args) {
  return new Promise((resolveRun) => {
    const started = Date.now();
    const chunks = [];
    const child = spawn(command, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => {
      chunks.push(d);
      process.stdout.write(d);
    });
    child.stderr.on('data', (d) => {
      chunks.push(d);
      process.stderr.write(d);
    });
    child.on('error', (e) => {
      chunks.push(Buffer.from(`could not start: ${e.message}\n`));
      resolveRun({ name, status: 'FAIL', ms: Date.now() - started, output: Buffer.concat(chunks).toString('utf8') });
    });
    child.on('close', (code) =>
      resolveRun({
        name,
        status: code === 0 ? 'PASS' : 'FAIL',
        ms: Date.now() - started,
        output: Buffer.concat(chunks).toString('utf8'),
      }),
    );
  });
}

const skip = (name, reason) => ({ name, status: 'SKIP', ms: 0, output: '', reason });

mkdirSync(join(OUT_DIR, 'out'), { recursive: true });
const jsonOut = join(OUT_DIR, 'out', 'vitest.json');
if (existsSync(jsonOut)) rmSync(jsonOut);
// Check records for How it's checked are rebuilt by every run, so removed tests leave no stale rows.
rmSync(join(OUT_DIR, 'out', 'checks'), { recursive: true, force: true });

const steps = [];

console.log('\n[check] 1/7 typecheck');
steps.push(
  await run('Typecheck', process.execPath, [
    join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'),
    '--noEmit',
    '-p',
    'tsconfig.json',
  ]),
);

console.log('\n[check] 2/7 unit and science tests');
steps.push(
  await run('Unit and science tests', process.execPath, [join(ROOT, 'node_modules', 'vitest', 'vitest.mjs'), 'run']),
);

console.log('\n[check] 3/7 site build');
steps.push(
  await run('Site build', process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build']),
);

console.log('\n[check] 4/7 browser tests');
steps.push(await run('Browser tests', process.execPath, [join(ROOT, 'tools', 'harness', 'browser-tests.mjs')]));

console.log('\n[check] 5/7 Python reference checks');
const tape = join(ROOT, 'sources', 'image-tape', '384kHzStereo.wav');
const refChecks = join(ROOT, 'tools', 'ref-decoder', 'checks.py');
if (!existsSync(tape)) steps.push(skip('Python reference checks', 'image tape not downloaded'));
else if (!existsSync(refChecks)) steps.push(skip('Python reference checks', 'reference checks not written yet'));
else steps.push(await run('Python reference checks', 'python', ['-P', 'tools/ref-decoder/checks.py']));

console.log('\n[check] 6/7 data checks');
const dataChecks = join(ROOT, 'tools', 'data', 'checks.py');
if (!existsSync(dataChecks)) steps.push(skip('Data checks', 'data checks not written yet'));
else steps.push(await run('Data checks', 'python', ['-P', 'tools/data/checks.py']));

console.log("\n[check] 7/7 How it's checked page");
steps.push(await run("How it's checked page", process.execPath, [join(ROOT, 'tools', 'how-checked.mjs')]));

const failed = steps.filter((s) => s.status === 'FAIL');
const ok = failed.length === 0;
const lines = [
  '# The Finder: last check run',
  '',
  `Date: ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`,
  '',
  ok ? '**PASS. Everything passed: nothing is broken.**' : '**FAIL. Something failed: see below.**',
  '',
  '| Step | Result | Seconds | Note |',
  '|---|---|---|---|',
  ...steps.map((s) => `| ${s.name} | ${s.status} | ${(s.ms / 1000).toFixed(1)} | ${s.reason ?? ''} |`),
  '',
];
for (const s of failed) {
  const tail = s.output.split(/\r?\n/).slice(-TAIL_LINES).join('\n');
  lines.push(`## ${s.name}: last ${TAIL_LINES} lines of output`, '', '```', tail, '```', '');
}
writeFileSync(join(OUT_DIR, 'LAST_RUN.md'), lines.join('\n'));

console.log('\n[check] summary');
for (const s of steps) console.log(`  ${s.status.padEnd(4)}  ${s.name}${s.reason ? ` (${s.reason})` : ''}`);
console.log(`[check] ${ok ? 'PASS' : 'FAIL'}; report: harness/LAST_RUN.md`);
process.exit(ok ? 0 : 1);
