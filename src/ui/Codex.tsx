// The codex (v1): a side drawer with one entry per confirmed deduction: the alien glyph title, the English
// gloss, the alien's notation of what was found (glyphs and numbers from the checker's result), the answers
// that did not hold and what they showed, and a link to the matching row of How it's checked.

import { useEffect, useRef } from 'preact/hooks';
import type { Attempt } from '../game/deductions';
import { NODES, type NodeDef } from '../game/graph';
import { confirmedSet, game } from '../game/state';
import { GlyphLabel, GlyphSvg, Value } from './Glyph';
import { useDrawerFocus } from './focus';
import { send } from './send';

function Notation(p: { node: NodeDef; attempt: Attempt }) {
  return (
    <p class="notation" aria-label="The alien's notation">
      <GlyphSvg k={p.node.key} height={22} />
      <span class="op">:</span>
      {p.attempt.result.map((r, i) => (
        <span key={i} class="reading">
          <GlyphSvg k={r.key} height={18} class="rk" />
          <span class="op">=</span>
          <Value reading={r} />
        </span>
      ))}
    </p>
  );
}

function Entry(p: { node: NodeDef; focused: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const attempts = game.records.value[p.node.id]?.attempts ?? [];
  const right = [...attempts].reverse().find((a) => a.ok);
  const wrong = attempts.filter((a) => !a.ok);
  useEffect(() => {
    if (p.focused) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [p.focused]);
  return (
    <article class={`entry${p.focused ? ' focused' : ''}`} id={`codex-${p.node.id}`} data-entry={p.node.id} ref={ref}>
      <h3>
        <GlyphLabel k={p.node.key} gloss={p.node.key} height={30} />
      </h3>
      <p class="egloss">{p.node.gloss}</p>
      {right && <Notation node={p.node} attempt={right} />}
      {wrong.length > 0 && (
        <details class="wrong">
          <summary>
            {wrong.length} answer{wrong.length === 1 ? '' : 's'} that did not hold
          </summary>
          <ul>
            {wrong.map((a, i) => (
              <li key={i}>{a.message}</li>
            ))}
          </ul>
        </details>
      )}
      <p class="elink">
        <a href={`/checked/#row-${p.node.checkedRow}`} data-checked-link>
          How it's checked
        </a>
      </p>
    </article>
  );
}

export function Codex() {
  const confirmed = confirmedSet.value;
  const focus = game.codexFocus.value;
  const entries = NODES.filter((n) => confirmed.has(n.id));
  const closeRef = useRef<HTMLButtonElement>(null);
  useDrawerFocus(closeRef);
  return (
    <aside class="drawer codex" role="dialog" aria-label="Codex" id="codex">
      <header class="drawerhead">
        <h2>
          <GlyphLabel k="codex" gloss="Codex" height={28} />
        </h2>
        <button type="button" class="btn small" ref={closeRef} onClick={() => send({ type: 'codex.close' })}>
          Close
        </button>
      </header>
      {entries.length === 0 ? (
        <p class="note empty">Nothing decoded yet. Each deduction you confirm is written here.</p>
      ) : (
        entries.map((n) => <Entry key={n.id} node={n} focused={n.id === focus} />)
      )}
    </aside>
  );
}
