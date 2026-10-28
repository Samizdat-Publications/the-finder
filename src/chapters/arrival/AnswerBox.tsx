// The answer part of every Arrival panel: the deduction's question, its choices (from choices.ts), and the
// latest result the checker gave, right or wrong. Proposing is a command on the bus (rule 5). The choices are the
// panel's hero control (the hero-control pass, 2026-10-28).

import { missingFor, nodeStatus, type Answer } from '../../game/deductions';
import { nodeDef } from '../../game/graph';
import { confirmedSet, game } from '../../game/state';
import { isPastProposal } from '../../ui/pastProposal';
import { ResultView } from '../../ui/ResultView';
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

/** The checker's verdict on the latest attempt (or the latest with the given answer): the shared result view. */
export function ResultLine(p: { id: string; answer?: string; current?: Answer }) {
  const all = game.records.value[p.id]?.attempts ?? [];
  const a = p.answer === undefined ? lastAttempt(p.id) : ([...all].reverse().find((x) => x.answer === p.answer) ?? null);
  if (!a) return null;
  return (
    <ResultView
      id={p.id}
      attempt={a}
      past={isPastProposal(a, p.current)}
      cls="ar-result"
      okCls="ok"
      badCls="wrong"
      okAttr={['1', '0']}
      verdictClass="ar-verdict"
      readings="list"
      readingsClass="ar-readings"
      codex
    />
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
        <fieldset class="ar-choices hero-control">
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
