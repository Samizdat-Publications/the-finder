// node tools/critic_gemini/watch.mjs [--from <stopId>] [--to <stopId>] [--chapters a,b] [--hold 1] [--out <folder>] [--estimate-only]
//
// Films the guided tour (tools/harness/film-tour.mjs, same selection flags) and then runs the Gemini video
// critic on the review folder (tools/critic_gemini/critic.py), in one command. Prints the review's path.
//
// If the film or the critic fails for any reason (upload refused, spend cap, estimate over the stop, model
// error, empty answer), this exits non-zero and writes <folder>/CRITIC_FAILED.txt with the reason. The
// reason is the tail of the child's own messages with anything shaped like a key removed; no key material is
// ever read here. --estimate-only films, then asks the critic for its cost estimate and stops (no spend).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stamp } from '../../tests/browser/slice.browser.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const estimateOnly = argv.includes('--estimate-only');

/** Flags that take a value, passed to film-tour as they are. */
const VALUE_FLAGS = ['--from', '--to', '--chapters', '--hold', '--out'];
const filmArgs = [];
for (let i = 0; i < argv.length; i++) {
  if (VALUE_FLAGS.includes(argv[i])) {
    filmArgs.push(argv[i], argv[i + 1] ?? '');
    i++;
  } else if (argv[i] !== '--estimate-only') {
    console.error(`[watch] unknown argument "${argv[i]}"`);
    process.exit(2);
  }
}
const outAt = filmArgs.indexOf('--out');
const folder = resolve(outAt >= 0 ? filmArgs[outAt + 1] : join(ROOT, 'review', 'inbox', `${stamp()}-tour-film`));
if (outAt < 0) filmArgs.push('--out', folder);
else filmArgs[outAt + 1] = folder;

/** Last lines of a child's messages, with anything key-shaped removed. */
function tail(text, lines = 12) {
  return String(text || '')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(-lines)
    .join('\n')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[removed]')
    .replace(/(api[_-]?key["'=: ]+)[^\s"']+/gi, '$1[removed]');
}

function fail(reason) {
  mkdirSync(folder, { recursive: true });
  const text = `The critic did not produce a review for ${relative(ROOT, folder).replace(/\\/g, '/')}.\n\nReason:\n${reason}\n`;
  writeFileSync(join(folder, 'CRITIC_FAILED.txt'), text);
  console.error(`[watch] FAILED: ${reason.split('\n').slice(-3).join(' | ')}`);
  console.error(`[watch] reason saved in ${join(folder, 'CRITIC_FAILED.txt')}`);
  process.exit(1);
}

// 1. Film the tour (its own messages go straight to the terminal).
const film = spawnSync(process.execPath, [join(ROOT, 'tools', 'harness', 'film-tour.mjs'), ...filmArgs], { cwd: ROOT, stdio: 'inherit' });
if (film.error || film.status !== 0) fail(`filming the tour failed (exit ${film.status ?? 'none'}${film.error ? `, ${film.error.message}` : ''}); see the film-tour messages above`);
const clip = join(folder, 'slice.mp4');
if (!existsSync(clip) || statSync(clip).size === 0) fail('film-tour finished but slice.mp4 is missing or empty');

// 2. The critic. python -P (safe path; the packages are in the user site-packages).
const critic = spawnSync('python', ['-P', join(ROOT, 'tools', 'critic_gemini', 'critic.py'), folder, ...(estimateOnly ? ['--estimate-only'] : [])], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 1 << 28,
});
if (critic.stdout) console.log(tail(critic.stdout, 40));
if (critic.error) fail(`the critic could not start: ${critic.error.message}`);
if (critic.status !== 0) fail(`critic.py exited ${critic.status}:\n${tail(`${critic.stderr}\n${critic.stdout}`)}`);

if (estimateOnly) {
  console.log(`[watch] estimate only; film at ${folder}`);
  process.exit(0);
}
const review = join(folder, 'gemini.md');
if (!existsSync(review) || readFileSync(review, 'utf8').trim().length === 0) fail(`critic.py finished but gemini.md is missing or empty:\n${tail(`${critic.stderr}\n${critic.stdout}`)}`);
console.log(`[watch] review: ${review}`);
