// Shared pieces of the Spot panels: the panel frame with its question or what it waits for, the checker's
// latest verdict, and proposing (a command on the bus, rule 5).

import type { ComponentChildren } from 'preact';
import type { Answer } from '../../game/deductions';
import { missingFor, nodeStatus } from '../../game/deductions';
import { nodeDef } from '../../game/graph';
import { confirmedSet, game } from '../../game/state';
import { GlyphLabel } from '../../ui/Glyph';
import { isPastProposal } from '../../ui/pastProposal';
import { ResultView } from '../../ui/ResultView';
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

export function Panel(p: { id: string; title: string; glyph: string; children: ComponentChildren; current?: Answer }) {
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
          <Result id={p.id} current={p.current} />
        </>
      )}
    </section>
  );
}

/** The checker's verdict on the latest attempt: the shared result view. */
export function Result(p: { id: string; current?: Answer }) {
  const a = lastAttempt(p.id);
  if (!a) return null;
  return (
    <ResultView
      id={p.id}
      attempt={a}
      past={isPastProposal(a, p.current)}
      cls="sp-result"
      okCls="ok"
      badCls="wrong"
      okAttr={['1', '0']}
      verdictClass="sp-verdict"
      readings="list"
      readingsClass="sp-readings"
      codex
    />
  );
}
