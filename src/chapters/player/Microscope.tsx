// The groove microscope: a window fixed over the disc where the needle drops, magnified until single grooves
// show. The grooves are drawn from the groove model (pitch per side, src/record/groove.ts through physics.ts):
// as the disc turns, every groove under the window moves by one pitch per turn, inward for one direction and
// outward for the other. That is how the direction is found; no arrow on the cover says it. With reduced
// motion the pattern stands still and the rate is given as a number.

import { useEffect, useRef } from 'preact/hooks';
import { groove } from '../../game/model';
import { turntable as T, game } from '../../game/state';
import { Clamp } from '../../ui/Fine';
import { BEAT_S, formatNumber, quantity } from '../../ui/units';
import { PLAYER_SIDE } from './constants';
import { grooveDrift, microscopeGrooves } from './physics';

/** Grooves shown above and below the window's centre (design choice: about nine in view). */
const GROOVES_EACH_SIDE = 4.5;
const W = 320;
const H = 200;

export function Microscope(p: { centreMm: number; reducedMotion: boolean }) {
  const lines = useRef<SVGGElement>(null);
  const stylus = useRef<SVGGElement>(null);
  const centre = useRef(p.centreMm);
  centre.current = p.centreMm;
  const direction = T.direction.value;
  const drift = grooveDrift(groove, PLAYER_SIDE, direction); // mm per turn, signed (negative inward)
  const pitch = Math.abs(drift);
  const half = GROOVES_EACH_SIDE * pitch;
  const pxPerMm = H / (2 * half);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let turns = 0;
    const draw = (now: number): void => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // Disc turns, signed: the playing way (clockwise) positive.
      if (!p.reducedMotion) turns += ((T.direction.value === 'cw' ? 1 : -1) * dt) / T.secondsPerTurn.value;
      const ys = microscopeGrooves(turns, grooveDrift(groove, PLAYER_SIDE, 'cw'), half + pitch);
      const g = lines.current;
      if (g) {
        const kids = g.children;
        for (let i = 0; i < kids.length; i++) {
          const y = ys[i];
          (kids[i] as SVGGElement).setAttribute('transform', y === undefined ? 'translate(0 -999)' : `translate(0 ${(H / 2 - y * pxPerMm).toFixed(2)})`);
        }
      }
      // The stylus, when it is down inside the window: it rides its groove.
      const n = T.needle.value;
      const s = stylus.current;
      if (s) {
        const yMm = n?.down && n.radiusMm != null ? n.radiusMm - centre.current : null;
        const visible = yMm !== null && Math.abs(yMm) < half;
        s.setAttribute('opacity', visible ? '1' : '0');
        if (visible) s.setAttribute('transform', `translate(${W / 2} ${(H / 2 - yMm * pxPerMm).toFixed(2)})`);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [p.reducedMotion, half, pitch, pxPerMm]);

  const count = Math.ceil(2 * (GROOVES_EACH_SIDE + 1)) + 1;
  const q = quantity('length', pitch / 1000);
  const gloss = game.settings.value.humanGloss;
  const turn = quantity('time', T.secondsPerTurn.value);
  return (
    <figure class="microscope" data-microscope={direction} data-drift-mm={drift.toFixed(6)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`The groove under the microscope. Each turn carries it ${drift < 0 ? 'inward' : 'outward'} by one groove.`}>
        <defs>
          <linearGradient id="ms-groove" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#fff2c4" stop-opacity="0.9" />
            <stop offset="0.35" stop-color="#5a3f0c" />
            <stop offset="0.65" stop-color="#2e2005" />
            <stop offset="1" stop-color="#fbe3a0" stop-opacity="0.8" />
          </linearGradient>
          <radialGradient id="ms-field" cx="50%" cy="45%" r="70%">
            <stop offset="0" stop-color="#e2b453" />
            <stop offset="1" stop-color="#8a6218" />
          </radialGradient>
          <clipPath id="ms-clip">
            <rect x="0" y="0" width={W} height={H} rx="10" />
          </clipPath>
        </defs>
        <g clip-path="url(#ms-clip)">
          <rect width={W} height={H} fill="url(#ms-field)" />
          <g ref={lines}>
            {Array.from({ length: count }, (_, i) => (
              <g key={i} transform="translate(0 -999)">
                <rect x="0" y={-pitch * pxPerMm * 0.28} width={W} height={pitch * pxPerMm * 0.56} fill="url(#ms-groove)" />
              </g>
            ))}
          </g>
          <g ref={stylus} opacity="0">
            <path d="M -9 -46 L 9 -46 L 2 -2 L -2 -2 Z" fill="#dcdcf2" fill-opacity="0.85" stroke="#4ff0c4" stroke-width="1" />
            <circle r="2.4" fill="#4ff0c4" />
          </g>
          {/* the reticle: fixed to the turntable, not the disc */}
          <g stroke="#4ff0c4" stroke-opacity="0.7" stroke-width="1" fill="none">
            <line x1={W / 2 - 14} y1={H / 2} x2={W / 2 + 14} y2={H / 2} />
            <line x1={W / 2} y1={H / 2 - 14} x2={W / 2} y2={H / 2 + 14} />
            <circle cx={W / 2} cy={H / 2} r="5" />
          </g>
          <rect x="6" y="5" width="44" height="17" rx="3" fill="#0b0a1f" fill-opacity="0.7" />
          <text x="12" y="17" class="mslabel">rim</text>
          <rect x="6" y={H - 22} width="62" height="17" rx="3" fill="#0b0a1f" fill-opacity="0.7" />
          <text x="12" y={H - 10} class="mslabel">centre</text>
        </g>
        <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="10" fill="none" stroke="#2a2750" />
      </svg>
      <figcaption aria-live="polite">
        <Clamp>
          Each turn carries the groove under the window{' '}
          <strong data-carried={drift < 0 ? 'inward' : 'outward'}>{drift < 0 ? 'inward, toward the centre' : 'outward, toward the rim'}</strong> by one width
          {p.reducedMotion ? ` (${formatNumber(BEAT_S / T.secondsPerTurn.value)} widths per ${turn.unitKey})` : ''}. One groove's width here is{' '}
          <span class="num">{q.number}</span> {q.unitKey}es{gloss && ` (${q.si})`}; a turn takes <span class="num">{turn.number}</span> {turn.unitKey}s
          {gloss && ` (${turn.si})`}.
        </Clamp>
      </figcaption>
    </figure>
  );
}
