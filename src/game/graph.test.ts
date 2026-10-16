// The deduction graph under Node: gating (what opens when), proposing with checkers (right and wrong, the
// attempts remembered), hints in order, the chapter hash. Check id: game.graph.
import { beforeEach, describe, expect, it } from 'vitest';
import { recordCheck } from '../../tests/support/record';
import { dispatch } from './bus';
import { chapterOpen, chapterStatus, clearCheckers, installTestCheckers, nodeStatus, registerChecker, testCheckersEnabled } from './deductions';
import { ALL_NODES, CHAPTERS, NODES, nodeDef, parseChapterHash } from './graph';
import { resetAll, setClock } from './gameService';
import { confirmedSet, game, hintsUsed, snapshot } from './state';

const confirm = (id: string): Promise<void> => dispatch({ type: 'deduction.propose', id, answer: 'correct' });
const status = (id: string) => nodeStatus(id, confirmedSet.value);

beforeEach(() => {
  resetAll();
  clearCheckers();
  installTestCheckers();
  let t = 1000;
  setClock(() => (t += 1));
});

describe('the graph data', () => {
  it('has the slice nodes with stable ids, real prerequisites and a row of the deduction table each', () => {
    const ids = new Set(NODES.map((n) => n.id));
    expect(ids.size).toBe(NODES.length);
    expect(NODES.length).toBe(31); // 18 slice nodes and 13 for M4 (map, spot, trail) in play
    expect(ALL_NODES.length).toBe(43); // and 12 for M5 (pictures, voices), kept `later` until built
    const allIds = new Set(ALL_NODES.map((n) => n.id));
    for (const n of ALL_NODES) {
      expect(n.id.startsWith(`${n.chapter}.`)).toBe(true);
      for (const r of n.requires) expect(allIds.has(r), `${n.id} requires unknown ${r}`).toBe(true);
      if (!n.later) for (const r of n.requires) expect(ids.has(r), `${n.id} in play requires ${r}, which is not`).toBe(true);
      expect(n.checkedRow).toBeGreaterThanOrEqual(1);
      expect(n.checkedRow).toBeLessThanOrEqual(16);
      expect(n.hints.every((h) => h.length > 10)).toBe(true);
    }
    for (const c of CHAPTERS) for (const r of c.requires) expect(ids.has(r)).toBe(true);
    // rows from the deduction table
    expect(nodeDef('arrival.fuelAge')?.checkedRow).toBe(1);
    expect(nodeDef('arrival.madeNotMined')?.checkedRow).toBe(2);
    expect(nodeDef('key.binary')?.checkedRow).toBe(3);
    expect(nodeDef('key.unit')?.checkedRow).toBe(3);
    expect(nodeDef('key.timesNotLengths')?.checkedRow).toBe(4);
    expect(nodeDef('player.firstSound')?.checkedRow).toBe(11);
    expect(nodeDef('pictures.firstFrames')?.checkedRow).toBe(12);
    expect(nodeDef('map.identify')?.checkedRow).toBe(5);
    expect(nodeDef('map.region')?.checkedRow).toBe(6);
    expect(nodeDef('map.motion')?.checkedRow).toBe(7);
    expect(nodeDef('spot.age')?.checkedRow).toBe(8);
    expect(nodeDef('trail.origin')?.checkedRow).toBe(9);
    expect(nodeDef('trail.neighbour')?.checkedRow).toBe(10);
    expect(nodeDef('trail.when')?.checkedRow).toBe(7);
  });

  it('has no cycle: every node can be reached from the start', () => {
    const done = new Set<string>();
    let progress = true;
    while (progress) {
      progress = false;
      for (const n of NODES) {
        if (done.has(n.id)) continue;
        const chapterReq = CHAPTERS.find((c) => c.id === n.chapter)?.requires ?? [];
        if ([...n.requires, ...chapterReq].every((r) => done.has(r))) {
          done.add(n.id);
          progress = true;
        }
      }
    }
    expect(done.size).toBe(NODES.length);
  });

  it('hint texts have no em dash and the hash parser knows the chapters and the hub', () => {
    for (const n of ALL_NODES) for (const t of [n.gloss, ...n.hints]) expect(t.includes(String.fromCharCode(0x2014))).toBe(false);
    expect(parseChapterHash('#arrival')).toBe('arrival');
    expect(parseChapterHash('#hub')).toBe('hub');
    expect(parseChapterHash('#/pictures')).toBe('pictures');
    expect(parseChapterHash('#nope')).toBeNull();
    expect(parseChapterHash('')).toBeNull();
  });
});

