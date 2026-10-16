// A staged moment (M4 step 7e): a short full-screen beat for a big discovery. It dims the instrument, shows the
// instrument's own visual as the backdrop (src/chapters/moments.ts), one large number in the alien's units with
// its glyph label, one sentence, and a caption line naming the sound that plays (the cue's own caption), then
// returns. The screen is opaque: the instrument's visual fills the upper part and the text stands on a plain
// dark strip of its own (nothing shows under the sentence). With the human gloss on, the SI reading sits under
// the number; with it off, the moment's comparison in the alien's own units, where the readings hold one. Skippable: the Continue button, a click anywhere, Escape or any key. Reduced motion: a still, no
// camera moves. It reads game state only; the command bus never sees it, so the game state is unchanged by it.

import { useEffect, useState } from 'preact/hooks';
import { captionFor, confirmationCue } from '../audio/cues';
import { MOMENTS } from '../chapters/moments';
import { ensureParts, loadEpochModel, type EpochModel } from '../chapters/shared/epochModel';
import type { Attempt } from '../game/deductions';
import { game } from '../game/state';
import { GlyphLabel, GlyphSvg } from './Glyph';
import { alienNumber, humanText, pluralKey, unitKeyOf, unitSize } from './message';
import { MOMENT_MS, activeMoment, endMoment, startMoments, type MomentId } from './momentState';

/** The confirmed attempt behind a moment. */
function confirmedAttempt(id: string): Attempt | null {
  return [...(game.records.value[id]?.attempts ?? [])].reverse().find((a) => a.ok) ?? null;
}

/** The epoch model and the parts a moment needs, or null until they are in (they come from the Worker). */
function useModel(id: MomentId): EpochModel | null {
  const parts = MOMENTS[id].parts;
  const [m, setM] = useState<EpochModel | null>(null);
  useEffect(() => {
    if (!parts) return;
    let live = true;
    void loadEpochModel(game.seed.value)
      .then(async (model) => {
        await ensureParts(model, parts);
        if (live) setM(model);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [id]);
  return m;
}

function Body(p: { id: MomentId; n: number }) {
  const def = MOMENTS[p.id];
  const a = confirmedAttempt(p.id);
  const m = useModel(p.id);
  const calm = game.settings.value.reducedMotion;
  const gloss = game.settings.value.humanGloss;
  const q = a ? def.quantity(a, m) : null;
  const compare = a && def.compare ? def.compare(a) : [];
  const cue = captionFor(confirmationCue([p.id]).kind);
  const key = q?.dim ? unitKeyOf(q.dim) : null;
  // A plain count (no dimension) shows as the number alone under its label.
  const num = q ? (q.dim ? alienNumber(q.si / unitSize(q.dim), q.digits) : alienNumber(q.si, q.digits)) : null;
  return (
    <>
      <div class="moment-backdrop">
        {(def.parts === null || m) && <def.Backdrop m={m} reducedMotion={calm} />}
      </div>
      <div class="moment-text">
        <GlyphLabel k={def.label} gloss={def.label} height={22} class="moment-label" />
        <p class="moment-num" data-moment-number={num ?? ''}>
          {num && key ? (
            <>
              <span class="mn">{num}</span>
              <span class="mu">
                <GlyphSvg k={key} height={30} class="unit" />
                <span class="gloss">{num === '1' ? key : pluralKey(key)}</span>
              </span>
            </>
          ) : num ? (
            <span class="mn">{num}</span>
          ) : (
            <span class="mn measuring">measuring</span>
          )}
        </p>
        {gloss && q?.dim && (
          <p class="moment-si" data-moment-si="">
            {humanText(q.dim, q.si, q.digits)}
          </p>
        )}
        <p class="moment-sentence">{a ? def.sentence(a, m) : ''}</p>
        {!gloss && compare.length > 0 && (
          <dl class="moment-compare" data-moment-compare="">
            {compare.map((c) => (
              <div key={c.label}>
                <dt>{c.label}</dt>
                <dd>{c.text}</dd>
              </div>
            ))}
          </dl>
        )}
        {game.settings.value.soundCaptions && cue && <p class="moment-caption">[{cue}]</p>}
      </div>
      <button
        type="button"
        class="btn moment-skip"
        data-moment-skip=""
        onClick={(e) => {
          e.stopPropagation();
          endMoment('button');
        }}
      >
        Continue
      </button>
      {!calm && <div class="moment-timer" style={{ animationDuration: `${MOMENT_MS}ms` }} key={p.n} />}
    </>
  );
}

export function Moment() {
  useEffect(() => startMoments(), []);
  const a = activeMoment.value;
  useEffect(() => {
    if (!a) return;
    const t = window.setTimeout(() => endMoment('timeout'), MOMENT_MS);
    const onKey = (e: KeyboardEvent): void => {
      // Any key returns to the instrument; the key does nothing else (Escape does not also close a drawer).
      e.preventDefault();
      e.stopImmediatePropagation();
      endMoment('key');
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey, { capture: true });
    };
  }, [a?.n]);
  if (!a) return null;
  return (
    <div
      class={`moment${game.settings.value.reducedMotion ? ' still' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="A discovery"
      data-moment={a.id}
      data-moment-n={a.n}
      onClick={() => endMoment('click')}
    >
      <Body key={a.n} id={a.id} n={a.n} />
    </div>
  );
}
