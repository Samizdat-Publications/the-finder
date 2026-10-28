// Our Frame, section 6: the line in the run-out groove. The record's centre is drawn (grooves between the radii
// the record's groove model uses, a label, the smooth space between them) and the view slowly closes on that
// space, where one line was etched by hand: "To the makers of music - all worlds, all times". Then the credits
// and the two ways out. The label's size is a schematic choice, not a measurement, and the page says "drawn".
// The record is the section's picture, first and as wide as the stage; the words, the ways out and the credits follow.

import { useEffect, useState } from 'preact/hooks';
import { send } from '../../ui/send';
import { R_INNER_MUSIC_MM, R_OUTER_MUSIC_MM } from '../../record/groove';
import { game } from '../../game/state';
import { epilogue } from './epilogueData';
import { useBox } from './useBox';

/** The disc's radius, mm (a 12-inch record: 152.4 mm). */
const DISC_R = 152.4;
/** The label's drawn radius, mm: schematic (the Voyager label's size is not documented here). */
const LABEL_R = 46;
/** The line sits on a circle in the middle of the smooth space between the label and the innermost groove. */
const TEXT_R = (LABEL_R + R_INNER_MUSIC_MM) / 2;
/** The whole disc, with a little room: centre and the size that must show (mm). */
const FULL = { cx: 0, cy: 0, w: 2 * DISC_R + 8, h: 2 * DISC_R + 8 };
/**
 * The close view: wide enough for the whole line (it runs about 100 mm along its arc at this size, ends some 20 mm
 * below the arc's top) and tall enough for its letters, centred on the arc's upper part.
 */
const CLOSE = { cx: 0, cy: -TEXT_R * 0.7, w: 128, h: 56 };
const ZOOM_MS = 7000;
const START_DELAY_MS = 700;

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (a: number, b: number, t: number): number => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/** A view that shows at least `need` (centre and size, mm) in a box of aspect `aspect` (width over height). */
function fitView(need: { cx: number; cy: number; w: number; h: number }, aspect: number): { x: number; y: number; w: number; h: number } {
  const w = need.w / need.h > aspect ? need.w : need.h * aspect;
  const h = w / aspect;
  return { x: need.cx - w / 2, y: need.cy - h / 2, w, h };
}

function viewBoxAt(t: number, aspect: number): string {
  const e = ease(t);
  const a = fitView(FULL, aspect);
  const b = fitView(CLOSE, aspect);
  return [lerp(a.x, b.x, e), lerp(a.y, b.y, e), lerp(a.w, b.w, e), lerp(a.h, b.h, e)].map((v) => v.toFixed(2)).join(' ');
}

/** Zoom progress 0 to 1 over time; held at 1 when motion is reduced. */
function useZoom(reduced: boolean): number {
  const [t, setT] = useState(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      setT(1);
      return;
    }
    let raf = 0;
    const t0 = performance.now() + START_DELAY_MS;
    const step = (now: number): void => {
      const x = Math.min(1, Math.max(0, (now - t0) / ZOOM_MS));
      setT(x);
      if (x < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);
  return t;
}

function Record(p: { t: number }) {
  const { t } = p;
  // the picture is as wide as the stage; the view keeps the disc round at whatever shape the box has
  const [ref, { w, h }] = useBox<HTMLDivElement>({ w: 960, h: 360 });
  const rings: number[] = [];
  for (let r = R_INNER_MUSIC_MM; r <= R_OUTER_MUSIC_MM; r += 1.4) rings.push(r);
  const arc = `M ${-TEXT_R} 0 A ${TEXT_R} ${TEXT_R} 0 0 1 ${TEXT_R} 0`;
  return (
    <div class="epi-record-box" ref={ref}>
    <svg class="epi-record" viewBox={viewBoxAt(t, w / h)} width={w} height={h} role="img" aria-label={`The centre of the record, drawn, with the line "${epilogue.inscription.text}" etched between the label and the grooves`} data-epilogue-record data-zoom={t.toFixed(3)}>
      <defs>
        <radialGradient id="epi-gold" cx="38%" cy="32%" r="85%">
          <stop offset="0" stop-color="#f1cf7a" />
          <stop offset="0.55" stop-color="#b98a2e" />
          <stop offset="1" stop-color="#6d4f17" />
        </radialGradient>
        <filter id="epi-hand" x="-5%" y="-30%" width="110%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="0.9" />
        </filter>
      </defs>
      <circle cx="0" cy="0" r={DISC_R} fill="url(#epi-gold)" />
      {rings.map((r, i) => (
        <circle key={r} cx="0" cy="0" r={r} fill="none" stroke={i % 2 ? 'rgba(255,240,200,0.20)' : 'rgba(40,24,0,0.30)'} stroke-width="0.32" />
      ))}
      <circle cx="0" cy="0" r={R_INNER_MUSIC_MM - 1.2} fill="none" stroke="rgba(40,24,0,0.38)" stroke-width="0.5" />
      <circle cx="0" cy="0" r={LABEL_R} fill="#1a1530" stroke="rgba(255,240,200,0.5)" stroke-width="0.6" />
      <circle cx="0" cy="0" r={LABEL_R * 0.62} fill="none" stroke="rgba(255,240,200,0.18)" stroke-width="0.4" />
      <circle cx="0" cy="0" r={LABEL_R * 0.3} fill="none" stroke="rgba(255,240,200,0.18)" stroke-width="0.4" />
      <circle cx="0" cy="0" r="3.6" fill="#0b0a1f" />
      <path id="epi-line-arc" d={arc} fill="none" />
      <text
        class="epi-etched"
        font-size="4.6"
        text-anchor="middle"
        letter-spacing="0.3"
        filter="url(#epi-hand)"
        style={{ opacity: smooth(0.5, 0.95, t) }}
        data-epilogue-etched
      >
        <textPath href="#epi-line-arc" startOffset="50%">
          {epilogue.inscription.text}
        </textPath>
      </text>
    </svg>
    </div>
  );
}

export function Line() {
  const reduced = game.settings.value.reducedMotion;
  const t = useZoom(reduced);
  const { inscription, credits } = epilogue;
  return (
    <section class="epi-sec epi-line" data-epilogue-section="line" aria-labelledby="epi-line-h">
      <figure class="epi-picture epi-record-stage" data-epilogue-picture="line">
        <Record t={t} />
        <figcaption class="epi-small center">The centre of the record, drawn, not measured: the proportions are a standard 12-inch disc's and the label's size is a guess.</figcaption>
      </figure>
      <h2 id="epi-line-h" class="epi-head">
        The line in the run-out groove
      </h2>
      <div class="epi-line-text">
        <p class="epi-quote" data-epilogue-inscription>
          {inscription.text}
        </p>
        <p class="epi-lead small" data-epilogue-ferris>
          {inscription.etched} {inscription.ferris}
        </p>
        <p class="epi-links">
          <a class="btn" href="/checked/" target="_blank" rel="noopener" data-epilogue-checked>
            How every step is checked
          </a>
          {!game.tour.value.on && (
            <button type="button" class="btn" data-epilogue-ring onClick={() => send({ type: 'chapter.enter', chapter: 'hub' })}>
              Back to the ring
            </button>
          )}
        </p>
        <div class="epi-credits" data-epilogue-credits>
          <h3>Made possible by</h3>
          <p class="epi-people">
            {credits.people.map((p, i) => (
              <span key={p.name}>
                {i > 0 ? ', ' : ''}
                {p.name}
              </span>
            ))}
            , the committee that made the record.
          </p>
          <ul>
            {credits.sources.map((s) => (
              <li key={s.name}>
                <b>{s.name}</b>: {s.what}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