describe('no spoilers', () => {
  // Distinctive words of each conclusion that its question must not contain.
  const AVOID: Record<string, string[]> = {
    'arrival.purpose': ['send', 'sense', 'built'],
    'arrival.heat': ['source', 'long time'],
    'arrival.madeNotMined': ['uranium', 'isotope', 'made not mined', 'uranium-238'],
    'arrival.fuelAge': ['thorium', 'ratio', 'decay'],
    'key.binary': ['binary', 'digit', 'bar', 'dash'],
    'key.unit': ['spin-flip', 'hydrogen', 'transition'],
    'key.timesNotLengths': ['absurd'],
    'player.speed': ['seconds', 'written'],
    'player.start': ['outer', 'edge', 'inward'],
    'player.direction': ['groove', 'inward', 'backward'],
    'player.firstSound': ['first sound'],
    'pictures.lineTime': ['cover gives', 'ms'],
    'pictures.sync': ['sync', 'pulse'],
    'pictures.interlace': ['stagger', 'interlace'],
    'pictures.polarity': ['negative', 'darker'],
    'pictures.aspect': ['rows', 'lines'],
    'pictures.circle': ['round', 'circle'],
    'pictures.firstFrames': ['following', 'develop'],
    'map.periods': ['pulsar', 'spin', 'period'],
    'map.old': ['slower', 'ticks'],
    'map.identify': ['pulsar', 'direction', 'rate'],
    'map.motion': ['motion', 'velocity', 'move'],
    'map.region': ['region', 'parsec', 'thousand'],
    'spot.find': ['uranium', 'radioactive', 'spot'],
    'spot.age': ['uranium-234', 'ratio', 'count'],
    'spot.purity': ['thorium', 'natural'],
    'trail.origin': ['warm-white', 'straight away', 'behind'],
    'trail.age': ['distance', 'speed'],
    'trail.neighbour': ['nearest', 'neighbour', 'brightest'],
    'trail.where': ['inside', 'region', 'home'],
    'trail.when': ['rest frame', 'agree'],
    'pictures.album': ['album', 'whole side'],
    'pictures.colour': ['colour', 'primaries', 'stacked'],
    'pictures.down': ['turned', 'stand', 'upright'],
    'pictures.numerals': ['numerals', 'digit'],
    'pictures.units': ['units', 'hydrogen'],
    'pictures.home': ['every number is one', 'measured the others'],
    'pictures.slip': ['slip', 'breaks'],
    'pictures.height': ['heights', 'reaches'],
    'voices.many': ['few dozen', 'speakers'],
    'voices.hearing': ['band', 'frequencies'],
    'voices.octave': ['doubled', 'steps'],
    'voices.others': ['animals'],
  };
  it('every node has a question that gives away neither its conclusion nor its key terms', () => {
    for (const n of ALL_NODES) {
      const q = n.question.toLowerCase();
      expect(q.endsWith('?'), `${n.id} question`).toBe(true);
      expect(q.includes(n.gloss.toLowerCase().slice(0, 25)), `${n.id} repeats its conclusion`).toBe(false);
      expect(n.question).not.toBe(n.gloss);
      const words = AVOID[n.id];
      expect(words, `${n.id} needs an avoid list`).toBeDefined();
      for (const w of words ?? []) expect(q.includes(w), `${n.id}: question contains "${w}"`).toBe(false);
    }
  });
});

