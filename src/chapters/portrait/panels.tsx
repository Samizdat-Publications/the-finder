// The six panels of Portrait's plate, each a part of the Finder's portrait of the senders read from the player's
// own confirmed results (no new facts): every line is a short sentence around a reading or a message quantity of
// a confirmed attempt, in the Finder's units (the human reading beside it when the gloss is on), with a small
// link to the How it's checked row of the deduction it came from. A line whose deduction is not confirmed (an old
// save) shows an empty outline. The pictures are decoded from the tape (pictures.ts; rule 2).

import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import type { Attempt } from '../../game/deductions';
import { nodeDef } from '../../game/graph';
import { game } from '../../game/state';
import { compose } from '../../dsp/colour';
import { GlyphLabel, GlyphSvg } from '../../ui/Glyph';
import { alienNumber, humanText, messageTokens, pluralKey, unitKeyOf, unitSize, type MsgDim } from '../../ui/message';
import { REACH_M } from '../../ui/units';
import { album } from '../pictures/album';
import { BARRY_TO_CW, HEIGHTS, TEACHING, UNITS, frameRow } from '../pictures/checkersM5';
import { Crop, Numerals } from '../pictures/Crop';
import { FIGURES_FRAME, WORLD_FRAMES, WORLD_GREY, developingForPlate, worldComposed } from './pictures';
import { lastOk, reading } from './state';

export type PanelId = 'star' | 'look' | 'world' | 'numbers' | 'voices' | 'machine';

/** The panels' titles, also the keys of their glyph words. */
export const PANEL_TITLES: Record<PanelId, string> = {
  star: 'Their star',
  look: 'How they look',
  world: 'Their world',
  numbers: 'Their numbers',
  voices: 'Their voices',
  machine: 'Their machine',
};

const ordinal = (n: number): string => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
const num = (a: Attempt, key: string): number | null => {
  const v = reading(a, key);
  return typeof v === 'number' ? v : null;
};
const text = (a: Attempt, key: string): string => String(reading(a, key) ?? '');

/** A quantity in the Finder's units: the number, its unit's glyph and name, and the human reading with the gloss on. */
function Qty(p: { dim: MsgDim; si: number; digits?: number }) {
  const key = unitKeyOf(p.dim);
  const n = alienNumber(p.si / unitSize(p.dim), p.digits);
  return (
    <span class="pt-q">
      <span class="pt-qn">
        <span class="num">{n}</span>
        <GlyphSvg k={key} height={14} class="unit" />
        <span class="unitname">{n === '1' ? key : pluralKey(key)}</span>
      </span>
      {game.settings.value.humanGloss && <span class="si">({humanText(p.dim, p.si, p.digits)})</span>}
    </span>
  );
}

/** A reading of a confirmed attempt as a quantity (its SI value and dimension), or nothing. */
function R(p: { a: Attempt; k: string; digits?: number }) {
  const r = p.a.result.find((x) => x.key === p.k);
  return r && r.dim && typeof r.value === 'number' ? <Qty dim={r.dim} si={r.value} digits={p.digits} /> : null;
}

/** The small link to a deduction's How it's checked row. */
function Checked(p: { node: string }) {
  const row = nodeDef(p.node)?.checkedRow;
  if (!row) return null;
  return (
    <a class="pt-check" href={`/checked/#row-${row}`} target="_blank" rel="noopener" data-checked-link={p.node} title={`How it's checked: row ${row}`} aria-label={`How it's checked, row ${row}`}>
      <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
        <circle cx="6" cy="6" r="5" />
        <path d="M3.4 6.2 5.2 8 8.7 4.2" />
      </svg>
    </a>
  );
}

/** One line of a panel, read from the node's confirmed attempt; an empty outline if there is none. */
function Line(p: { node: string; children: (a: Attempt) => ComponentChildren; class?: string }) {
  const a = lastOk(p.node);
  if (!a) {
    return (
      <p class="pt-line pt-empty" data-line={p.node}>
        <span class="pt-outline" role="img" aria-label="not confirmed yet" />
      </p>
    );
  }
  return (
    <p class={`pt-line ${p.class ?? ''}`} data-line={p.node}>
      {p.children(a)}
      <Checked node={p.node} />
    </p>
  );
}

