// The Pictures' three staged moments (M5 step 3), each on the instrument's own visual decoded from the tape:
// the first colour picture blooming from its three greys (pictures.colour); their world among its circles, ringed
// (pictures.home); the two figures upright beside one of the Finder's reaches (pictures.height). The number is the
// confirmed result's own reading; the sentence carries no number but a rank read from the result. Reduced motion:
// a still.

import { useEffect, useMemo, useRef } from 'preact/hooks';
import type { Attempt } from '../../game/deductions';
import { compose } from '../../dsp/colour';
import { game } from '../../game/state';
import { REACH_M } from '../../ui/units';
import type { MomentDef } from '../moments';
import { album } from './album';
import { BARRY_TO_CW, HEIGHTS, HOME, TEACHING, UNITS, frameRow } from './checkersM5';
import { Crop } from './Crop';

const lastOk = (id: string): Attempt | undefined => [...(game.records.value[id]?.attempts ?? [])].reverse().find((x) => x.ok);
const reading = (a: Attempt, key: string): number | string | undefined => a.result.find((r) => r.key === key)?.value;

function ColourBackdrop(p: { reducedMotion: boolean }) {
  const a = lastOk('pictures.colour');
  const frames = (a?.answer as { frames?: string[] } | undefined)?.frames ?? [];
  const pics = frames.map((f) => album.value[f]);
  const ref = useRef<HTMLCanvasElement>(null);
  const c = useMemo(() => (pics.length === 3 && pics.every(Boolean) ? compose(pics[0]!, pics[1]!, pics[2]!) : null), [frames.join()]);
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
  return (
    <div class={`pm-colour${p.reducedMotion ? ' still' : ''}`} data-moment-backdrop="pictures.colour">
      <div class="pm-greys">
        {frames.map((f, i) => (
          <div key={f} class={`pm-grey g${i}`}>
            <Crop frame={f} label={`frame ${f}, one of the three`} scale={0.42} />
          </div>
        ))}
      </div>
      <canvas ref={ref} class="pm-bloom" role="img" aria-label="The three frames stacked as red, green and blue light: a colour picture" />
    </div>
  );
}

function HomeBackdrop(p: { reducedMotion: boolean }) {
  return (
    <div class={`pm-home${p.reducedMotion ? ' still' : ''}`} data-moment-backdrop="pictures.home">
      {TEACHING.table.columns.map((c) => (
        <div key={c.index} class={`pm-circle${c.index === HOME ? ' home' : ''}`}>
          <Crop frame={c.frame} region={c.circle} label={c.index === HOME ? 'their world, ringed' : 'a circle of their table'} scale={c.index === 0 ? 1.2 : 2.6} maxWidth={190} />
        </div>
      ))}
    </div>
  );
}

function HeightBackdrop(p: { reducedMotion: boolean }) {
  // The taller figure's scale bar runs between its two end ticks (data/teaching.json, measured on the decode):
  // that many pixels are its height through their centimetre, so one reach is this many pixels on the frame.
  const tall = TEACHING.L039.heights.find((h) => h.value === Math.max(...HEIGHTS.map((x) => x.cm)))!;
  const mid = (r: number[]): number => ((r[0] as number) + (r[2] as number)) / 2;
  const spanPx = Math.abs(mid(tall.ticks[1]!) - mid(tall.ticks[0]!));
  const reachPx = (spanPx * REACH_M) / (Number(tall.value) * (UNITS.cm as number));
  // as large as the backdrop allows: the picture stands 536 decoded pixels tall once upright
  const scale = Math.min(1.1, (window.innerHeight * 0.6) / 536);
  const turns = BARRY_TO_CW[frameRow('L039').orientationBarry] ?? 0;
  // the feet: the far end tick of the bar (native x, which the clockwise turn makes the height); the reach stands
  // on the same line, so the card below the tick is left under the bar too
  const feetGapPx = 536 - Math.max(...tall.ticks.map((t) => t[2] as number));
  return (
    <div class={`pm-height${p.reducedMotion ? ' still' : ''}`} data-moment-backdrop="pictures.height">
      <Crop frame="L039" label="the two figures, upright" scale={scale} turns={turns} />
      <div class="pm-reach" style={{ height: `${reachPx * scale}px`, marginBottom: `${feetGapPx * scale}px` }} aria-label="one of your reaches, to the same scale">
        <span>one reach</span>
      </div>
    </div>
  );
}

const nth = (n: number): string => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

export const PICTURE_MOMENTS: Record<'pictures.colour' | 'pictures.home' | 'pictures.height', MomentDef> = {
  'pictures.colour': {
    label: 'one picture in three',
    sentence: () => 'Three passes of the tape, stacked as three colours of light: one picture of their world.',
    quantity: (a) => {
      const v = reading(a, 'tape time of the three');
      return typeof v === 'number' ? { dim: 'time', si: v, digits: 3 } : null;
    },
    parts: null,
    Backdrop: ({ reducedMotion }) => <ColourBackdrop reducedMotion={reducedMotion} />,
  },
  'pictures.home': {
    label: 'home from its star',
    sentence: (a) => {
      const place = reading(a, 'place outward');
      return typeof place === 'number' ? `Their world, the ${nth(place)} out from their star: the one they measured all the others against.` : 'Their world: the one they measured all the others against.';
    },
    quantity: (a) => {
      const v = reading(a, 'distance from their star');
      return typeof v === 'number' ? { dim: 'length', si: v, digits: 3 } : null;
    },
    parts: null,
    Backdrop: ({ reducedMotion }) => <HomeBackdrop reducedMotion={reducedMotion} />,
  },
  'pictures.height': {
    label: 'the taller of them',
    sentence: () => 'Beside one of your reaches, the two who sent it.',
    quantity: (a) => {
      const v = reading(a, 'taller figure');
      return typeof v === 'number' ? { dim: 'length', si: v, digits: 3 } : null;
    },
    parts: null,
    Backdrop: ({ reducedMotion }) => <HeightBackdrop reducedMotion={reducedMotion} />,
  },
};
