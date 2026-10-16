// key.unit and key.timesNotLengths: the cover's numbers read with a chosen hydrogen transition, as times
// and as lengths, and the checks that tell a physical reading from an absurd one. Every number comes from
// data/cover.json (through src/science/units.ts), the alien's pulsar catalogue (data/pulsars.json) and the
// craft model (public/media/models/voyager.json); none is typed here. Pure.

import type { Answer, CheckResult, Reading } from '../../game/deductions';
import type { CoverData, PulsarCatalogue } from '../../science/types';
import { binaryToMetres, binaryToSeconds, parseCoverBinary } from '../../science/units';
import { TRANSITIONS, burstRimSpeed, rimSpeed, transition, type Transition } from './physics';

export interface CoverNumberRef {
  /** English key (glyph label). */
  key: string;
  /** Where it is on the cover, in plain words. */
  where: string;
  binary: string;
}

/** The cover's numbers that are in the hydrogen unit (the line labels and the raster's 512 are counts). */
export function coverNumbers(cover: CoverData): CoverNumberRef[] {
  return [
    { key: 'round the disc', where: 'written round the drawing of the disc', binary: cover.record.rotationPeriod.binary },
    { key: 'beside the disc', where: 'written between two tall bars beside the disc seen edge on', binary: cover.record.playTime.binary },
    { key: 'under the line', where: 'written under the first line of the signal drawing', binary: cover.picture.lineTime.binary },
    ...cover.pulsarMap.lines.map((l) => ({ key: `map line ${l.order}`, where: `along line ${l.order} of the star map`, binary: l.binary })),
  ];
}

export interface PulsarRange {
  /** Pulsars with a measured period. */
  count: number;
  minS: number;
  maxS: number;
}

/** The shortest and longest periods in the catalogue (P0, or 1/F0 when P0 is missing), s. */
export function pulsarRange(cat: PulsarCatalogue): PulsarRange {
  let count = 0;
  let minS = Infinity;
  let maxS = -Infinity;
  for (const p of cat.pulsars) {
    const P = p.p0 ?? (p.f0 ? 1 / p.f0 : null);
    if (P === null || !Number.isFinite(P) || P <= 0) continue;
    count++;
    if (P < minS) minS = P;
    if (P > maxS) maxS = P;
  }
  return { count, minS, maxS };
}

export interface KeyInputs {
  cover: CoverData;
  /** Radius of the disc the alien holds, m (voyager.json recordDisc.radius). */
  recordRadiusM: number;
  /** The craft's largest extent along any axis, m (voyager.json extents). */
  craftSpanM: number;
  /** null while the catalogue is still loading. */
  pulsars: PulsarRange | null;
}

export interface UnitReading {
  transition: Transition;
  turnS: number;
  sideS: number;
  lineS: number;
  mapS: number[];
  mapInRange: number;
  rimMS: number;
  burstMS: number;
  /** Physical: every map number is a period some known pulsar has, and the disc can turn that fast. */
  physical: boolean;
}

export function readWithUnit(t: Transition, inp: KeyInputs, range: PulsarRange): UnitReading {
  const s = (b: string): number => parseCoverBinary(b) / t.hz;
  const mapS = inp.cover.pulsarMap.lines.map((l) => s(l.binary));
  const mapInRange = mapS.filter((p) => p >= range.minS && p <= range.maxS).length;
  const turnS = s(inp.cover.record.rotationPeriod.binary);
  const rimMS = rimSpeed(inp.recordRadiusM, turnS);
  const burstMS = burstRimSpeed();
  return {
    transition: t,
    turnS,
    sideS: s(inp.cover.record.playTime.binary),
    lineS: s(inp.cover.picture.lineTime.binary),
    mapS,
    mapInRange,
    rimMS,
    burstMS,
    physical: mapInRange === mapS.length && rimMS < burstMS,
  };
}

const sig = (x: number, n = 3): string => {
  const v = Number(x.toPrecision(n));
  return Math.abs(v) >= 1e6 || Math.abs(v) < 1e-3 ? v.toExponential(n - 1).replace('e+', 'e') : v.toLocaleString('en-US', { maximumFractionDigits: 12 });
};

/** A time in plain human units (for the checker's English message; the interface shows the alien's units). */
export function humanTime(s: number): string {
  if (s < 1e-6) return `${sig(s * 1e9)} ns`;
  if (s < 1e-3) return `${sig(s * 1e6)} microseconds`;
  if (s < 1) return `${sig(s * 1e3)} ms`;
  if (s < 120) return `${sig(s)} s`;
  return `${sig(s / 60)} minutes`;
}

export function humanLength(m: number): string {
  if (m < 1) return `${sig(m * 100)} cm`;
  if (m < 1000) return `${sig(m)} m`;
  if (m < 1e9) return `${sig(m / 1000)} km`;
  return `${sig(m / 1e9)} million km`;
}

function unitResult(r: UnitReading, n: number): Reading[] {
  return [
    { key: 'transition', value: r.transition.key },
    { key: 'one turn of the disc', value: r.turnS, dim: 'time' },
    { key: 'rim speed over bursting speed', value: Number((r.rimMS / r.burstMS).toPrecision(3)) },
    { key: 'map numbers among known pulsars', value: `${r.mapInRange} of ${r.mapS.length}` },
    { key: 'pulsars in the catalogue', value: n },
  ];
}

