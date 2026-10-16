// What the instrument computes for the chosen line and the pulsar the player put on it: the map's period,
// the pulsar's period now, how far its direction and its latitude are from the line and its tick, and the
// match quality (its odds against every other pulsar along the line, D-A16). Young lines wait for the map's
// age (three old lines matched). The map's limits show here as notes where they matter.

import { game } from '../../game/state';
import { SSD72_SIG_FIGS } from '../../science/pulsars';
import type { EpochModel } from '../shared/epochModel';
import { candidateReadout, lineIsOld, matchOf, PRESELECT_DIRECTION_DEG } from './mapMath';
import { oddsText } from './odds';
import { qty } from './plot';
import { assignments, model, phase, selectedLine } from './state';

/** Old lines that carry their most likely pulsar: three of them give the map's age, which the young lines need. */
export function oldLinesMatched(m: EpochModel, given: Record<string, string>): number {
  return m.lines.filter((l) => lineIsOld(m, l.order) && matchOf(m, l.order).best?.entry.jname === given[String(l.order)]).length;
}

export const OLD_LINES_FOR_AGE = 3;

const REASON = {
  direction: `not considered: its direction is more than ${PRESELECT_DIRECTION_DEG} deg from the line`,
  age: 'not considered: no age the Arrival clock allows brings its period to the map\'s number',
};

export function LinePanel() {
  const m = model.value;
  const sel = selectedLine.value;
  const given = assignments.value;
  const gloss = game.settings.value.humanGloss;
  if (!m || phase.value === 'loading' || sel === null) {
    return (
      <section class="map-tool map-line" aria-live="polite">
        <p class="note">{m ? 'Choose a line to see how a pulsar fits it.' : 'Your catalogues are loading.'}</p>
      </section>
    );
  }
  const line = m.lines.find((l) => l.order === sel)!;
  const jname = given[String(sel)];
  const figs = SSD72_SIG_FIGS[line.label1972];
  const notes: string[] = [];
  if (figs !== undefined) notes.push(`This number was written to more figures than its makers knew: it is good to about ${figs}.`);
  if (line.absZOverR0 === null) notes.push('The tick on this line is too close to its end to read: no latitude.');
  else notes.push('The tick gives the height from the plane, not on which side.');
  if (!jname) {
    return (
      <section class="map-tool map-line" data-line-panel={sel} aria-live="polite">
        <p class="note">Line {sel} has no pulsar yet: click the one it points to on the chart.</p>
        <ul class="map-notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
      </section>
    );
  }
  const r = candidateReadout(m, sel, jname);
  const youngWaits = !lineIsOld(m, sel) && oldLinesMatched(m, given) < OLD_LINES_FOR_AGE;
  const quality = r.notConsidered ? REASON[r.notConsidered] : youngWaits ? 'match quality needs the map\'s age first' : `odds ${oddsText(r.log10Odds as number)}`;
  return (
    <section class="map-tool map-line" data-line-panel={sel} data-pulsar={jname} aria-live="polite">
      <p class="map-linecap">
        Line {sel} and PSR {r.bname ?? r.jname}
      </p>
      <dl class="map-readout">
        <div><dt>the map's period</dt><dd>{qty('time', r.mapPeriodS, gloss)}</dd></div>
        <div><dt>its period now</dt><dd>{qty('time', r.periodNowS, gloss)}</dd></div>
        <div><dt>direction off the line</dt><dd>{r.dLonDeg.toFixed(2)} deg</dd></div>
        <div><dt>latitude off the tick</dt><dd>{r.dLatDeg === null ? 'no tick to read' : `${r.dLatDeg.toFixed(2)} deg`}</dd></div>
        <div class="quality"><dt>match quality</dt><dd data-match-quality={r.notConsidered ?? (youngWaits ? 'waits' : String(r.log10Odds))}>{quality}</dd></div>
      </dl>
      <ul class="map-notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
    </section>
  );
}
