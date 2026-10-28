// Portrait's end: the staged moment of portrait.together, and the sky strip the plate keeps afterwards. The moment
// is the Finder's own sky (trail.neighbour's SkyBackdrop: its brightest stars seen from its measured place, from
// the epoch model): the warm-white star brightens a little, a gold ring closes on it, and its name appears in the
// Finder's glyph script with the gloss "the senders' star"; the number is the clocks' combined time, read from the
// confirmed result. Reduced motion: the final picture, still. The strip is the same sky as a band across the top
// of the plate, cropped around the ringed star. Nothing here changes game state.

import { signal } from '@preact/signals';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Attempt } from '../../game/deductions';
import { game } from '../../game/state';
import { GlyphSvg } from '../../ui/Glyph';
import { GLYPH_H, glyphWord } from '../../ui/glyphs';
import type { MomentDef } from '../moments';
import { useSize } from '../map/plot';
import { ensureParts, loadEpochModel, type EpochModel } from '../shared/epochModel';
import { SkyBackdrop, skyStars } from '../trail/moments';

/** The glyph key of the warm-white star's new name. */
export const SENDERS_STAR = "the senders' star";

const reading = (a: Attempt, key: string): number | string | undefined => a.result.find((r) => r.key === key)?.value;

/** The gold ring, the brightened star and its glyph name, drawn at the star's place on a sky (SVG units). */
function SendersMark(p: { x: number; y: number; r: number; still: boolean; small?: boolean; left?: boolean }) {
  const ring = p.small ? 11 : 22;
  const gh = p.small ? 14 : 34;
  // the name sits to the right of the star, or to its left (right-aligned) when the star is near the right edge
  const word = glyphWord(SENDERS_STAR);
  const gw = ((word.width + 6) / (GLYPH_H + 6)) * gh;
  const gap = ring + 8;
  return (
    <g class={`pt-senders${p.still ? ' still' : ''}${p.small ? ' small' : ''}`} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`} data-senders-star="">
      <circle class="pt-glow" r={p.r * (p.small ? 2.4 : 3.2)} />
      <circle class="pt-core" r={p.r * 1.15} />
      <circle class="pt-ring" r={ring} pathLength={1} />
      <g class="pt-starname" transform={`translate(${p.left ? -gap : gap} ${-gh / 2 - (p.small ? 2 : 8)})`}>
        <g transform={`translate(${p.left ? -gw : 0} 0)`}>
          <GlyphSvg k={SENDERS_STAR} height={gh} class="pt-starglyph" />
        </g>
        <text x={0} y={gh + (p.small ? 11 : 18)} class="pt-stargloss" text-anchor={p.left ? 'end' : 'start'}>
          {SENDERS_STAR}
        </text>
      </g>
    </g>
  );
}

function SendersSky(p: { m: EpochModel | null; reducedMotion: boolean }) {
  return (
    <div class={`pt-moment${p.reducedMotion ? ' still' : ''}`} data-moment-backdrop="portrait.together">
      <SkyBackdrop m={p.m} ring={false} overlay={(t) => <SendersMark x={t.x} y={t.y} r={t.r} still={p.reducedMotion} left={t.x > t.w * 0.72} />} />
    </div>
  );
}

/** Free play: the full-stage sky, opened by the strip's "See the sky" button and closed by "Back to the plate". */
export const skyOpen = signal(false);

/**
 * The full-stage sky: the plate gives way to the Finder's sky at stage size, the warm-white star ringed and named,
 * the sky drifting slowly and its stars twinkling (both held still with reduced motion). The tour's "They live
 * there" stop shows it by itself; in free play `onBack` adds a way back to the plate.
 */
export function FullSky(p: { onBack?: () => void }) {
  const m = useSkyModel();
  const still = game.settings.value.reducedMotion;
  return (
    <div class={`pt-fullsky${still ? ' still' : ''}`} data-full-sky={m ? 'ready' : 'waiting'}>
      <div class="pt-skydrift">
        <SkyBackdrop m={m} ring={false} overlay={(t) => <SendersMark x={t.x} y={t.y} r={t.r} still={still} left={t.x > t.w * 0.72} />} />
      </div>
      {p.onBack && (
        <button type="button" class="btn pt-skyback" data-sky-back="" onClick={p.onBack}>
          Back to the plate
        </button>
      )}
    </div>
  );
}

export const PORTRAIT_MOMENTS: Record<'portrait.together', MomentDef> = {
  'portrait.together': {
    label: 'when it left',
    sentence: () => 'They live there. They sent it about this long ago.',
    quantity: (a) => {
      const v = reading(a, 'when it left');
      return typeof v === 'number' ? { dim: 'time', si: v, digits: 3 } : null;
    },
    parts: ['trail'],
    Backdrop: SendersSky,
  },
};

/** The epoch model with its trail (the sky needs the origin star), or null until it is in (from the Worker). */
function useSkyModel(): EpochModel | null {
  const [m, setM] = useState<EpochModel | null>(null);
  const seed = game.seed.value;
  useEffect(() => {
    let live = true;
    void loadEpochModel(seed)
      .then(async (model) => {
        await ensureParts(model, ['trail']);
        if (live) setM(model);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [seed]);
  return m;
}

/** The plate's top strip after the moment: a band of the Finder's sky around the senders' star, ringed in gold. */
export function SkyStrip() {
  const m = useSkyModel();
  const [ref, size] = useSize<HTMLDivElement>();
  const sky = useMemo(() => (m ? skyStars(m) : null), [m]);
  const w = size.w;
  const h = size.h;
  const target = sky?.find((s) => s.origin);
  // The Hammer map at the strip's width, then cropped to the strip's height around the ringed star.
  const R = w / 2.1;
  const ty = target ? -target.xy[1] * (R / 2) : 0;
  const at = (xy: [number, number]): [number, number] => [w / 2 + xy[0] * R, h / 2 - xy[1] * (R / 2) - ty];
  return (
    <div class="pt-strip" ref={ref} data-sky-strip={target ? 'ready' : 'waiting'}>
      <button type="button" class="pt-seesky" data-see-sky="" onClick={() => (skyOpen.value = true)}>
        See the sky
      </button>
      {sky && target && w > 0 && (
        <svg width={w} height={h} role="img" aria-label="Your sky, with the senders' star ringed in gold">
          <line class="pt-stripplane" x1={0} x2={w} y1={h / 2 - ty} y2={h / 2 - ty} />
          {sky.map((s) => {
            const [x, y] = at(s.xy);
            const r = Math.max(1.2, 5 - 0.9 * s.mag);
            // a star the strip's edge would cut is left out rather than drawn half
            if (y < r + 1 || y > h - r - 1) return null;
            return <circle key={s.id} class="pt-skystar" cx={x} cy={y} r={r} style={{ fill: s.rgb }} />;
          })}
          {(() => {
            const [x, y] = at(target.xy);
            return <SendersMark x={x} y={y} r={Math.max(1.2, 5 - 0.9 * target.mag)} still small left={x > w * 0.8} />;
          })()}
        </svg>
      )}
    </div>
  );
}
