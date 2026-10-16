// The clues are the most legible thing on screen (M3 step 8b): every colour that carries evidence (a label, a
// value, an axis tick, a footnote) has at least 4.5:1 contrast (WCAG AA for text) against every surface it
// sits on. The tokens come straight from theme.css, so a change to the palette is checked here.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = (f: string): string => readFileSync(new URL(f, import.meta.url), 'utf8');
const theme = css('./theme.css');

function tokens(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of theme.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1] as string] = (m[2] as string).toLowerCase();
  return out;
}

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number);
}

/** WCAG contrast ratio of two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Every surface a clue sits on: the page, a raised panel, a sunken well, and a drawer. */
const SURFACES = ['bg', 'bg-raised', 'bg-sunk'] as const;
const DRAWER = '#0a091e';
/** Colours that carry evidence. */
const CLUES = ['text', 'text-dim', 'cyan', 'violet', 'gold', 'danger', 'heat', 'cold'] as const;
const MIN = 4.5;

describe('clue contrast (WCAG AA, 4.5:1)', () => {
  const t = tokens();

  it('every clue colour reads on every surface', () => {
    const rows: string[] = [];
    for (const fg of CLUES) {
      const f = t[fg];
      expect(f, `token --${fg}`).toBeTruthy();
      const cells = [...SURFACES.map((s) => [s, t[s] as string] as const), ['drawer', DRAWER] as const];
      const ratios = cells.map(([name, hex]) => ({ name, r: contrast(f as string, hex) }));
      rows.push(`${fg.padEnd(9)} ${f}  ${ratios.map((x) => `${x.name} ${x.r.toFixed(2)}`).join('  ')}`);
      for (const x of ratios) expect(x.r, `${fg} on ${x.name}`).toBeGreaterThanOrEqual(MIN);
    }
    console.log(`[contrast] pair table (ratio, need ${MIN}):\n${rows.join('\n')}`);
  });

  it('the notice and the boot error text read on their own backgrounds', () => {
    expect(contrast('#ffe3e7', '#2a0f1c')).toBeGreaterThanOrEqual(MIN); // a refused command's notice
    expect(contrast('#ffd7dd', '#1c0b14')).toBeGreaterThanOrEqual(MIN); // the boot error screen
  });

  it('no stylesheet sets a text colour (color or fill) from a hex that is not a token, except quiet decoration', () => {
    // Decoration (glyph ornaments on a dim chapter) may be quieter than the clues; nothing else may.
    const decoration = new Set(['#6a67a3']);
    const known = new Set(Object.values(t));
    const files = [
      '../ui/shell.css', '../ui/codex.css', '../ui/captions.css', '../chapters/arrival/arrival.css', '../chapters/key/key.css',
      '../chapters/player/player.css', '../chapters/pictures/pictures.css', '../chapters/shared/coverViewer.css', '../ui/results.css', '../ui/moment.css',
    ];
    const offenders: string[] = [];
    for (const f of files) {
      for (const m of css(f).matchAll(/(?:^|[\s;{])(?:color|fill):\s*(#[0-9a-fA-F]{6})/g)) {
        const hex = (m[1] as string).toLowerCase();
        if (known.has(hex) || decoration.has(hex) || hex === '#ffe3e7') continue;
        offenders.push(`${f}: ${hex}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the clue sizes are set: labels at least 13 px, values at least 15 px', () => {
    const label = /--fs-label:\s*([\d.]+)rem/.exec(theme);
    const value = /--fs-value:\s*([\d.]+)rem/.exec(theme);
    expect(Number(label?.[1]) * 16).toBeGreaterThanOrEqual(13);
    expect(Number(value?.[1]) * 16).toBeGreaterThanOrEqual(15);
  });
});