/** The checker for key.unit. The answer is a transition id. */
export function checkUnit(inp: KeyInputs, answer: Answer): CheckResult {
  const t = typeof answer === 'string' ? transition(answer) : undefined;
  if (!t) return { ok: false, result: [], message: `Choose a transition from the atlas: ${TRANSITIONS.map((x) => x.key).join(', ')}.` };
  if (!inp.pulsars) throw new Error('the pulsar catalogue is still loading; try again in a moment');
  const r = readWithUnit(t, inp, inp.pulsars);
  const result = unitResult(r, inp.pulsars.count);
  const range = `${humanTime(inp.pulsars.minS)} to ${humanTime(inp.pulsars.maxS)}`;
  if (r.physical) {
    return {
      ok: true,
      result,
      message: `With the ${t.key} transition as the unit, all ${r.mapS.length} map numbers are periods real pulsars have (${humanTime(Math.min(...r.mapS))} to ${humanTime(Math.max(...r.mapS))}, inside the catalogue's ${range}), and the disc turns once in ${humanTime(r.turnS)}, its rim at ${sig(r.rimMS)} m/s, a speed a hand could build. The unit is hydrogen's spin flip, the transition the cover draws.`,
    };
  }
  const fast = r.rimMS / r.burstMS;
  return {
    ok: false,
    result,
    message: `With the ${t.key} transition as the unit, the disc would turn once every ${humanTime(r.turnS)}: its rim at ${sig(r.rimMS)} m/s, ${sig(fast, 2)} times faster than a copper disc can spin without tearing apart. ${r.mapInRange === 0 ? 'None' : `Only ${r.mapInRange}`} of the ${r.mapS.length} map numbers fall among the ${inp.pulsars.count.toLocaleString('en-US')} known pulsars (${range}): the rest would be stars spinning impossibly fast.`,
  };
}

// ---- times or lengths ----

/** A length reading is absurd when it is larger than the craft by at least this factor (three orders of magnitude). */
export const ABSURD_FACTOR = 1000;

export interface TimeLengthRow {
  key: string;
  where: string;
  n: number;
  seconds: number;
  metres: number;
}

export interface TimesLengths {
  rows: TimeLengthRow[];
  /** Smallest length reading over the craft's largest extent. */
  smallestOverCraft: number;
  lengthsAbsurd: boolean;
  timesPhysical: boolean;
  /** Supporting facts for "physical": the turn's rim speed, map numbers in range, turns per side, lines per turn. */
  rimMS: number;
  burstMS: number;
  mapInRange: number;
  turnsPerSide: number;
  linesPerTurn: number;
}

/** Every cover number read with the hydrogen spin flip, as a time (periods) and as a length (wavelengths). */
export function timesAndLengths(inp: KeyInputs, range: PulsarRange): TimesLengths {
  const rows = coverNumbers(inp.cover).map((c) => ({
    key: c.key,
    where: c.where,
    n: parseCoverBinary(c.binary),
    seconds: binaryToSeconds(c.binary),
    metres: binaryToMetres(c.binary),
  }));
  const hyper = TRANSITIONS.find((t) => t.id === 'hyperfine') as Transition;
  const u = readWithUnit(hyper, inp, range);
  const smallest = Math.min(...rows.map((r) => r.metres));
  const smallestOverCraft = smallest / inp.craftSpanM;
  const turnsPerSide = u.sideS / u.turnS;
  const linesPerTurn = u.turnS / u.lineS;
  return {
    rows,
    smallestOverCraft,
    lengthsAbsurd: smallestOverCraft >= ABSURD_FACTOR,
    timesPhysical: u.physical && turnsPerSide > 1 && linesPerTurn > 1,
    rimMS: u.rimMS,
    burstMS: u.burstMS,
    mapInRange: u.mapInRange,
    turnsPerSide,
    linesPerTurn,
  };
}

/** The checker for key.timesNotLengths. The answer is 'times' or 'lengths'. */
export function checkTimesNotLengths(inp: KeyInputs, answer: Answer): CheckResult {
  if (answer !== 'times' && answer !== 'lengths') return { ok: false, result: [], message: 'Choose: the numbers are times, or they are lengths.' };
  if (!inp.pulsars) throw new Error('the pulsar catalogue is still loading; try again in a moment');
  const tl = timesAndLengths(inp, inp.pulsars);
  const row = (k: string): TimeLengthRow => tl.rows.find((r) => r.key === k) as TimeLengthRow;
  const turn = row('round the disc');
  const side = row('beside the disc');
  const line = row('under the line');
  const disc = 2 * inp.recordRadiusM;
  const result: Reading[] = [
    { key: 'round the disc as a length', value: turn.metres, dim: 'length' },
    { key: 'round the disc as a time', value: turn.seconds, dim: 'time' },
    { key: 'under the line as a length', value: line.metres, dim: 'length' },
    { key: 'under the line as a time', value: line.seconds, dim: 'time' },
    { key: 'beside the disc as a time', value: side.seconds, dim: 'time' },
    { key: 'the disc in hand', value: disc, dim: 'length' },
    { key: 'smallest length over the craft', value: Number(tl.smallestOverCraft.toPrecision(3)) },
  ];
  const ok = answer === 'times' && tl.lengthsAbsurd && tl.timesPhysical;
  if (ok) {
    return {
      ok,
      result,
      message: `As times they make sense: the disc turns once in ${humanTime(turn.seconds)}, a side lasts ${humanTime(side.seconds)} (${Math.round(tl.turnsPerSide)} turns), a picture line ${humanTime(line.seconds)}, and all ${tl.mapInRange} map numbers are pulsar periods. As lengths every one is at least ${sig(tl.smallestOverCraft, 2)} times the size of the whole craft. The numbers are times.`,
    };
  }
  return {
    ok: false,
    result,
    message: `As lengths, the number round the disc would be ${humanLength(turn.metres)} for a disc you hold in your hand (${humanLength(disc)} across), and the picture line ${humanLength(line.metres)}; the smallest of all the cover's numbers is ${sig(tl.smallestOverCraft, 2)} times the size of the whole craft (${humanLength(inp.craftSpanM)}). No drawing measures things that size.`,
  };
}
