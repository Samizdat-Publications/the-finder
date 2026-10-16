// Every message of the slice's checkers (Arrival, The Key, The Player, The Pictures), right and wrong, as the
// chapters' Node tests produce them for the default seed, rendered with the human gloss off: no SI or human unit
// word (tests/support/units.ts); with it on, every quantity in the alien's units with its human reading in
// parentheses, once. Check id: messages.alienUnits.slice. The M4 chapters are messageUnits.m4.test.ts.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import scenarioJson from '../../data/scenario.json';
import { loadCover, loadPulsars, loadStars } from '../../tests/support/data';
import { recordCheck } from '../../tests/support/record';
import { UNIT_AFTER_NUMBER, UNIT_WORDS, messageUnitProblems } from '../../tests/support/units';
import { loadSlice, slicesUnavailable } from '../../tests/support/wav';
import { checkFuelAge, checkHeat, checkMadeNotMined, checkPurpose } from '../chapters/arrival/checkers';
import { CHOICES } from '../chapters/arrival/choices';
import { buildArrival } from '../chapters/arrival/model';
import { checkBinary } from '../chapters/key/binary';
import { TRANSITIONS } from '../chapters/key/physics';
import { checkTimesNotLengths, checkUnit, pulsarRange, type KeyInputs } from '../chapters/key/readings';
import {
  CHECKER_FRAMES, FIRST_FRAMES, checkAspect, checkCircle, checkFirstFrames, checkInterlace, checkLineTime, checkPolarity, checkSync, sliceInfo, type SignalProvider,
} from '../chapters/pictures/checkers';
import { COVER_LINE_S, REFERENCE_SETTINGS, frameSignal, type FrameSignal } from '../chapters/pictures/measure';
import { START_SETTINGS } from '../chapters/pictures/start';
import { checkDirection, checkFirstSound, checkSpeed, checkStart } from '../chapters/player/checkers';
import { FIRST_LINE_S, TRUE_PERIOD_S } from '../chapters/player/physics';
import { R_LEAD_IN_OUTER_MM, R_OUTER_MUSIC_MM } from '../record/groove';
import { parseCoverSvg } from '../chapters/shared/coverSvg';
import { DEFAULT_SEED, type Answer } from '../game/deductions';
import type { ScenarioData } from '../science/types';

const messages: { id: string; text: string }[] = [];
const add = (id: string, r: { message: string }): void => void messages.push({ id, text: r.message });