describe('gating (D-A06)', () => {
  it('opens arrival first, the key after arrival.purpose, then player and pictures after times-not-lengths', async () => {
    expect(chapterOpen('arrival', confirmedSet.value)).toBe(true);
    expect(chapterOpen('key', confirmedSet.value)).toBe(false);
    expect(chapterOpen('player', confirmedSet.value)).toBe(false);
    await expect(dispatch({ type: 'chapter.enter', chapter: 'key' })).rejects.toThrow(/locked/);
    expect(game.chapter.value).toBe('hub');
    expect(game.error.value).toMatch(/locked/);

    await confirm('arrival.purpose');
    expect(chapterOpen('key', confirmedSet.value)).toBe(true);
    expect(chapterOpen('player', confirmedSet.value)).toBe(false);
    await dispatch({ type: 'chapter.enter', chapter: 'key' });
    expect(game.chapter.value).toBe('key');
    expect(game.error.value).toBeNull();

    await confirm('key.binary');
    await confirm('key.unit');
    expect(chapterOpen('player', confirmedSet.value)).toBe(false);
    await confirm('key.timesNotLengths');
    expect(chapterOpen('player', confirmedSet.value)).toBe(true);
    expect(chapterOpen('pictures', confirmedSet.value)).toBe(true);
    expect(chapterStatus('key', confirmedSet.value)).toBe('done');
  });

  it('keeps chapters that are not built locked as "later", whether or not their nodes exist yet', async () => {
    for (const id of ['arrival.purpose', 'key.binary', 'key.unit', 'key.timesNotLengths']) await confirm(id);
    for (const c of ['map', 'spot', 'trail', 'voices', 'portrait', 'epilogue'] as const) {
      if (CHAPTERS.find((d) => d.id === c)?.built) continue;
      expect(chapterStatus(c, confirmedSet.value)).toBe('later');
      await expect(dispatch({ type: 'chapter.enter', chapter: c })).rejects.toThrow(/later/);
    }
    for (const c of ['voices', 'portrait', 'epilogue'] as const) expect(NODES.some((n) => n.chapter === c)).toBe(false);
    expect(ALL_NODES.filter((n) => n.later).every((n) => !NODES.includes(n))).toBe(true);
  });

  it('orders the nodes inside a chapter, and the pictures line-time work needs player.speed', async () => {
    expect(status('arrival.purpose')).toBe('open');
    expect(status('arrival.heat')).toBe('locked');
    expect(status('key.binary')).toBe('locked');
    await expect(confirm('arrival.heat')).rejects.toThrow(/locked/);
    for (const id of ['arrival.purpose', 'key.binary', 'key.unit', 'key.timesNotLengths']) await confirm(id);
    expect(status('pictures.lineTime')).toBe('locked'); // the chapter is open but the record is not yet playable at speed
    expect(status('player.speed')).toBe('open');
    await confirm('player.speed');
    expect(status('pictures.lineTime')).toBe('open');
    expect(status('pictures.sync')).toBe('locked');
    expect(status('player.firstSound')).toBe('locked');
    await confirm('player.start');
    await confirm('player.direction');
    expect(status('player.firstSound')).toBe('open');
  });
});