function Panel(p: { id: PanelId; children: ComponentChildren; class?: string }) {
  return (
    <section class={`pt-panel pt-${p.id} ${p.class ?? ''}`} data-portrait-panel={p.id} aria-label={PANEL_TITLES[p.id]}>
      <header class="pt-head">
        <GlyphLabel k={PANEL_TITLES[p.id]} gloss={PANEL_TITLES[p.id]} height={20} />
      </header>
      <div class="pt-body">{p.children}</div>
    </section>
  );
}

/** A frame not developed yet: its outline, then the picture (pictures.ts develops it). */
function PicOutline(p: { frame: string; ratio: number }) {
  const now = developingForPlate.value === p.frame;
  return (
    <span class="pt-picwait" style={{ aspectRatio: String(p.ratio) }} data-pic-wait={p.frame}>
      <span class="note small">{now ? 'developing from the tape' : 'waiting for the tape'}</span>
    </span>
  );
}

// ---- 1. Their star ----
export function StarPanel() {
  const origin = lastOk('trail.origin');
  const name = origin ? reading(origin, 'star') : undefined;
  return (
    <Panel id="star">
      <p class="pt-name" data-star-name={typeof name === 'string' ? name : ''}>
        {typeof name === 'string' ? name : <span class="pt-outline wide" />}
        {origin && <Checked node="trail.origin" />}
      </p>
      <Line node="trail.neighbour">
        {(a) => {
          const t = messageTokens(a.message)[0];
          return t ? (
            <>
              <Qty dim={t.dim} si={t.si} digits={3} /> from yours
            </>
          ) : null;
        }}
      </Line>
      <Line node="trail.neighbour">
        {(a) => {
          const near = num(a, 'rank by distance');
          const bright = num(a, 'rank by brightness');
          return (
            <>
              {near === 1 ? 'your nearest star' : near ? `your ${ordinal(near)} nearest star` : ''}
              {bright ? `, ${bright === 1 ? 'the brightest' : `the ${ordinal(bright)} brightest`} in your sky` : ''}
            </>
          );
        }}
      </Line>
      <Line node="trail.origin">{() => <>the machine flew straight away from it</>}</Line>
    </Panel>
  );
}

// ---- 2. How they look ----
/** The two figures upright beside one of the Finder's reaches, to the same scale (as the height moment). */
function Figures() {
  const pic = album.value[FIGURES_FRAME];
  const tall = TEACHING.L039.heights.find((h) => h.value === Math.max(...HEIGHTS.map((x) => x.cm)))!;
  const mid = (r: number[]): number => ((r[0] as number) + (r[2] as number)) / 2;
  const spanPx = Math.abs(mid(tall.ticks[1]!) - mid(tall.ticks[0]!));
  const reachPx = (spanPx * REACH_M) / (Number(tall.value) * (UNITS.cm as number));
  const turns = BARRY_TO_CW[frameRow(FIGURES_FRAME).orientationBarry] ?? 0;
  // upright, the picture is its decoded width tall; the feet stand on the bar's far end tick
  const tallPx = (pic?.width ?? 536) as number;
  const wide = (pic?.height ?? 355) as number;
  const feetGapPx = tallPx - Math.max(...tall.ticks.map((t) => t[2] as number));
  return (
    <div class="pt-figures">
      {pic ? <Crop frame={FIGURES_FRAME} label="the two figures, upright, decoded from the tape" scale={1} turns={turns} class="pt-pic" /> : <PicOutline frame={FIGURES_FRAME} ratio={wide / tallPx} />}
      <div class="pt-reachcol" aria-label="one of your reaches, to the same scale">
        <div class="pt-reach" style={{ height: `${(100 * reachPx) / tallPx}%`, bottom: `${(100 * feetGapPx) / tallPx}%` }} />
        <span class="pt-reachname">one reach</span>
      </div>
    </div>
  );
}

export function LookPanel() {
  return (
    <Panel id="look" class="pt-withpic">
      <Figures />
      <div class="pt-lines">
        <Line node="pictures.height">
          {(a) => (
            <>
              the taller <R a={a} k="taller figure" digits={3} />
            </>
          )}
        </Line>
        <Line node="pictures.height">
          {(a) => (
            <>
              the shorter <R a={a} k="shorter figure" digits={3} />
            </>
          )}
        </Line>
      </div>
    </Panel>
  );
}

