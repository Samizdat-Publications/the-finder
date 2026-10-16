// Builds data/seeds.json: the playthrough seeds "Start over" takes (D-A28, M4 step 7d). Tries the candidate
// seeds finder-2, finder-3, ... in order, runs every seed-reading checker on its right answer for each
// (src/chapters/seedCheck.ts verifySeed, the game's own code loaded through Vite's module runner), and lists
// the seeds where every one confirms. Excluded seeds are kept in meta with the checks that refused them and
// why, and meta.rates counts how often the warm-white star lands beyond each cut over all candidates.
// Deterministic: the same candidates give the same file byte for byte (no dates, no timings in it).
//
// Usage (PowerShell, from the project folder):
//   cd "C:\Users\stewa\Documents\Claude\Golden Record"; node tools/seeds/build-seeds.mjs
// Options: --candidates N (default 2000), --workers N (default: cores minus one).
// Each candidate builds the whole epoch model (about 2 to 3 s); the work is split across worker processes.

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'data', 'seeds.json');
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
};

async function worker(from, to) {
  process.chdir(ROOT);
  const { runnerImport } = await import('vite');
  const opts = { root: ROOT, configFile: false, logLevel: 'error' };
  const data = (await runnerImport('/tests/support/data.ts', opts)).module;
  const sc = (await runnerImport('/src/chapters/seedCheck.ts', opts)).module;
  const inputs = { scenario: data.loadScenario(), stars: data.loadStars(), catalogue: data.loadPulsars(), cover: data.loadCover() };
  for (let k = from; k < to; k++) {
    const v = sc.verifySeed(inputs, sc.candidateSeed(k));
    process.stdout.write(`${JSON.stringify({ k, ...v })}\n`);
  }
}

function runWorker(from, to) {
  return new Promise((res, rej) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--worker', String(from), String(to)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
    let buf = '';
    const out = [];
    child.stdout.on('data', (d) => {
      buf += d.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line.startsWith('{')) out.push(JSON.parse(line));
      }
    });
    child.on('error', rej);
    child.on('close', (code) => (code === 0 ? res(out) : rej(new Error(`worker ${from}..${to} exited with ${code}`))));
  });
}

async function main() {
  const N = arg('candidates', 2000);
  const W = Math.max(1, Math.min(arg('workers', availableParallelism() - 1), N));
  const t0 = Date.now();
  const chunk = Math.ceil(N / W);
  const parts = [];
  for (let w = 0; w < W; w++) {
    const from = w * chunk;
    const to = Math.min(N, from + chunk);
    if (from < to) parts.push(runWorker(from, to));
  }
  const all = (await Promise.all(parts)).flat().sort((a, b) => a.k - b.k);
  if (all.length !== N) throw new Error(`expected ${N} verdicts, got ${all.length}`);
  const seeds = all.filter((v) => v.ok).map((v) => v.seed);
  const excluded = all.filter((v) => !v.ok).map((v) => ({ seed: v.seed, failed: v.failed }));
  const byCheck = {};
  for (const e of excluded) for (const f of e.failed) byCheck[f.id] = (byCheck[f.id] ?? 0) + 1;
  const count = (f) => all.filter(f).length;
  const meta = {
    description: "Playthrough seeds for Start over (D-A28): each candidate seed was played with every seed-reading checker's right answer (src/chapters/seedCheck.ts verifySeed) and is listed only when all of them confirm. The Key, The Player and The Pictures never read the seed.",
    builtWith: 'node tools/seeds/build-seeds.mjs',
    candidates: N,
    firstCandidate: all[0].seed,
    lastCandidate: all[all.length - 1].seed,
    listed: seeds.length,
    excluded: { total: excluded.length, byCheck: Object.fromEntries(Object.entries(byCheck).sort(([a], [b]) => (a < b ? -1 : 1))), seeds: excluded },
    rates: {
      note: 'Over all candidates: how often the warm-white star (the true origin) lands beyond each cut. trail.origin and trail.where accept at 99.9% (D-A28); the drawn error bars are 95%.',
      trailOriginBeyond95: count((v) => v.stats.originOver95 > 1),
      trailOriginBeyond999: count((v) => v.stats.originOver999 > 1),
      trailWhereBeyond95: count((v) => v.stats.whereContour > 0.95),
      trailWhereBeyond999: count((v) => v.stats.whereContour > 0.999),
      trailWhereContourMax: Number(Math.max(...all.map((v) => v.stats.whereContour)).toFixed(4)),
      spotPureStartRefusedAtOneDay: count((v) => v.stats.pureStartRefused),
    },
  };
  writeFileSync(OUT, `${JSON.stringify({ meta, seeds }, null, 1)}\n`);
  console.log(`[seeds] ${N} candidates, ${seeds.length} listed, ${excluded.length} excluded (${JSON.stringify(byCheck)}); rates ${JSON.stringify(meta.rates)}; ${((Date.now() - t0) / 1000).toFixed(0)} s on ${W} workers -> ${OUT}`);
}

if (process.argv[2] === '--worker') await worker(Number(process.argv[3]), Number(process.argv[4]));
else await main();
