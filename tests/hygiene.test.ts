import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EM_DASH = String.fromCharCode(0x2014);
const TEXT_EXT = new Set([
  '.md', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.html', '.css', '.py', '.bat', '.txt', '.svg',
  '.yml', '.yaml', '.toml',
]);
const MAX_BYTES = 20_000_000;

function listFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  // A file can be listed but already deleted from disk (unstaged delete); skip those.
  return out.split('\0').filter((f) => f.length > 0 && existsSync(join(ROOT, f)));
}

const files = listFiles();

describe('repository hygiene', () => {
  it('has no em dash in any text file', () => {
    const hits: string[] = [];
    for (const f of files) {
      if (!TEXT_EXT.has(extname(f).toLowerCase())) continue;
      const lines = readFileSync(join(ROOT, f), 'utf8').split(/\r?\n/);
      lines.forEach((line, i) => {
        if (line.includes(EM_DASH)) hits.push(`${f}:${i + 1}`);
      });
    }
    expect(hits, `em dash found at:\n${hits.join('\n')}`).toEqual([]);
  });

  it('has no file larger than 20 MB', () => {
    const big = files
      .map((f) => ({ f, size: statSync(join(ROOT, f)).size }))
      .filter((x) => x.size > MAX_BYTES)
      .map((x) => `${x.f} (${x.size} bytes)`);
    expect(big).toEqual([]);
  });

  it('has no shipped file (public/ or dist/) larger than 20 MB', () => {
    const walk = (dir: string): string[] =>
      readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
      );
    const shipped = ['public', 'dist'].filter((d) => existsSync(join(ROOT, d))).flatMap(walk);
    const big = shipped
      .map((f) => ({ f, size: statSync(join(ROOT, f)).size }))
      .filter((x) => x.size > MAX_BYTES)
      .map((x) => `${x.f} (${x.size} bytes)`);
    expect(big).toEqual([]);
  });

  it('tracks no .env file except .env.example', () => {
    const bad = files.filter((f) => {
      const name = f.split('/').pop() ?? f;
      return (name === '.env' || name.startsWith('.env.')) && name !== '.env.example';
    });
    expect(bad).toEqual([]);
  });

  it('keeps src/science and src/dsp pure (no UI imports, no DOM, no Math.random)', () => {
    const pure = files.filter(
      (f) => f.endsWith('.ts') && (f.startsWith('src/science/') || f.startsWith('src/dsp/')),
    );
    const importRe =
      /(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)['"](three(?:\/[^'"]*)?|preact(?:\/[^'"]*)?|@preact\/[^'"]*)['"]/;
    const domRe = /\b(document|window|navigator|localStorage)\b/;
    const randomRe = /\bMath\.random\b/;
    const hits: string[] = [];
    for (const f of pure) {
      const lines = readFileSync(join(ROOT, f), 'utf8').split(/\r?\n/);
      lines.forEach((line, i) => {
        const t = line.trimStart();
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
        if (importRe.test(line)) hits.push(`${f}:${i + 1} imports a UI/3D library`);
        if (domRe.test(line)) hits.push(`${f}:${i + 1} uses a DOM global`);
        if (randomRe.test(line)) hits.push(`${f}:${i + 1} uses Math.random (use a seeded stream)`);
      });
    }
    expect(hits, hits.join('\n')).toEqual([]);
  });
});
