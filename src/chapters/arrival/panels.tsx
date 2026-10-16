// The three scans' panels: structure, heat and isotopes. Every number comes from the model (model.ts), which
// computes it from the scenario, the star catalogue and the science; nothing here is typed in (rule 1).

import type { ComponentChildren } from 'preact';
import { game } from '../../game/state';
import { GlyphLabel, GlyphSvg, Value } from '../../ui/Glyph';
import { UNIT_KEY, formatSI, quantity, quantityText, superscript, type Dim } from '../../ui/units';
import { AnswerBox } from './AnswerBox';
import { sig } from './checkers';
import { DISH_DIAMETER_M, MAG_BOOM_M, RTG_CYLINDER } from './constants';
import type { ArrivalModel } from './model';
import { leftoverEstimate } from './physics';


/** A range in the alien's unit (one unit glyph), with the SI range under the human gloss. */
export function Range(p: { dim: Dim; lo: number; hi: number }) {
  return (
    <span class="value range">
      <span class="num">
        {quantity(p.dim, p.lo).number} to {quantity(p.dim, p.hi).number}
      </span>
      <GlyphSvg k={UNIT_KEY[p.dim]} height={15} class="unit" />
      {game.settings.value.humanGloss && (
        <span class="si">
          {' '}
          ({formatSI(p.dim, p.lo)} to {formatSI(p.dim, p.hi)})
        </span>
      )}
    </span>
  );
}

function Reading(p: { k: string; children: ComponentChildren; title?: string }) {
  return (
    <li title={p.title}>
      <span class="k">{p.k}</span>
      <span class="v">{p.children}</span>
    </li>
  );
}

export function StructurePanel(p: { m: ArrivalModel }) {
  return (
    <section class="ar-panel" aria-label="Structure scan" data-panel="structure">
      <h2>
        <GlyphLabel k="structure scan" gloss="Structure scan" height={24} />
      </h2>
      <ul class="ar-list">
        <Reading k="Great dish">
          a paraboloid, metal, with something held at its focus; <Value reading={{ key: 'dish', value: DISH_DIAMETER_M, dim: 'length' }} /> across
        </Reading>
        <Reading k="Its surface">true to its shape within millimetres; it scatters your lamps diffusely (rough at the scale of light)</Reading>
        <Reading k="Where it points">
          back along the path the machine came, within {sig(p.m.dishVsPathBackDeg, 2)} degrees; the bright warm-white star sits there
        </Reading>
        <Reading k="Booms">
          one thin boom <Value reading={{ key: 'boom', value: MAG_BOOM_M, dim: 'length' }} /> long; a shorter one carrying a platform of lenses; a third
          carrying three cylinders
        </Reading>
        <Reading k="A disc">fixed to the body, its face toward you, etched all over</Reading>
      </ul>
      <AnswerBox id="arrival.purpose" prompt="What is the great dish for?" showPrompt />
    </section>
  );
}

export function HeatPanel(p: { m: ArrivalModel }) {
  const { low, high } = p.m.heatW;
  const tLow = leftoverEstimate(low).surfaceK;
  const tHigh = leftoverEstimate(high).surfaceK;
  const gloss = game.settings.value.humanGloss;
  const assumptions =
    `Low: radon escapes the fuel, so the heat of radium-226's short-lived daughters (${quantityText('power', high - low, gloss)}) is lost. ` +
    `High: radon is retained. Both assume the plutonium that was not plutonium-238 had the Cassini mix; ` +
    `its plutonium-239 gives ${quantityText('power', p.m.pu239HeatW, gloss)} of the total.`;
  return (
    <section class="ar-panel" aria-label="Heat scan" data-panel="heat">
      <h2>
        <GlyphLabel k="heat scan" gloss="Heat scan" height={24} />
      </h2>
      <ul class="ar-list">
        <Reading k="Warm bodies">three cylinders, one boom, nothing else above the sky's cold</Reading>
        <Reading k="Total heat output" title={assumptions}>
          <span data-heat-low={low} data-heat-high={high}>
            <Range dim="power" lo={low} hi={high} />
          </span>{' '}
          <span class="assume" tabIndex={0} title={assumptions}>
            (two assumptions: hover or focus)
          </span>
        </Reading>
        <Reading k="Each cylinder">
          <Range dim="power" lo={low / 3} hi={high / 3} />
        </Reading>
        <Reading k="Their surface">
          <Range dim="temperature" lo={tLow} hi={tHigh} />, as black bodies radiating that power from {RTG_CYLINDER.count} cylinders{' '}
          <Value reading={{ key: 'd', value: RTG_CYLINDER.diameterM, dim: 'length' }} /> across and{' '}
          <Value reading={{ key: 'l', value: RTG_CYLINDER.lengthM, dim: 'length' }} /> long
        </Reading>
        <Reading k="The dish">
          <Value reading={{ key: 'dish', value: p.m.estimates.dishK, dim: 'temperature' }} />, the sky's own temperature
        </Reading>
      </ul>
      <p class="ar-small">{assumptions}</p>
      <AnswerBox id="arrival.heat" prompt="What warms the cylinders?" />
    </section>
  );
}

