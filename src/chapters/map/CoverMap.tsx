// The cover's map beside the chart: the centre line and the 14 lines as etched on the rebuilt cover (gold,
// the human artifact), each one selectable, with a row of line buttons below. The selected line's number is
// read through the key the player found: a count of hydrogen periods, as a time in the alien's unit.

import svgText from '../../../public/media/cover/cover.svg?raw';
import { game } from '../../game/state';
import { binaryToSeconds, parseCoverBinary } from '../../science/units';
import { formatNumber } from '../../ui/units';
import { qty } from './plot';
import { parseCoverMap } from './coverGeom';
import { assignments, model, selectedLine } from './state';

const geom = parseCoverMap(svgText);
const PAD = 4;
const [x0, y0, x1, y1] = geom.box;
const VIEW = `${x0 - PAD} ${y0 - PAD} ${x1 - x0 + 2 * PAD} ${y1 - y0 + 2 * PAD}`;
const pts = (p: [number, number][]): string => p.map((q) => `${q[0]},${q[1]}`).join(' ');

export function CoverMap() {
  const sel = selectedLine.value;
  const given = assignments.value;
  const m = model.value;
  const gloss = game.settings.value.humanGloss;
  const line = m && sel !== null ? m.lines.find((l) => l.order === sel) : undefined;
  return (
    <section class="map-cover" aria-label="The cover's map">
      <svg class="map-cover-svg" viewBox={VIEW} preserveAspectRatio="xMidYMid meet" role="group" aria-label="The cover's map: one point, fifteen lines">
        {geom.lines.map((l) => (
          <g key={l.order} class={`map-cl${l.order === sel ? ' sel' : ''}${given[String(l.order)] ? ' given' : ''}${l.order === 0 ? ' gc' : ''}`} data-cover-line={l.order}>
            {l.paths.map((p, i) => (
              <polyline key={i} points={pts(p.pts)} stroke-width={p.width} class={`map-cp ${p.kind}`} />
            ))}
            {l.order > 0 && (
              <line
                class="map-hit"
                x1={geom.origin[0]}
                y1={geom.origin[1]}
                x2={l.tip[0]}
                y2={l.tip[1]}
                onClick={() => (selectedLine.value = l.order)}
                data-select-line={l.order}
              />
            )}
            {l.order === sel && (
              <circle cx={l.tip[0]} cy={l.tip[1]} r={1.6} class="map-tipmark" />
            )}
          </g>
        ))}
      </svg>
      <div class="map-linebtns" role="group" aria-label="Lines">
        {(m?.lines ?? []).map((l) => (
          <button
            key={l.order}
            type="button"
            class={`map-lb${l.order === sel ? ' sel' : ''}${given[String(l.order)] ? ' given' : ''}`}
            aria-pressed={l.order === sel}
            data-line-button={l.order}
            onClick={() => (selectedLine.value = l.order)}
          >
            {l.order}
          </button>
        ))}
      </div>
      <p class="map-read" data-line-reading={sel ?? ''}>
        {line
          ? `Line ${line.order}: ${formatNumber(parseCoverBinary(line.binary))} spin flips = ${qty('time', binaryToSeconds(line.binary), gloss)}`
          : 'Choose a line to read its number through the key.'}
      </p>
    </section>
  );
}
