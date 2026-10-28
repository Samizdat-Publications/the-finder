// Our Frame, section 4: the real Gliese 445 pass. Our number is computed live from the Gaia DR3 star table and
// the Horizons state of Voyager 1 (src/science/epoch.ts); beside it the published ones from data/epilogue.json,
// and a drawing of the Sun, Voyager 1's path, Gliese 445's path and the closest approach (future.ts says how the
// flat drawing keeps every distance true). The drawing is the section's picture, first and as large as the stage
// allows at its true shape, with its key beside it; the table follows.

import { useMemo } from 'preact/hooks';
import { epilogue, nearStars, scenario } from './epilogueData';
import { sig } from './format';
import { LY_PER_PC, futureDiagram, type FutureDiagram, type Pt } from './future';

const W = 480;
const H = 380;
const PAD = { l: 36, r: 36, t: 34, b: 44 };

/** Pixel mapping that keeps the two axes at the same scale (true shape). */
function mapper(f: FutureDiagram): { px: (p: Pt) => Pt; scalePx: number } {
  const w = f.box.x1 - f.box.x0;
  const h = f.box.y1 - f.box.y0;
  const s = Math.min((W - PAD.l - PAD.r) / w, (H - PAD.t - PAD.b) / h);
  const ox = PAD.l + ((W - PAD.l - PAD.r) - w * s) / 2;
  const oy = H - PAD.b - ((H - PAD.t - PAD.b) - h * s) / 2;
  return { px: (p) => [ox + (p[0] - f.box.x0) * s, oy - (p[1] - f.box.y0) * s], scalePx: s };
}

const d = (pts: Pt[]): string => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');

function Diagram(p: { f: FutureDiagram }) {
  const { f } = p;
  const { px, scalePx } = useMemo(() => mapper(f), [f]);
  const sun = px(f.sun);
  const c = px(f.craftAtApproach);
  const h = px(f.homeAtApproach);
  const first = px(f.homePath[0] as Pt);
  const last = px(f.homePath[f.homePath.length - 1] as Pt);
  const axisEnd = px([f.box.x1, 0]);
  const barPc = 0.25;
  const barPx = barPc * scalePx;
  const mid: Pt = [(c[0] + h[0]) / 2, (c[1] + h[1]) / 2];
  const ad = (t: number): string => `AD ${sig(t, 3)}`;
  return (
    <svg class="epi-diagram" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="A drawing of the Sun, Voyager 1's path, Gliese 445's path and their closest approach" data-epilogue-diagram>
      <path class="line-of-flight" d={d([sun, axisEnd])} />
      <path class="v1-path" d={d(f.craftPath.map(px))} />
      <path class="gl-path" d={d(f.homePath.map(px))} />
      <line class="gap" x1={c[0]} y1={c[1]} x2={h[0]} y2={h[1]} />
      <circle class="sun" cx={sun[0]} cy={sun[1]} r="6" />
      <text class="lab" x={sun[0]} y={sun[1] - 14} text-anchor="middle">
        Sun
      </text>
      <circle class="v1-dot" cx={c[0]} cy={c[1]} r="5" />
      <text class="lab v1" x={(c[0] + axisEnd[0]) / 2} y={c[1] + 24} text-anchor="middle">
        Voyager 1's path
      </text>
      <circle class="gl-dot" cx={first[0]} cy={first[1]} r="3.5" />
      <text class="lab gl" x={first[0] + 8} y={first[1] + 4}>
        {ad(f.years[0] as number)}
      </text>
      <circle class="gl-dot" cx={last[0]} cy={last[1]} r="3.5" />
      <text class="lab gl" x={last[0] - 8} y={last[1] + 4} text-anchor="end">
        {ad(f.years[f.years.length - 1] as number)}
      </text>
      <text class="lab gl" x={Math.min(first[0], last[0]) - 16} y={(first[1] + h[1]) / 2} text-anchor="end">
        Gliese 445's path
      </text>
      <circle class="gl-dot big" cx={h[0]} cy={h[1]} r="6" />
      <text class="lab gap" x={Math.min(c[0], h[0]) - 12} y={mid[1] + 4} text-anchor="end">
        closest approach: {sig(f.minDistPc, 3)} pc
      </text>
      <g transform={`translate(${PAD.l} ${H - 12})`}>
        <line class="bar" x1="0" y1="0" x2={barPx} y2="0" />
        <line class="bar" x1="0" y1="-4" x2="0" y2="4" />
        <line class="bar" x1={barPx} y1="-4" x2={barPx} y2="4" />
        <text class="lab dim" x={barPx + 8} y="4">
          {barPc} pc = {sig(barPc * LY_PER_PC, 2)} light-years
        </text>
      </g>
    </svg>
  );
}

export function Future() {
  const f = useMemo(() => futureDiagram(scenario, nearStars), []);
  const pub = epilogue.gliese445.published[0];
  const nasa = epilogue.gliese445.nasaPopular;
  const ad = (t: number): string => `AD ${sig(t, 3)}`;
  return (
    <section class="epi-sec epi-future" data-epilogue-section="future" aria-labelledby="epi-future-h">
      <figure class="epi-picture epi-future-pic" data-epilogue-picture="future">
        <Diagram f={f} />
        <figcaption class="epi-legend">
          <p class="epi-key">
            <span class="sw v1" aria-hidden="true" />
            <span>Voyager 1, flying out from the Sun along its line of flight</span>
          </p>
          <p class="epi-key">
            <span class="sw gl" aria-hidden="true" />
            <span>
              Gliese 445, the Finder's star, from {ad(f.years[0] as number)} to {ad(f.years[f.years.length - 1] as number)}
            </span>
          </p>
          <p class="epi-key">
            <span class="sw gap" aria-hidden="true" />
            <span>
              Closest approach: {sig(f.minDistPc, 3)} pc ({sig(f.minDistLy, 2)} light-years), about {ad(f.adYear)}
            </span>
          </p>
          <p class="epi-small" data-epilogue-diagram-note>
            Drawn flat, to scale: across is the distance along Voyager 1's line of flight, up is the distance from that line. Every distance to the Sun, and every distance between Voyager 1 and the star, is true;
            only the direction around the line is dropped.
          </p>
        </figcaption>
      </figure>
      <h2 id="epi-future-h" class="epi-head">
        The slow future
      </h2>
      <p class="epi-lead small">That is where this story was set.</p>
      <table class="epi-table compact" data-epilogue-pass>
        <thead>
          <tr>
            <th scope="col">Who</th>
            <th scope="col">Closest</th>
            <th scope="col">When</th>
          </tr>
        </thead>
        <tbody>
          <tr data-pass="ours">
            <th scope="row">This game, from Gaia DR3</th>
            <td data-pass-distance>
              {sig(f.minDistPc, 3)} pc ({sig(f.minDistLy, 2)} light-years)
            </td>
            <td data-pass-years={Math.round(f.yearsAfterLaunch)}>
              {sig(f.yearsAfterLaunch, 3)} years after launch, about AD {sig(f.adYear, 3)}
            </td>
          </tr>
          {pub && (
            <tr data-pass="published">
              <th scope="row">{pub.who}</th>
              <td>
                {pub.pc} pc ({sig(pub.lightYears, 2)} light-years)
              </td>
              <td data-pass-from={pub.fromYear}>{(pub.years / 1000).toFixed(1)} thousand years from about {pub.fromYear}</td>
            </tr>
          )}
          <tr data-pass="nasa">
            <th scope="row">NASA, popular wording</th>
            <td>about {nasa.lightYears} light-years</td>
            <td>about {nasa.years.toLocaleString('en-US')} years</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
