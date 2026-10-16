// The hub: a radial ring of chapter glyphs (locked ones dim, unbuilt ones marked "later"), not a list.
// Choosing a glyph sends chapter.enter; a refused one explains itself in the shell's notice.

import { chapterStatus, type ChapterStatus } from '../game/deductions';
import { CHAPTERS, chapterDef, nodeDef } from '../game/graph';
import { confirmedSet } from '../game/state';
import { GlyphLabel, GlyphSvg } from './Glyph';
import { send } from './send';

const STATUS_TEXT: Record<ChapterStatus, string> = { later: 'later', locked: 'locked', open: 'open', done: 'done' };
const RADIUS = 40; // percent of the ring's box

function angle(i: number): number {
  return (i / CHAPTERS.length) * 2 * Math.PI - Math.PI / 2;
}

/** The text that says what a locked chapter is waiting for. */
function needs(id: string): string {
  const first = chapterDef(id)?.requires[0];
  const gloss = first ? nodeDef(first)?.gloss : undefined;
  return gloss ? `Opens after: ${gloss}` : '';
}

export function Hub() {
  const confirmed = confirmedSet.value;
  const lit = CHAPTERS.map((c) => {
    const s = chapterStatus(c.id, confirmed);
    return s === 'open' || s === 'done';
  });
  return (
    <section class="hub" aria-label="The ring of chapters">
      <div class="ring">
        <svg class="ringlines" viewBox="-50 -50 100 100" aria-hidden="true">
          <circle r={RADIUS} class="track" />
          <circle r={RADIUS * 0.62} class="track faint" />
          {CHAPTERS.map((c, i) => {
            const j = (i + 1) % CHAPTERS.length;
            const a = angle(i);
            const b = angle(j);
            const glow = lit[i] && lit[j];
            return (
              <path
                key={c.id}
                class={glow ? 'arc lit' : 'arc'}
                d={`M${RADIUS * Math.cos(a)} ${RADIUS * Math.sin(a)}A${RADIUS} ${RADIUS} 0 0 1 ${RADIUS * Math.cos(b)} ${RADIUS * Math.sin(b)}`}
              />
            );
          })}
        </svg>
        <div class="core">
          <GlyphSvg k="the finder" height={34} />
          <p class="gloss">Choose where to work.</p>
        </div>
        {CHAPTERS.map((c, i) => {
          const status = chapterStatus(c.id, confirmed);
          const a = angle(i);
          return (
            <button
              key={c.id}
              type="button"
              class={`chap ${status}`}
              style={{ left: `${(50 + RADIUS * Math.cos(a)).toFixed(2)}%`, top: `${(50 + RADIUS * Math.sin(a)).toFixed(2)}%` }}
              aria-disabled={status === 'later' || status === 'locked'}
              aria-label={`${c.title}, ${STATUS_TEXT[status]}`}
              title={status === 'locked' ? needs(c.id) : c.gloss}
              onClick={() => send({ type: 'chapter.enter', chapter: c.id })}
            >
              <GlyphLabel k={c.title} height={26} />
              <span class="cname">{c.title}</span>
              <span class="tag">{STATUS_TEXT[status]}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