describe('slice messages in the alien units', () => {
  it('Arrival: every choice of every deduction', () => {
    const m = buildArrival(scenarioJson as unknown as ScenarioData, { ...loadStars(), sky: [] }, DEFAULT_SEED);
    const checks: [string, (a: unknown) => { message: string }][] = [
      ['arrival.purpose', (a) => checkPurpose(a, m)], ['arrival.heat', (a) => checkHeat(a, m)],
      ['arrival.madeNotMined', (a) => checkMadeNotMined(a, m)], ['arrival.fuelAge', (a) => checkFuelAge(a, m)],
    ];
    for (const [id, f] of checks) {
      for (const c of CHOICES[id] ?? []) add(id, f(c.id));
      add(id, f('a telescope'));
    }
    expect(messages.length).toBeGreaterThan(14);
  });

  it('The Key: every reading, transition and choice', () => {
    const svg = parseCoverSvg(readFileSync(resolve(process.cwd(), 'public/media/cover/cover.svg'), 'utf8'));
    const voyager = JSON.parse(readFileSync(resolve(process.cwd(), 'public/media/models/voyager.json'), 'utf8')) as { recordDisc: { radius: number }; extents: { min: number[]; max: number[] } };
    const span = Math.max(...voyager.extents.max.map((v, i) => v - (voyager.extents.min[i] as number)));
    const inputs: KeyInputs = { cover: loadCover(), recordRadiusM: voyager.recordDisc.radius, craftSpanM: span, pulsars: pulsarRange(loadPulsars()) };
    const readings: Answer[] = [{ reading: 'positional', one: 'across' }, { reading: 'positional', one: 'along' }, { reading: 'tally' }, { reading: 'letters' }, { reading: 'decoration' }, 'nonsense'];
    for (const a of readings) add('key.binary', checkBinary(svg.groups, a));
    for (const t of TRANSITIONS) add('key.unit', checkUnit(inputs, t.id));
    add('key.unit', checkUnit(inputs, 'helium'));
    for (const a of ['times', 'lengths', 'neither']) add('key.timesNotLengths', checkTimesNotLengths(inputs, a));
  });

  it('The Player: the right settings and the wrong ones its tests play', () => {
    for (const s of [TRUE_PERIOD_S, 1.8, 60 / 45, 3.47, 5]) add('player.speed', checkSpeed({ secondsPerTurn: s }));
    for (const r of [(R_OUTER_MUSIC_MM + R_LEAD_IN_OUTER_MM) / 2, R_OUTER_MUSIC_MM - 5, 55, 30, 150, 160]) add('player.start', checkStart({ radiusMm: r, secondsPerTurn: 2.4 }));
    for (const d of ['cw', 'ccw']) add('player.direction', checkDirection({ direction: d }));
    const right = { side: 1, secondsPerTurn: TRUE_PERIOD_S, direction: 'cw', down: true, region: 'music', timeS: FIRST_LINE_S + 2, listenedS: 4 };
    for (const a of [right, { ...right, secondsPerTurn: 3.47 }, { ...right, direction: 'ccw' }, { ...right, timeS: 6 }, { ...right, region: 'leadin', timeS: -2 },
      { ...right, region: 'runout', timeS: 3684.31, secondsPerTurn: 2.4 }, { ...right, down: false, region: null, timeS: null }, { ...right, listenedS: 1 }, { ...right, side: 2 }]) {
      add('player.firstSound', checkFirstSound(a));
    }
  });

  const SKIP = slicesUnavailable();
  it.skipIf(SKIP !== null)('The Pictures: right and wrong settings on the real tape', () => {
    const cache = new Map<string, FrameSignal>();
    const all: SignalProvider = (f) => {
      let s = cache.get(f);
      if (!s) {
        s = frameSignal(sliceInfo(f), loadSlice(f).samples);
        cache.set(f, s);
      }
      return s;
    };
    for (const f of CHECKER_FRAMES) all(f);
    const lt = COVER_LINE_S * 1000;
    for (const ms of [lt, START_SETTINGS.lineTimeMs]) add('pictures.lineTime', checkLineTime(all, { lineTimeMs: ms }));
    for (const syncLock of [true, false]) add('pictures.sync', checkSync(all, { lineTimeMs: lt, syncLock }));
    for (const interlace of [true, false]) add('pictures.interlace', checkInterlace(all, { interlace }));
    for (const polarity of ['negative', 'positive']) add('pictures.polarity', checkPolarity(all, { polarity }));
    for (const rows of [REFERENCE_SETTINGS.rows, 512]) add('pictures.aspect', checkAspect(all, { rows }));
    add('pictures.circle', checkCircle(all, { ...REFERENCE_SETTINGS }));
    add('pictures.circle', checkCircle(all, { ...START_SETTINGS }));
    add('pictures.firstFrames', checkFirstFrames(all, { watched: [...FIRST_FRAMES], settings: { ...REFERENCE_SETTINGS } }));
    add('pictures.firstFrames', checkFirstFrames(all, { watched: [], settings: { ...REFERENCE_SETTINGS } }));
  }, 120_000);

  it('none shows a human unit with the gloss off; each quantity shows its human reading once with it on', () => {
    const problems = messages.flatMap((m) => messageUnitProblems(m.text).map((p) => `${m.id}: ${p}`));
    const ids = [...new Set(messages.map((m) => m.id))];
    recordCheck({
      id: 'messages.alienUnits.slice',
      claim: 'Every result message of Arrival, The Key, The Player and The Pictures writes its quantities in the alien\'s units when the human gloss is off, and adds the human reading in parentheses when it is on.',
      measured: `${messages.length} messages from ${ids.length} deductions, right and wrong answers: ${problems.length} problems${problems.length ? `: ${problems.slice(0, 3).join(' | ')}` : ''}${SKIP ? ` (The Pictures skipped: ${SKIP})` : ''}`,
      expected: `no unit word with the gloss off (${UNIT_WORDS.length} words anywhere, ${UNIT_AFTER_NUMBER.length} symbols after a number); one human reading per quantity with it on`,
      tolerance: 'exact',
      pass: problems.length === 0,
    });
    expect(problems).toEqual([]);
  });
});
