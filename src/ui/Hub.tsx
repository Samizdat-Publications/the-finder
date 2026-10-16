// The hub: a radial ring of chapter glyphs (locked ones dim, unbuilt ones marked "later"), not a list.
// Choosing a glyph sends chapter.enter; a refused one explains itself in the shell's notice.

import { chapterStatus, type ChapterStatus } from '../game/deductions';
import { CHAPTERS, chapterDef, nodeDef } from '../game/graph';
import { confirmedSet, game } from '../game/state';
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
  const question = first ? nodeDef(first)?.question : undefined;
  return question ? `Opens after you answer: ${question}` : '';
}

/** What each state on the ring means, for the legend. */
const LEGEND: readonly { status: ChapterStatus; text: string }[] = [
  { status: 'open', text: 'you can work here now' },
  { status: 'done', text: 'every deduction here is confirmed' },
  { status: 'locked', text: 'needs another deduction first' },
  { status: 'later', text: 'not built yet' },
];

export function Hub() {
  const confirmed = confirmedSet.value;
  const statuses = CHAPTERS.map((c) => chapterStatus(c.id, confirmed));
  const lit = statuses.map((s) => s === 'open' || s === 'done');
  // The finished ring: every chapter that is built is done. A slow glow then runs along the lit arcs.
  const builtStatuses = CHAPTERS.filter((c) => c.built).map((c) => chapterStatus(c.id, confirmed));
  const finished = builtStatuses.length > 0 && builtStatuses.every((s) => s === 'done');
  return (
    <section class="hub" aria-label="The ring of chapters" data-ring-finished={finished ? 'true' : 'false'}>
      <div class={`ring${finished ? ' finished' : ''}`}>
        <svg class="ringlines" viewBox="-50 -50 100 100" aria-hidden="true">
          <circle r={RADIUS} class="track" />
          <circle r={RADIUS * 0.62} class="track faint" />
          {CHAPTERS.map((c, i) => {
            const j = (i + 1) % CHAPTERS.length;
            const a = angle(i);
            const b = angle(j);
            // A finished chapter lights both of its arcs; two open or finished neighbours light the arc between them.
            const glow = statuses[i] === 'done' || statuses[j] === 'done' || (lit[i] && lit[j]);
            const d = `M${RADIUS * Math.cos(a)} ${RADIUS * Math.sin(a)}A${RADIUS} ${RADIUS} 0 0 1 ${RADIUS * Math.cos(b)} ${RADIUS * Math.sin(b)}`;
            return (
              <g key={c.id}>
                <path class={glow ? 'arc lit' : 'arc'} d={d} />
                {glow && finished && <path class="arc lit run" d={d} />}
              </g>
            );
          })}
        </svg>
        <div class="core">
          <GlyphSvg k="the finder" height={34} />
          <button type="button" class="btn tour-start" data-tour-start onClick={() => send({ type: 'tour.start' })}>
            {game.tour.value.step > 0 ? 'Resume the guided tour' : 'Start the guided tour'}
          </button>
          <p class="gloss">or pick any lit chapter to explore on your own</p>
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
      <ul class="ringlegend" aria-label="What the marks on the ring mean">
        {LEGEND.map((l) => (
          <li key={l.status} data-legend={l.status}>
            <span class={`swatch ${l.status}`} aria-hidden="true" />
            <b>{STATUS_TEXT[l.status]}</b> {l.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