describe('proposing', () => {
  it('records a right answer as confirmed and a wrong one as an attempt that shows what it showed', async () => {
    await dispatch({ type: 'deduction.propose', id: 'arrival.purpose', answer: 'a telescope' });
    expect(status('arrival.purpose')).toBe('open');
    let node = snapshot().game.nodes['arrival.purpose'];
    expect(node?.attempts).toHaveLength(1);
    expect(node?.attempts[0]).toMatchObject({ answer: 'a telescope', ok: false });
    expect(node?.attempts[0]?.message).toMatch(/accepts only/);
    expect(node?.attempts[0]?.result[0]?.value).toBe('a telescope');
    await dispatch({ type: 'deduction.propose', id: 'arrival.purpose', answer: 'correct' });
    node = snapshot().game.nodes['arrival.purpose'];
    expect(node?.confirmed).toBe(true);
    expect(node?.attempts.map((a) => a.ok)).toEqual([false, true]);
    expect(node?.attempts[1]?.at).toBeGreaterThan(node?.attempts[0]?.at ?? 0);
    await expect(confirm('arrival.purpose')).rejects.toThrow(/already confirmed/);
  });

  it('refuses unknown nodes, locked nodes and nodes with no checker, and says why', async () => {
    await expect(confirm('nope.nothing')).rejects.toThrow(/no deduction/);
    await expect(confirm('key.unit')).rejects.toThrow(/locked/);
    clearCheckers();
    await expect(confirm('arrival.purpose')).rejects.toThrow(/no checker/);
    registerChecker('arrival.purpose', (a, ctx) => ({ ok: a === 1, result: [{ key: 'tries', value: ctx.attempts }], message: 'm' }));
    await dispatch({ type: 'deduction.propose', id: 'arrival.purpose', answer: 2 });
    await dispatch({ type: 'deduction.propose', id: 'arrival.purpose', answer: 1 });
    const a = snapshot().game.nodes['arrival.purpose']?.attempts;
    expect(a?.map((x) => x.result[0]?.value)).toEqual([0, 1]); // the checker sees how many attempts came before
    expect(() => registerChecker('nope', () => ({ ok: true, result: [], message: '' }))).toThrow();
  });

  it('turns the test checkers on only with the test handle and the flag', () => {
    expect(testCheckersEnabled('?testcheckers=1', true)).toBe(true);
    expect(testCheckersEnabled('?testcheckers=1', false)).toBe(false);
    expect(testCheckersEnabled('', true)).toBe(false);
  });
});

describe('hints', () => {
  it('reveal in order (nudge, method, answer), are counted, and only for open nodes', async () => {
    const def = nodeDef('arrival.purpose');
    await expect(dispatch({ type: 'hint.request', id: 'arrival.heat' })).rejects.toThrow(/not open/);
    expect(hintsUsed.value).toBe(0);
    for (let tier = 1; tier <= 3; tier++) {
      await dispatch({ type: 'hint.request', id: 'arrival.purpose' });
      expect(snapshot().game.nodes['arrival.purpose']?.hints).toBe(tier);
      expect(hintsUsed.value).toBe(tier);
    }
    expect(def?.hints).toHaveLength(3);
    await expect(dispatch({ type: 'hint.request', id: 'arrival.purpose' })).rejects.toThrow(/already shown/);
    await confirm('arrival.purpose');
    await expect(dispatch({ type: 'hint.request', id: 'arrival.purpose' })).rejects.toThrow(/not open/);
    expect(snapshot().game.hintsUsed).toBe(3);
  });
});

describe('the codex and the panels', () => {
  it('opens for an entry, closes, and opens settings', async () => {
    await dispatch({ type: 'codex.open', id: 'arrival.purpose' });
    expect(snapshot().game).toMatchObject({ codexOpen: true, codexFocus: 'arrival.purpose' });
    await dispatch({ type: 'codex.close' });
    expect(snapshot().game).toMatchObject({ codexOpen: false, codexFocus: null });
    await expect(dispatch({ type: 'codex.open', id: 'nope' })).rejects.toThrow();
    await dispatch({ type: 'settings.panel', open: true });
    expect(snapshot().game.settingsOpen).toBe(true);
  });
});

describe('the record of the check', () => {
  it('writes the game.graph record', async () => {
    const gated = !chapterOpen('key', confirmedSet.value);
    await confirm('arrival.purpose');
    const opened = chapterOpen('key', confirmedSet.value);
    recordCheck({
      id: 'game.graph',
      claim: 'The deduction graph gates the chapters as designed: The Key opens after the first Arrival deduction, the player and the pictures after the key is read, and a wrong answer is remembered with what it showed.',
      measured: `${NODES.length} deductions in ${CHAPTERS.filter((c) => c.built).length} chapters, every prerequisite exists and every node is reachable; key locked at start: ${gated}; key open after arrival.purpose: ${opened}; hints reveal nudge, method, answer in order and are counted`,
      expected: 'D-A06 hub structure and the design in docs/plans/M3_specs/step1-shell-graph-codex.md',
      tolerance: 'exact (logic, with test checkers: the real checkers arrive in steps 3 to 6)',
      pass: gated && opened,
    });
    expect(gated && opened).toBe(true);
  });
});
