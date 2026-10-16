// Small pieces shared by The Key's panels: a choice list that proposes through the command bus, the last
// answer's reading (what it showed, right or wrong), and a string of strokes drawn as bars and dashes.

import { signal } from '@preact/signals';
import { useState } from 'preact/hooks';
import { nodeStatus, type Answer } from '../../game/deductions';
import { nodeDef } from '../../game/graph';
import { confirmedSet, game } from '../../game/state';
import { GlyphLabel, Value } from '../../ui/Glyph';
import { renderMessage } from '../../ui/message';
import { PastLabel, isPastProposal } from '../../ui/pastProposal';
import { send } from '../../ui/send';
import type { StrokeKind } from '../shared/coverSvg';

export interface Choice {
  id: string;
  label: string;
  answer: Answer;
}

/** The panel heading: the node's glyph and its question (or its conclusion once confirmed). */
export function PanelHead(p: { id: string }) {
  const def = nodeDef(p.id);
  if (!def) return null;
  const status = nodeStatus(p.id, confirmedSet.value);
  return (
    <header class="khead">
      <GlyphLabel k={def.key} gloss={status === 'confirmed' ? def.gloss : def.question} height={24} />
      <span class={`chip ${status}`}>{status}</span>
    </header>
  );
}

/** Radio choices and a Propose button; disabled unless the node is open. */
/** The answer each choice panel holds now (its picked choice), for LastReading's past-proposal mark. */
const choicePicks = signal<Record<string, Answer>>({});

export function Propose(p: { id: string; choices: Choice[]; legend: string }) {
  const [pick, setPickState] = useState<string | null>(null);
  const setPick = (id: string): void => {
    setPickState(id);
    const c = p.choices.find((x) => x.id === id);
    if (c) choicePicks.value = { ...choicePicks.value, [p.id]: c.answer };
  };
  const status = nodeStatus(p.id, confirmedSet.value);
  const chosen = p.choices.find((c) => c.id === pick);
  if (status === 'confirmed') return null;
  return (
    <fieldset class="kchoices" disabled={status !== 'open'} data-propose={p.id}>
      <legend>{p.legend}</legend>
      {p.choices.map((c) => (
        <label key={c.id} class="kchoice">
          <input type="radio" name={`choice-${p.id}`} value={c.id} checked={pick === c.id} onChange={() => setPick(c.id)} data-choice={c.id} />
          <span>{c.label}</span>
        </label>
      ))}
      <button
        type="button"
        class="btn small"
        disabled={!chosen}
        data-propose-button={p.id}
        onClick={() => chosen && send({ type: 'deduction.propose', id: p.id, answer: chosen.answer })}
      >
        Propose
      </button>
    </fieldset>
  );
}

/**
 * What the latest answer to this node showed: the message and the instrument's readings. `current` is the answer
 * the instrument would propose now; when it differs from a refused proposal, the result is marked as the last
 * proposal (src/ui/pastProposal.tsx).
 */
export function LastReading(p: { id: string; current?: Answer }) {
  const rec = game.records.value[p.id];
  const last = rec?.attempts[rec.attempts.length - 1];
  if (!last) return null;
  const past = isPastProposal(last, p.current !== undefined ? p.current : choicePicks.value[p.id]);
  return (
    <div class={`kresult ${last.ok ? 'ok' : 'bad'}${past ? ' is-past' : ''}`} data-result={p.id} data-ok={String(last.ok)} data-past={past ? '1' : '0'} role="status">
      {past && <PastLabel />}
      <p>{renderMessage(last.message, game.settings.value.humanGloss)}</p>
      {last.result.length > 0 && (
        <dl class="kreadings">
          {last.result.map((r, i) => (
            <div key={i}>
              <dt>
                <GlyphLabel k={r.key} gloss={r.key} height={13} />
              </dt>
              <dd>
                <Value reading={r} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** A string of strokes drawn small: a bar for "across", a dash for "along". */
export function StrokeBars(p: { kinds: StrokeKind[]; max?: number }) {
  const n = Math.min(p.kinds.length, p.max ?? 48);
  const w = n * 5 + 2;
  return (
    <svg class="sbars" viewBox={`0 0 ${w} 12`} width={w} height={12} aria-label={`${p.kinds.length} strokes`} role="img">
      {p.kinds.slice(0, n).map((k, i) =>
        k === 'across' ? <line key={i} x1={i * 5 + 3} x2={i * 5 + 3} y1={2} y2={10} /> : <line key={i} x1={i * 5 + 1} x2={i * 5 + 5} y1={6} y2={6} />,
      )}
    </svg>
  );
}

/** The plural of an alien unit's English key (reach, reaches; beat, beats). */
export function plural(key: string): string {
  return /(ch|sh|s|x)$/.test(key) ? `${key}es` : `${key}s`;
}