const LOG_MIN = -6; // the spectrum's floor: atom fraction 1e-6

export function SpectrumChart(p: { m: ArrivalModel }) {
  const lines = p.m.spectrum;
  const W = 340;
  const H = 204;
  const padL = 36;
  const padB = 40;
  const bw = (W - padL - 6) / lines.length;
  const y = (f: number): number => {
    const l = Math.max(LOG_MIN, Math.log10(Math.max(f, 1e-30)));
    return 8 + ((0 - l) / (0 - LOG_MIN)) * (H - padB - 8);
  };
  return (
    <svg class="ar-spectrum" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mass spectrum of the cylinders' material: atom fraction by mass number, logarithmic">
      {[0, -1, -2, -3, -4, -5, -6].map((e) => (
        <g key={e}>
          <line x1={padL} x2={W - 4} y1={y(10 ** e)} y2={y(10 ** e)} class="grid" />
          <text x={padL - 4} y={y(10 ** e) + 3} class="tick" text-anchor="end">
            {e === 0 ? '1' : `10${superscript(e)}`}
          </text>
        </g>
      ))}
      {lines.map((l, i) => {
        const x = padL + 3 + i * bw;
        const top = y(l.fraction);
        const hot = l.mass === 234 || l.mass === 238;
        return (
          <g key={l.mass} data-mass={l.mass}>
            {l.fraction > 10 ** LOG_MIN && <rect x={x} y={top} width={bw - 5} height={H - padB - top} class={hot ? 'bar hot' : 'bar'} />}
            <text x={x + (bw - 5) / 2} y={H - padB + 13} class="tick" text-anchor="middle">
              {l.mass}
            </text>
          </g>
        );
      })}
      <text x={padL + (W - padL) / 2} y={H - 2} class="axis" text-anchor="middle">
        mass number (atomic mass units)
      </text>
    </svg>
  );
}

export function IsotopePanel(p: { m: ArrivalModel }) {
  const meas = p.m.measurement;
  const frac = (mass: number): number => p.m.spectrum.find((l) => l.mass === mass)?.fraction ?? 0;
  return (
    <section class="ar-panel" aria-label="Isotope scan" data-panel="isotopes">
      <h2>
        <GlyphLabel k="isotope scan" gloss="Isotope scan" height={24} />
      </h2>
      <SpectrumChart m={p.m} />
      <ul class="ar-list">
        <Reading k="Mass 234 (uranium-234)">{sig(frac(234) * 100, 3)}% of the atoms</Reading>
        <Reading k="Mass 238 (uranium-238)">{sig(frac(238) * 100, 2)}% of the atoms</Reading>
        <Reading k="Uranium-238 per uranium-234">
          {sig(meas.u238OverU234, 3)} (plus or minus {meas.relativePrecision * 100}%, 1 sigma)
        </Reading>
        <Reading k="Thorium-230 per uranium-234">
          {sig(meas.th230OverU234, 3)} (plus or minus {meas.relativePrecision * 100}%)
        </Reading>
      </ul>
      {game.settings.value.humanGloss && <p class="ar-small">Atom fractions from a seeded simulated measurement of the real fuel's computed inventory.</p>}
      <AnswerBox id="arrival.madeNotMined" prompt="Where did this uranium come from?" />
    </section>
  );
}
