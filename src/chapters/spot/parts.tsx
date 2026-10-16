// Shared pieces of the Spot panels: the panel frame with its question or what it waits for, the checker's
// latest verdict, and proposing (a command on the bus, rule 5).

import type { ComponentChildren } from 'preact';
import type { Answer } from '../../game/deductions';
import { missingFor, nodeStatus } from '../../game/deductions';
import { nodeDef } from '../../game/graph';
import { confirmedSet, game } from '../../game/state';
import { GlyphLabel, Value } from '../../ui/Glyph';
import { send } from '../../ui/send';

export function propose(id: string, answer: Answer): void {
  send({ type: 'deduction.propose', id, answer });
}

/** The latest attempt on a deduction. */
export function lastAttempt(id: string) {
  const a = game.records.value[id]?.attempts ?? [];
  return a[a.length - 1] ?? null;
}

/** A number field of the latest attempt's answer (for restoring the instrument's state), or null. */
export function lastAnswerNumber(id: string, key: string): number | null {
  const all = game.records.value[id]?.attempts ?? [];
  for (let i = all.length - 1; i >= 0; i--) {
    const a = all[i]?.answer;
    if (a && typeof a === 'object' && !Array.isArray(a) && typeof (a as Record<string, unknown>)[key] === 'number') return (a as Record<string, number>)[key] as number;
  }
  return null;
}

export function Panel(p: { id: string; title: string; glyph: string; children: ComponentChildren }) {
  const confirmed = confirmedSet.value;
  const status = nodeStatus(p.id, confirmed);
  const def = nodeDef(p.id);
  return (
    <section class={`sp-panel ${status}`} data-panel={p.id} data-status={status} aria-label={p.title}>
      <header class="sp-head">
        <GlyphLabel k={p.glyph} gloss={p.title} height={22} />
        <span class={`chip ${status}`}>{status}</span>
      </header>
      {status === 'locked' ? (
        <p class="sp-needs" role="note">
          First: {missingFor(p.id, confirmed).map((m) => nodeDef(m)?.question ?? m).join(' ')}
        </p>
      ) : (
        <>
          <p class="sp-question">{status === 'confirmed' ? def?.gloss : def?.question}</p>
          {p.children}
          <Result id={p.id} />
        </>
      )}
    </section>
  );
}

/** The checker's verdict on the latest attempt. */
export function Result(p: { id: string }) {
  const a = lastAttempt(p.id);
  if (!a) return null;
  return (
    <div class={`sp-result ${a.ok ? 'ok' : 'wrong'}`} data-result={p.id} data-ok={a.ok ? '1' : '0'} role="status">
      <p class="sp-verdict">{a.ok ? 'This holds.' : 'This does not hold.'}</p>
      <p>{a.message}</p>
      {a.ok && (
        <>
          <ul class="sp-readings" aria-label="Readings written to the codex">
            {a.result.map((r, i) => (
              <li key={i}>
                <span class="k">{r.key}</span> <Value reading={r} />
              </li>
            ))}
          </ul>
          <button type="button" class="btn small" onClick={() => send({ type: 'codex.open', id: p.id })}>
            Open it in the codex
          </button>
        </>
      )}
    </div>
  );
}
