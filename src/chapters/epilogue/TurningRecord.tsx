// Our Frame, section 1's companion: the record turning while the Cavatina plays. The disc turns clockwise at the
// speed the cover gives (one turn every COVER_PERIOD_S seconds, from the cover's etched binary), and the needle
// rests where the turntable's own needle is (the bus's needle state, the groove model's radius for the Cavatina
// while it loads). The proportions are a standard 12-inch disc's and the label's size is drawn, as in Line.tsx.
// It turns only while the needle is down and motion is not reduced; otherwise it is a still.

import { useComputed } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { COVER_PERIOD_S } from '../../game/model';
import { game, turntable } from '../../game/state';
import { R_INNER_MUSIC_MM, R_OUTER_MUSIC_MM } from '../../record/groove';
import { epilogue } from './epilogueData';
import { lastTrack } from './recordSound';

const DISC_R = 152.4;
const LABEL_R = 46;
const TEXT_R = (LABEL_R + R_INNER_MUSIC_MM) / 2;
/** The tonearm's pivot, mm, beside the disc (drawing only). */
const PIVOT = { x: 150, y: -150 };

/** The stylus point on the disc for a needle at radius r: on the arc the arm sweeps, so the arm never changes length. */
function stylusAt(r: number): { x: number; y: number } {
  const armLen = Math.hypot(PIVOT.x, PIVOT.y) - 8;
  // Intersection of the circle |p| = r with the circle |p - PIVOT| = armLen, the one nearer the viewer's right.
  const d = Math.hypot(PIVOT.x, PIVOT.y);
  const a = (r * r - armLen * armLen + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r * r - a * a));
  const ux = PIVOT.x / d;
  const uy = PIVOT.y / d;
  return { x: a * ux + h * uy, y: a * uy - h * ux };
}

export function TurningRecord() {
  const spin = useRef<SVGGElement>(null);
  const angle = useRef(0);
  const reduced = game.settings.value.reducedMotion;
  // Computed, so the drawing follows the needle without redrawing on every needle update (radius to 0.2 mm).
  const down = useComputed(() => turntable.needle.value?.down === true).value;
  const r = useComputed(() => Math.round((turntable.needle.value?.radiusMm ?? lastTrack().radiusMm) * 5) / 5).value;
  const tip = stylusAt(r);

  useEffect(() => {
    if (reduced || !down || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    // Carry on from where the disc stopped, so a lifted and dropped needle never snaps it back.
    const t0 = performance.now() - (angle.current / 360) * COVER_PERIOD_S * 1000;
    const step = (now: number): void => {
      angle.current = (((now - t0) / 1000 / COVER_PERIOD_S) * 360) % 360;
      spin.current?.setAttribute('transform', `rotate(${angle.current.toFixed(2)})`);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [reduced, down]);

  const rings: number[] = [];
  for (let g = R_INNER_MUSIC_MM; g <= R_OUTER_MUSIC_MM; g += 2.2) rings.push(g);
  const arc = `M ${-TEXT_R} 0 A ${TEXT_R} ${TEXT_R} 0 0 1 ${TEXT_R} 0`;
  const rpm = 60 / COVER_PERIOD_S;
  return (
    <figure class="epi-turning" data-epilogue-turning data-spinning={down && !reduced ? 'true' : 'false'}>
      <svg viewBox="-160 -172 340 332" role="img" aria-label={`The record turning at its own speed, ${rpm.toFixed(1)} turns a minute, with the needle in the last piece of music`}>
        <defs>
          <radialGradient id="epi-turn-gold" cx="38%" cy="32%" r="85%">
            <stop offset="0" stop-color="#f1cf7a" />
            <stop offset="0.55" stop-color="#b98a2e" />
            <stop offset="1" stop-color="#6d4f17" />
          </radialGradient>
        </defs>
        <circle r={DISC_R + 3} fill="none" stroke="rgba(241,207,122,0.12)" stroke-width="6" />
        <circle r={DISC_R} fill="url(#epi-turn-gold)" />
        {rings.map((g, i) => (
          <circle key={g} r={g} fill="none" stroke={i % 2 ? 'rgba(255,240,200,0.16)' : 'rgba(40,24,0,0.26)'} stroke-width="0.5" />
        ))}
        <g ref={spin} transform={`rotate(${angle.current.toFixed(2)})`}>
          <circle r={LABEL_R} fill="#1a1530" stroke="rgba(255,240,200,0.5)" stroke-width="0.8" />
          <circle r={LABEL_R * 0.62} fill="none" stroke="rgba(255,240,200,0.18)" stroke-width="0.6" />
          <path d={`M 0 ${-LABEL_R * 0.62} L 0 ${-LABEL_R * 0.92}`} stroke="rgba(241,207,122,0.55)" stroke-width="1.2" stroke-linecap="round" />
          <path id="epi-turn-arc" d={arc} fill="none" />
          <text class="epi-etched" font-size="4.6" text-anchor="middle" letter-spacing="0.3">
            <textPath href="#epi-turn-arc" startOffset="50%">
              {epilogue.inscription.text}
            </textPath>
          </text>
        </g>
        <circle r="3.6" fill="#0b0a1f" />
        <g class="epi-arm">
          <line x1={PIVOT.x} y1={PIVOT.y} x2={tip.x} y2={tip.y} stroke="rgba(220,226,240,0.75)" stroke-width="2.4" stroke-linecap="round" />
          <circle cx={PIVOT.x} cy={PIVOT.y} r="7" fill="#2a2846" stroke="rgba(220,226,240,0.6)" stroke-width="1.2" />
          <circle cx={tip.x} cy={tip.y} r="2.6" fill={down ? '#ffe7a3' : 'rgba(220,226,240,0.75)'} />
        </g>
      </svg>
      <figcaption class="epi-small center">
        Turning at its own speed: one turn every {COVER_PERIOD_S.toFixed(1)} seconds, the time etched on its cover. Drawn, not measured.
      </figcaption>
    </figure>
  );
}
