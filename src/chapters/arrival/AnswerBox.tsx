// The answer part of every Arrival panel: the deduction's question, its choices (from choices.ts), and the
// latest result the checker gave, right or wrong. Proposing is a command on the bus (rule 5).

import { useEffect, useRef } from 'preact/hooks';
import { missingFor, nodeStatus } from '../../game/deductions';
import { nodeDef } from '../../game/graph';
import { confirmedSet, game } from '../../game/state';
import { Value } from '../../ui/Glyph';
import { send } from '../../ui/send';
import { CHOICES } from './choices';

export function propose(id: string, answer: string): void {
  send({ type: 'deduction.propose', id, answer });
}

/** The latest attempt on a deduction, for the result line. */
export function lastAttempt(id: string) {
  const a = game.records.value[id]?.attempts ?? [];
  return a[a.length - 1] ?? null;
}

export function Status(p: { id: string }) {
  const confirmed = confirmedSet.value;
  const status = nodeStatus(p.id, confirmed);
  const def = nodeDef(p.id);
  if (status === 'locked') {
    return (
      <p class="ar-needs" role="note">
        First: {missingFor(p.id, confirmed).map((m) => nodeDef(m)?.question ?? m).join(' ')}
      </p>
    );
  }
  return <p class="ar-question">{status === 'confirmed' ? def?.gloss : def?.question}</p>;
}

/** The checker's verdict on the latest attempt (or the latest with the given answer). */
export function ResultLine(p: { id: string; answer?: string }) {
  const all = game.records.value[p.id]?.attempts ?? [];
  const a = p.answer === undefined ? lastAttempt(p.id) : ([...all].reverse().find((x) => x.answer === p.answer) ?? null);
  const ref = useRef<HTMLDivElement>(null);
  const n = game.records.value[p.id]?.attempts.length ?? 0;
  // A new verdict scrolls into view inside the panel (only the panel scrolls, never the page).
  useEffect(() => {
    const el = ref.current;
    const box = el?.closest<HTMLElement>('.ar-panelwrap');
    if (!el || !box || n === 0) return;
    const over = el.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom;
    if (over > 0) box.scrollTop += over + 12;
  }, [n]);
  if (!a) return null;
  return (
    <div ref={ref} class={`ar-result ${a.ok ? 'ok' : 'wrong'}`} data-result={p.id} data-ok={a.ok ? '1' : '0'} role="status">
      <p class="ar-verdict">{a.ok ? 'This holds.' : 'This does not hold.'}</p>
      <p>{a.message}</p>
      {a.ok && (
        <ul class="ar-readings" aria-label="Readings written to the codex">
          {a.result.map((r, i) => (
            <li key={i}>
              <span class="k">{r.key}</span> <Value reading={r} />
            </li>
          ))}
        </ul>
      )}
      {a.ok && (
        <button type="button" class="btn small" onClick={() => send({ type: 'codex.open', id: p.id })}>
          Open it in the codex
        </button>
      )}
    </div>
  );
}

/** Choice buttons that propose at once (purpose, heat, made or mined). */
export function AnswerBox(p: { id: string; prompt: string; showPrompt?: boolean }) {
  const status = nodeStatus(p.id, confirmedSet.value);
  const tried = new Set((game.records.value[p.id]?.attempts ?? []).filter((a) => !a.ok).map((a) => String(a.answer)));
  return (
    <div class="ar-answer" data-answer={p.id}>
      <Status id={p.id} />
      {status === 'open' && (
        <fieldset class="ar-choices">
          <legend class={p.showPrompt ? undefined : 'sr'}>{p.prompt}</legend>
          {(CHOICES[p.id] ?? []).map((c) => (
            <button key={c.id} type="button" class={`ar-choice${tried.has(c.id) ? ' tried' : ''}`} data-choice={c.id} onClick={() => propose(p.id, c.id)}>
              {c.label}
            </button>
          ))}
        </fieldset>
      )}
      <ResultLine id={p.id} />
    </div>
  );
}
