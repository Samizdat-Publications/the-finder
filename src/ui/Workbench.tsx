// A chapter's workbench. Step 1 has no instruments yet, so each slice chapter shows a placeholder that lists
// its deductions and their states, with a hint button per open node and the wrong answers remembered. Later
// steps replace the placeholder with the real instrument and keep the node list as the notebook beside it.

import { HINT_TIER_NAMES, missingFor, nodeStatus, type NodeStatus } from '../game/deductions';
import { instrumentFor } from '../chapters/registry';
import { chapterDef, nodeDef, nodesOf, type ChapterId, type NodeDef } from '../game/graph';
import { confirmedSet, game } from '../game/state';
import { GlyphLabel } from './Glyph';
import { notebookOpen } from './notebook';
import { send } from './send';

const STATUS_TEXT: Record<NodeStatus, string> = { locked: 'locked', open: 'open', confirmed: 'confirmed' };
const NEXT_BUTTON = ['Show a nudge', 'Show the method', 'Show the answer'] as const;

function HintBox(p: { node: NodeDef }) {
  const shown = game.records.value[p.node.id]?.hints ?? 0;
  return (
    <div class="hintbox">
      {shown < 3 && (
        <button type="button" class="btn small" data-hint={p.node.id} onClick={() => send({ type: 'hint.request', id: p.node.id })}>
          {NEXT_BUTTON[shown]}
        </button>
      )}
      {shown > 0 && (
        <ol class="hints">
          {p.node.hints.slice(0, shown).map((h, i) => (
            <li key={i}>
              <span class="tier">{HINT_TIER_NAMES[i]}</span> {h}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function NodeRow(p: { node: NodeDef }) {
  const confirmed = confirmedSet.value;
  const status = nodeStatus(p.node.id, confirmed);
  const rec = game.records.value[p.node.id];
  const wrong = (rec?.attempts ?? []).filter((a) => !a.ok);
  const missing = status === 'locked' ? missingFor(p.node.id, confirmed) : [];
  return (
    <li class={`node ${status}`} data-node={p.node.id} data-status={status}>
      <div class="nodehead">
        <GlyphLabel k={p.node.key} gloss={status === 'confirmed' ? p.node.gloss : p.node.question} height={26} />
        <span class={`chip ${status}`}>{STATUS_TEXT[status]}</span>
      </div>
      {missing.length > 0 && (
        <p class="needs">
          Needs:{' '}
          {missing.map((id, i) => (
            <span key={id}>
              {i > 0 && ', '}
              {nodeDef(id)?.question ?? id}
            </span>
          ))}
        </p>
      )}
      {status === 'open' && <HintBox node={p.node} />}
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
    </li>
  );
}

export function Workbench(p: { chapter: ChapterId }) {
  const def = chapterDef(p.chapter);
  if (!def) return null;
  const nodes = nodesOf(p.chapter);
  const confirmed = confirmedSet.value;
  const done = nodes.filter((n) => confirmed.has(n.id)).length;
  const open = notebookOpen.value;
  const Instrument = instrumentFor(p.chapter);
  return (
    <section class="bench-area" aria-label={def.title} data-chapter={p.chapter}>
      <header class="chaphead">
        <button type="button" class="btn small" onClick={() => send({ type: 'chapter.enter', chapter: 'hub' })}>
          Back to the ring
        </button>
        <h1>
          <GlyphLabel k={def.title} gloss={def.title} height={30} />
        </h1>
        <p class="note">{def.gloss}</p>
        <button
          type="button"
          class="btn small notebook-toggle"
          data-tool="notebook"
          aria-expanded={open}
          aria-controls="notebook"
          onClick={() => (notebookOpen.value = !open)}
        >
          Notebook <b class="count">{done}/{nodes.length}</b>
        </button>
      </header>
      <div class="bench-body" data-notebook={open ? 'open' : 'closed'}>
        <div class="bench-main">
          {Instrument ? (
            <Instrument chapter={p.chapter} />
          ) : (
            <div class="frame">
              <p class="building" role="status">
                This instrument is being built.
              </p>
              <p class="note">The deductions of this chapter are listed in the notebook, with what each one waits for.</p>
            </div>
          )}
        </div>
        <aside class="notebook" id="notebook" aria-label="Notebook of deductions" hidden={!open}>
          <ul class="nodes" aria-label="Deductions in this chapter">
            {nodes.map((n) => (
              <NodeRow key={n.id} node={n} />
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
