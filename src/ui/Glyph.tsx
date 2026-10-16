// Glyph labels drawn as inline SVG: the alien's word, with a quiet English gloss line under it. Quantities
// are written the alien's way (Arabic digits, the unit as a glyph with its gloss), with SI in parentheses
// when the human gloss setting is on (D-A07). Presentational only.

import type { Reading } from '../game/deductions';
import { game } from '../game/state';
import { GLYPH_H, glyphWord, type GlyphWord } from './glyphs';
import { formatNumber, quantity } from './units';

const cache = new Map<string, GlyphWord>();
function word(key: string): GlyphWord {
  let w = cache.get(key);
  if (!w) {
    w = glyphWord(key);
    cache.set(key, w);
  }
  return w;
}

/** The glyph word alone, as an SVG sized by its height (in CSS pixels). */
export function GlyphSvg(p: { k: string; height?: number; class?: string }) {
  const w = word(p.k);
  const h = p.height ?? 24;
  return (
    <svg
      class={`glyph ${p.class ?? ''}`}
      viewBox={`-3 -3 ${w.width + 6} ${GLYPH_H + 6}`}
      width={((w.width + 6) / (GLYPH_H + 6)) * h}
      height={h}
      role="img"
      aria-label={`alien word for ${p.k}`}
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {w.glyphs.map((g, i) => (
        <g key={i} transform={`translate(${i * 32} 0)`}>
          {g.strokes.map((d, j) => (
            <path key={j} d={d} />
          ))}
          {g.marks.map((m, j) => (
            <circle key={`m${j}`} cx={m[0]} cy={m[1]} r={m[2]} fill={m[3] ? 'currentColor' : 'none'} stroke-width="1.6" />
          ))}
        </g>
      ))}
    </svg>
  );
}

/** A glyph word above a quiet English gloss line. */
export function GlyphLabel(p: { k: string; gloss?: string; height?: number; class?: string }) {
  return (
    <span class={`glyphlabel ${p.class ?? ''}`}>
      <GlyphSvg k={p.k} height={p.height} />
      {p.gloss !== undefined && <span class="gloss">{p.gloss}</span>}
    </span>
  );
}

/** A reading from a checker: the alien's number and unit; SI follows when the human gloss is on. */
export function Value(p: { reading: Reading }) {
  const r = p.reading;
  if (r.dim && typeof r.value === 'number') {
    const q = quantity(r.dim, r.value);
    return (
      <span class="value">
        <span class="num">{q.number}</span>
        <GlyphSvg k={q.unitKey} height={16} class="unit" />
        <span class="gloss unitgloss">{q.unitGloss}</span>
        {game.settings.value.humanGloss && <span class="si"> ({q.si})</span>}
      </span>
    );
  }
  return <span class="value num">{typeof r.value === 'number' ? formatNumber(r.value) : r.value}</span>;
}
