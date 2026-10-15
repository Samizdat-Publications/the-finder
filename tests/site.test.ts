import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['index.html', 'play/index.html', 'checked/index.html'];
const read = (f: string): string => readFileSync(join(ROOT, f), 'utf8');

describe('site skeleton', () => {
  for (const page of PAGES) {
    it(`${page} exists with the boot overlay and exactly one module script`, () => {
      expect(existsSync(join(ROOT, page))).toBe(true);
      const html = read(page);
      expect(html).toContain('<meta charset="utf-8">');
      expect(html).toContain('name="viewport"');
      expect(html).toContain('id="boot-error"');
      expect(html.match(/<script type="module"/g)?.length).toBe(1);
    });
  }

  it('wrangler.jsonc serves ./dist with default HTML handling and no worker entry', () => {
    const w = JSON.parse(read('wrangler.jsonc')) as {
      name: string;
      main?: string;
      assets: { directory: string; not_found_handling?: string; html_handling?: string };
    };
    expect(w.name).toBe('the-finder');
    expect(w.assets.directory).toBe('./dist');
    expect(w.assets.not_found_handling).toBeUndefined();
    expect(w.assets.html_handling).toBeUndefined();
    expect(w.main).toBeUndefined();
  });

  it('vite.config.ts lists the three page inputs', () => {
    const cfg = read('vite.config.ts');
    for (const page of PAGES) expect(cfg).toContain(`./${page}`);
    expect(cfg).toContain('rolldownOptions');
  });

  it('the checked page imports the generated results document', () => {
    expect(read('src/checked/main.ts')).toContain('docs/HOW_ITS_CHECKED.md?raw');
    expect(existsSync(join(ROOT, 'docs', 'HOW_ITS_CHECKED.md'))).toBe(true);
  });
});