// ---- 3. Their world ----
function WorldPicture() {
  const colour = worldComposed();
  const pics = colour ? WORLD_FRAMES.map((f) => album.value[f]) : [];
  const ready = colour && pics.length === 3 && pics.every(Boolean);
  const ref = useRef<HTMLCanvasElement>(null);
  const c = useMemo(() => (ready ? compose(pics[0]!, pics[1]!, pics[2]!) : null), [ready, ...pics]);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx || !c) return;
    cv.width = c.width;
    cv.height = c.height;
    const img = ctx.createImageData(c.width, c.height);
    img.data.set(c.rgba);
    ctx.putImageData(img, 0, 0);
  }, [c]);
  const grey = album.value[WORLD_GREY];
  if (c) return <canvas ref={ref} class="pt-pic pt-world" role="img" aria-label="Their world in colour: three frames stacked as red, green and blue light, decoded from the tape" data-world="colour" />;
  if (!colour && grey) return <Crop frame={WORLD_GREY} label="Their world, one grey frame decoded from the tape" scale={1} class="pt-pic pt-world" />;
  return <PicOutline frame={colour ? (WORLD_FRAMES.find((f) => !album.value[f]) ?? WORLD_FRAMES[0]!) : WORLD_GREY} ratio={536 / 355} />;
}

export function WorldPanel() {
  return (
    <Panel id="world" class="pt-withpic">
      <WorldPicture />
      <div class="pt-lines">
        <Line node="pictures.home">
          {(a) => {
            const place = num(a, 'place outward');
            return <>{place ? `the ${ordinal(place)} world out from their star` : ''}</>;
          }}
        </Line>
        <Line node="pictures.home">
          {(a) => (
            <>
              <R a={a} k="distance from their star" digits={3} /> from it
            </>
          )}
        </Line>
        <Line node="pictures.home">
          {(a) => (
            <>
              its mass is {text(a, 'mass')}, its day {text(a, 'day')}: the units they measure every world in
            </>
          )}
        </Line>
      </div>
    </Panel>
  );
}

// ---- 4. Their numbers ----
export function NumbersPanel() {
  return (
    <Panel id="numbers">
      <Line node="pictures.numerals" class="pt-base">
        {(a) => {
          const base = num(a, 'their base');
          return base ? (
            <>
              they count in <Numerals value={base} height={18} />, a place for each power
            </>
          ) : null;
        }}
      </Line>
      <Line node="pictures.units">
        {(a) => (
          <>
            their second is <R a={a} k="their second" digits={4} />
          </>
        )}
      </Line>
      <Line node="pictures.units">
        {(a) => (
          <>
            their metre is <R a={a} k="their metre" digits={4} />
          </>
        )}
      </Line>
    </Panel>
  );
}

// ---- 5. Their voices ----
export function VoicesPanel() {
  return (
    <Panel id="voices">
      <Line node="voices.many">{(a) => <>many voices, {text(a, 'stretches of voice between pauses')} stretches of them between pauses</>}</Line>
      <Line node="voices.octave">
        {(a) => (
          <>
            music that comes back at a ratio of {text(a, 'repeating ratio')}, cut into {text(a, 'steps in it')} equal steps
          </>
        )}
      </Line>
      <Line node="voices.others">
        {(a) => (
          <>
            others call in their world, the longest call <R a={a} k="longest call" digits={3} />
          </>
        )}
      </Line>
    </Panel>
  );
}

// ---- 6. Their machine ----
export function MachinePanel() {
  return (
    <Panel id="machine">
      <Line node="arrival.purpose">{() => <>{nodeDef('arrival.purpose')?.gloss}</>}</Line>
      <Line node="arrival.fuelAge">
        {(a) => (
          <>
            made: its heat source <R a={a} k="age" digits={3} /> ago
          </>
        )}
      </Line>
      <Line node="player.speed">
        {(a) => (
          <>
            its record turns once in <R a={a} k="turn time set" digits={4} />
          </>
        )}
      </Line>
    </Panel>
  );
}
