// The Player's four checkers (player.speed, player.start, player.direction, player.firstSound). Each computes
// its verdict from the cover's turn time (data/cover.json), the record model (src/record/) and the tape's
// measured line period (data/decoder.json), and reports what the wrong answer does to the sound, as the
// physics says (PLAN.md "Principles": every wrong answer produces a meaningful wrong result). Pure: no DOM.

import coverJson from '../../../data/cover.json';
import { registerChecker, type Answer, type CheckResult, type Checker, type Reading } from '../../game/deductions';
import { groove } from '../../game/model';
import { PLAYING_DIRECTION, type Direction, type Region } from '../../record/groove';
import { binaryToSeconds } from '../../science/units';
import { q } from '../../ui/message';
import { LISTEN_S, LINES_HEARD_S, PLAYER_SIDE, SPEED_STEP_S } from './constants';
import { FIRST_LINE_S, TRUE_PERIOD_S, grooveDrift, hear, semitones, speedRatio, spotAt, type TurntableReading } from './physics';

export const PLAYER_NODE_IDS = ['player.speed', 'player.start', 'player.direction', 'player.firstSound'] as const;

/** The cover's picture line time, s (8.34 ms: cover.md 1c), for comparison with what the stylus hears. */
const COVER_LINE_S = binaryToSeconds(coverJson.picture.lineTime.binary);

function obj(answer: Answer, what: string): Record<string, Answer> {
  if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) throw new Error(`${what}: the answer must be an object`);
  return answer;
}

function num(o: Record<string, Answer>, key: string, what: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${what}: ${key} must be a number`);
  return v;
}

function dir(o: Record<string, Answer>, what: string): Direction {
  const v = o.direction;
  if (v !== 'cw' && v !== 'ccw') throw new Error(`${what}: direction must be "cw" or "ccw"`);
  return v;
}

const fmt = (x: number, d = 3): string => x.toFixed(d);
const shift = (k: number): string => {
  const s = semitones(k);
  return `${Math.abs(s).toFixed(2)} semitones ${s >= 0 ? 'up' : 'down'}`;
};

/** player.speed: { secondsPerTurn }. Right within one step of the speed control. */
export function checkSpeed(answer: Answer): CheckResult {
  const s = num(obj(answer, 'player.speed'), 'secondsPerTurn', 'player.speed');
  if (!(s > 0)) throw new Error('player.speed: secondsPerTurn must be positive');
  const k = speedRatio(s);
  const ok = Math.abs(s - TRUE_PERIOD_S) <= SPEED_STEP_S;
  const result: Reading[] = [
    { key: 'turn time set', value: s, dim: 'time' },
    { key: 'turn time on the cover', value: TRUE_PERIOD_S, dim: 'time' },
    { key: 'speed ratio', value: k },
    { key: 'semitones', value: semitones(k) },
  ];
  if (ok) {
    return {
      ok,
      result,
      message: `The platter now turns once in the time written round the disc's edge (within one step of the control, ${fmt(SPEED_STEP_S / TRUE_PERIOD_S * 100, 2)}% of a turn). Whatever is on the disc plays at its own pitch and pace.`,
    };
  }
  const how = k > 1 ? 'fast' : 'slow';
  return {
    ok,
    result,
    message: `At this speed the disc turns ${fmt(k)} times as fast as the cover says. Everything on it plays ${how}: its pace by the same ratio, and its pitch ${shift(k)}. The number round the disc is the time of one turn.`,
  };
}

/** player.start: { radiusMm, secondsPerTurn? }. Right in the lead-in or the music before the first picture line. */
export function checkStart(answer: Answer): CheckResult {
  const o = obj(answer, 'player.start');
  const r = num(o, 'radiusMm', 'player.start');
  const s = o.secondsPerTurn === undefined ? TRUE_PERIOD_S : num(o, 'secondsPerTurn', 'player.start');
  const spot = spotAt(r);
  const t = spot === 'leadin' || spot === 'music' ? groove.timeAtRadius(PLAYER_SIDE, r) : null;
  const result: Reading[] = [
    { key: 'needle radius', value: r / 1000, dim: 'length' },
    { key: 'needle lands on', value: spot },
  ];
  if (t !== null) result.push({ key: 'turns into the music', value: t / TRUE_PERIOD_S });
  const ok = spot === 'leadin' || (spot === 'music' && t !== null && t < FIRST_LINE_S);
  if (ok) {
    return {
      ok,
      result,
      message: 'The stylus settles into the groove at the outer edge, where the cover draws it, and the spiral will carry it in from the start of the side.',
    };
  }
  const messages: Record<Exclude<typeof spot, 'leadin'>, string> = {
    off: 'The needle is past the edge of the disc: there is nothing under it.',
    rim: 'The stylus rests on the smooth rim outside the groove. Nothing carries it, and nothing plays.',
    music: `This is ${fmt((t ?? 0) / TRUE_PERIOD_S, 0)} turns into the side: whatever plays here started long before the needle arrived. The cover draws the stylus at the outer edge.`,
    runout: `The stylus drops into the locked groove inside the last of the music. It plays nothing but a click once every turn, every ${q('time', s)} at this speed, for ever.`,
    label: 'The stylus lands on the smooth label at the centre: no groove, no sound. It is lifted again with a soft thump.',
  };
  if (spot === 'runout') result.push({ key: 'click every', value: s, dim: 'time' });
  return { ok, result, message: messages[spot as Exclude<typeof spot, 'leadin'>] };
}

