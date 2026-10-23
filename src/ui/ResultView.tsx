// The one result area every chapter uses (M4 step 7e). A confirmed result leads with its headline (the key
// quantity large in the alien's units, its glyph label above, one plain sentence: headline.ts and the chapter's
// table); the checker's full message and the readings sit under a "show working" fold, closed by default and
// remembered in the player's settings (showWorking, set through the command bus). A refused result leads with
// one line, the message's own opening with its key number (src/ui/verdict.ts); the rest of the message and the
// readings fold beneath it. A new result is brought into view inside its
// own scrolling column (never the page). The wrappers keep each chapter's class names and data attributes.

import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { Attempt, Reading } from '../game/deductions';
import { HEADLINES } from '../chapters/headlines';
import { game } from '../game/state';
import { GlyphLabel, GlyphSvg, Value } from './Glyph';
import { headlineOf, type Headline } from './headline';
import { alienNumber, humanText, pluralKey, renderMessage, unitKeyOf, unitSize } from './message';
import { PastLabel } from './pastProposal';
import { send } from './send';
import { formatNumber } from './units';
import { splitVerdict } from './verdict';

/** The nearest ancestor that scrolls vertically on its own. */
function scroller(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/** Scroll the element's own column (not the page) so the element's bottom is in view, keeping its top in view too. */
export function bringIntoColumn(el: HTMLElement): void {
  const box = scroller(el);
  if (!box) return;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  const below = r.bottom - b.bottom + 12;
  const above = r.top - b.top - 8;
  if (below > 0) box.scrollTop += Math.min(below, Math.max(0, above));
  else if (above < 0) box.scrollTop += above;
}

/**
 * The headline's number: the alien's number and unit glyph, the unit's English gloss, and SI only with the human
 * gloss on. On the guided tour (whose audience reads our units, D-A33) the human value leads, large, and the alien's
 * follows small (M7 step 4, the V1 critic's "numbers hard to read at a glance").
 */
function HeadValue(p: { h: Headline }) {
  const q = p.h.quantity;
  if (q) {
    const key = unitKeyOf(q.dim);
    const n = alienNumber(q.si / unitSize(q.dim), q.digits);
    if (game.tour.value.on && game.settings.value.humanGloss) {
      return (
        <p class="hl-value human-first">
          <span class="hl-num">{humanText(q.dim, q.si, q.digits)}</span>
          <span class="hl-alien">
            {n}
            <GlyphSvg k={key} height={16} class="unit" />
            <span class="gloss">{n === '1' ? key : pluralKey(key)}</span>
          </span>
        </p>
      );
    }
    return (
      <p class="hl-value">
        <span class="hl-num">{n}</span>
        <span class="hl-unit">
          <GlyphSvg k={key} height={22} class="unit" />
          <span class="gloss">{n === '1' ? key : pluralKey(key)}</span>
        </span>
        {game.settings.value.humanGloss && <span class="si">({humanText(q.dim, q.si, q.digits)})</span>}
      </p>
    );
  }
  const v = p.h.value;
  return (
    <p class="hl-value">
      <span class={`hl-num${typeof v === 'number' ? '' : ' hl-text'}`}>{typeof v === 'number' ? formatNumber(v) : v}</span>
    </p>
  );
}

export function HeadlineBlock(p: { id: string; h: Headline }) {
  return (
    <div class="headline" data-headline={p.id}>
      <GlyphLabel k={p.h.label} gloss={p.h.label} height={16} class="hl-label" />
      <HeadValue h={p.h} />
      <p class="hl-sentence">{p.h.sentence}</p>
    </div>
  );
}

/** The fold under a result. Its open state is the player's showWorking setting, changed through the bus. */
export function Working(p: { children: ComponentChildren; label?: string }) {
  const open = game.settings.value.showWorking;
  return (
    <details
      class="working"
      open={open}
      data-working=""
      onToggle={(e) => {
        const now = (e.currentTarget as HTMLDetailsElement).open;
        if (now !== game.settings.value.showWorking) send({ type: 'settings.set', name: 'showWorking', value: now });
      }}
    >
      <summary>{p.label ?? 'show working'}</summary>
      <div class="working-body">{p.children}</div>
    </details>
  );
}

function Readings(p: { result: readonly Reading[]; style: 'list' | 'dl'; listClass: string }) {
  if (p.result.length === 0) return null;
  if (p.style === 'dl') {
    return (
      <dl class={p.listClass}>
        {p.result.map((r, i) => (
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
    );
  }
  return (
    <ul class={p.listClass} aria-label="Readings written to the codex">
      {p.result.map((r, i) => (
        <li key={i}>
          <span class="k">{r.key}</span> <Value reading={r} />
        </li>
      ))}
    </ul>
  );
}

export interface ResultViewProps {
  id: string;
  attempt: Attempt;
  past: boolean;
  /** The chapter's own classes for the box, for a right and a refused result, and how it writes data-ok. */
  cls: string;
  okCls: string;
  badCls: string;
  okAttr: [string, string];
  /** A "This holds." line above a result without a headline (Arrival and The Spot). */
  verdictClass?: string;
  readings: 'list' | 'dl';
  readingsClass: string;
  /** An "Open it in the codex" button in the working of a confirmed result. */
  codex?: boolean;
}

export function ResultView(p: ResultViewProps) {
  const a = p.attempt;
  const ref = useRef<HTMLDivElement>(null);
  const n = game.records.value[p.id]?.attempts.length ?? 0;
  useEffect(() => {
    const el = ref.current;
    if (el && n > 0) requestAnimationFrame(() => bringIntoColumn(el));
  }, [n]);
  const gloss = game.settings.value.humanGloss;
  const head = a.ok ? headlineOf(HEADLINES[p.id], a) : null;
  const text = renderMessage(a.message, gloss);
  const verdict = a.ok ? null : splitVerdict(text);
  return (
    <div
      ref={ref}
      class={`${p.cls} ${a.ok ? p.okCls : p.badCls} result${head ? ' has-headline' : ''}${p.past ? ' is-past' : ''}`}
      data-result={p.id}
      data-ok={a.ok ? p.okAttr[0] : p.okAttr[1]}
      data-past={p.past ? '1' : '0'}
      role="status"
    >
      {p.past && <PastLabel />}
      {head ? (
        <HeadlineBlock id={p.id} h={head} />
      ) : verdict ? (
        <p class="result-lead" data-lead="">{verdict.lead}</p>
      ) : (
        <>
          {p.verdictClass && <p class={p.verdictClass}>This holds.</p>}
          <p class="result-msg">{text}</p>
        </>
      )}
      {(head || verdict?.rest || a.result.length > 0 || (a.ok && p.codex)) && (
        <Working>
          {head && <p class="result-msg">{text}</p>}
          {verdict?.rest && <p class="result-msg">{verdict.rest}</p>}
          <Readings result={a.result} style={p.readings} listClass={p.readingsClass} />
          {a.ok && p.codex && (
            <button type="button" class="btn small" onClick={() => send({ type: 'codex.open', id: p.id })}>
              Open it in the codex
            </button>
          )}
        </Working>
      )}
    </div>
  );
}
