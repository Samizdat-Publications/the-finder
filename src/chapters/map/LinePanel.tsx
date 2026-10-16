// What the instrument computes for the chosen line and the pulsar the player put on it: the map's period,
// the pulsar's period now, how far its direction and its latitude are from the line and its tick, and the
// match quality (its odds against every other pulsar along the line, D-A16). Before the map is dated
// (map.old) the odds are pass 1's, by period, direction and latitude alone, and a line that is not a pass-1
// anchor says it needs the map's age and origin; once the map is dated, pass 2's odds show (M4 science audit
// finding 1). Young lines wait for the map's age. The map's limits show here as notes where they matter.

import { confirmedSet, game } from '../../game/state';
import { ANCHOR_LOG10_MARGIN } from '../../science/pulsarIdentify';
import { SSD72_SIG_FIGS } from '../../science/pulsars';
import type { EpochModel } from '../shared/epochModel';
import { candidateReadout, isPass1Anchor, lineIsOld, matchOf, PRESELECT_DIRECTION_DEG } from './mapMath';
import { oddsText } from './odds';
import { qty } from './plot';
import { assignments, model, phase, selectedLine } from './state';

/** Old lines that carry their most likely pulsar: three of them give the map's age, which the young lines need. */
export function oldLinesMatched(m: EpochModel, given: Record<string, string>): number {
  return m.lines.filter((l) => lineIsOld(m, l.order) && matchOf(m, l.order).best?.entry.jname === given[String(l.order)]).length;
}

export const OLD_LINES_FOR_AGE = 3;

const REASON = {
  direction: `not considered: its direction is more than ${PRESELECT_DIRECTION_DEG} deg from the line (the pre-selection's tolerance)`,
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
  const dated = confirmedSet.value.has('map.old');
  const pass = dated ? 2 : 1;
  const r = candidateReadout(m, sel, jname, pass);
  const youngWaits = !lineIsOld(m, sel) && (!dated || oldLinesMatched(m, given) < OLD_LINES_FOR_AGE);
  // Before the map is dated only a pass-1 anchor's best candidate stands out on its own (20 to 1).
  const needsAge = !dated && !youngWaits && !r.notConsidered && !(r.best && isPass1Anchor(m, sel));
  const strong = `${Math.round(10 ** ANCHOR_LOG10_MARGIN)} to 1`;
  const quality = r.notConsidered
    ? REASON[r.notConsidered]
    : youngWaits
      ? 'match quality needs the map\'s age first'
      : needsAge
        ? `odds ${oddsText(r.log10Odds as number)} by period and direction alone, under the ${strong} that stands out: this line needs the map's age and origin first`
        : `odds ${oddsText(r.log10Odds as number)}`;
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
        <div class="quality"><dt>match quality</dt><dd data-match-quality={r.notConsidered ?? (youngWaits ? 'waits' : String(r.log10Odds))} data-match-pass={pass} data-needs-age={needsAge ? 'true' : 'false'}>{quality}</dd></div>
      </dl>
      <ul class="map-notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
    </section>
  );
}