/** player.direction: { direction }. Right when the spiral carries the needle inward (PLAYING_DIRECTION). */
export function checkDirection(answer: Answer): CheckResult {
  const d = dir(obj(answer, 'player.direction'), 'player.direction');
  const drift = grooveDrift(groove, PLAYER_SIDE, d);
  const inward = drift < 0;
  const ok = d === PLAYING_DIRECTION;
  if (ok !== inward) throw new Error('player.direction: the groove model and the playing direction disagree');
  const result: Reading[] = [
    { key: 'groove carries the needle', value: inward ? 'inward' : 'outward' },
    { key: 'drift per turn', value: Math.abs(drift) / 1000, dim: 'length' },
    { key: 'plays', value: inward ? 'forward' : 'backward' },
  ];
  if (ok) {
    return {
      ok,
      result,
      message: 'Turned this way, the spiral carries the needle in from the rim, one groove further in each turn: the side plays forward from its outer edge.',
    };
  }
  return {
    ok,
    result,
    message: 'Turned this way, the spiral carries the needle outward, one groove each turn: the side plays backward, from wherever the needle is out to the rim, and then nothing.',
  };
}

const REGIONS: readonly Region[] = ['rim', 'leadin', 'music', 'runout'];

/** Read a turntable state proposed for player.firstSound. */
export function readTurntable(answer: Answer): TurntableReading {
  const what = 'player.firstSound';
  const o = obj(answer, what);
  const side = o.side === null ? null : num(o, 'side', what);
  const region = o.region === null || o.region === undefined ? null : o.region;
  if (region !== null && !REGIONS.includes(region as Region)) throw new Error(`${what}: unknown region ${String(region)}`);
  return {
    side,
    secondsPerTurn: num(o, 'secondsPerTurn', what),
    direction: dir(o, what),
    down: o.down === true,
    region: region as Region | null,
    timeS: o.timeS === null || o.timeS === undefined ? null : num(o, 'timeS', what),
    listenedS: num(o, 'listenedS', what),
  };
}

/** player.firstSound: a turntable state. Right when the stylus has heard the picture lines at the right settings. */
export function checkFirstSound(answer: Answer): CheckResult {
  const r = readTurntable(answer);
  const h = hear(r);
  const speedOk = Math.abs(r.secondsPerTurn - TRUE_PERIOD_S) <= SPEED_STEP_S;
  const result: Reading[] = [{ key: 'speed ratio', value: h.k }];
  if (h.backward) result.push({ key: 'plays', value: 'backward' });
  if (h.kind === 'lines' && h.periodS !== null) {
    result.push({ key: 'repeats every', value: h.periodS, dim: 'time' });
    result.push({ key: 'repeats per turn', value: r.secondsPerTurn / h.periodS });
    result.push({ key: 'picture line on the cover', value: COVER_LINE_S, dim: 'time' });
  }
  if (h.kind === 'clicks' && h.periodS !== null) result.push({ key: 'click every', value: h.periodS, dim: 'time' });
  const settled = r.listenedS >= LISTEN_S && r.timeS !== null && r.timeS >= FIRST_LINE_S + LINES_HEARD_S;
  const ok = r.side === PLAYER_SIDE && speedOk && !h.backward && h.kind === 'lines' && settled;
  if (ok) {
    return {
      ok,
      result,
      message:
        'Not music and not speech: a steady pattern, the same short shape over and over, each a little different from the last, ' +
        `once every ${q('time', h.periodS!, 3)}. The cover's picture diagrams give a time just like it. The first sound is a picture, sent line by line.`,
    };
  }
  let message: string;
  if (r.side !== PLAYER_SIDE) message = 'This is the other face of the disc. The face that was mounted toward the craft is where the first sound is.';
  else if (h.kind === 'nothing') message = 'Nothing: the needle is up, or resting where there is no groove.';
  else if (h.backward) message = 'Everything plays backward: the platter turns against the spiral and drags the needle out toward the rim.';
  else if (!speedOk) message = `Something plays, but ${h.k > 1 ? 'too fast' : 'too slow'}: every pace and pitch is off by ${h.k.toFixed(3)} times (${shift(h.k)}). Set the speed first.`;
  else if (h.kind === 'silentGroove') message = 'A faint hiss of empty groove: the needle is still riding in toward the start of the music. Keep listening.';
  else if (h.kind === 'clicks') message = 'Only a click, once every turn: the needle is locked in the run-out, past the end of the side.';
  // The tape opens with about 3.7 s of near-silence, then a tone until about 9.9 s (images-and-audio.md section 1).
  else if (h.kind === 'opening') message = 'The opening of the side: quiet, then a long steady tone. The first repeating pattern has not reached the needle yet. Keep listening.';
  else if (h.kind === 'content') message = 'Something plays, but not from the start of the side: the needle came down partway in.';
  else message = `The pattern has only just begun. Listen for at least ${q('time', LISTEN_S)} at steady settings.`;
  return { ok: false, result, message };
}

export function makePlayerCheckers(): Record<(typeof PLAYER_NODE_IDS)[number], Checker> {
  return {
    'player.speed': (a) => checkSpeed(a),
    'player.start': (a) => checkStart(a),
    'player.direction': (a) => checkDirection(a),
    'player.firstSound': (a) => checkFirstSound(a),
  };
}

export function registerPlayerCheckers(): void {
  const c = makePlayerCheckers();
  for (const id of PLAYER_NODE_IDS) registerChecker(id, c[id]);
}
