import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCover } from '../../tests/support/data';
import { recordCheck } from '../../tests/support/record';
import { Groove, R_INNER_MUSIC_MM, R_LEAD_IN_OUTER_MM, R_OUTER_MUSIC_MM, rotationPeriodFromCover } from './groove';
import { Timeline, type RecordData } from './timeline';

const record = JSON.parse(readFileSync(resolve(process.cwd(), 'data', 'record.json'), 'utf8')) as RecordData;
const timeline = new Timeline(record);
const T = rotationPeriodFromCover(loadCover());
const groove = new Groove(timeline, T);

describe('record timeline', () => {
  it('side durations are the sums of record.json durations, and itemAt is right at every boundary', () => {
    let worstSum = 0;
    let boundaries = 0;
    let boundaryFailures = 0;
    for (const s of record.sides) {
      // Independent sum in the data's own order (exact decimals from the shipped files).
      const sum = s.items.reduce((a, it) => a + it.durationS, 0);
      worstSum = Math.max(worstSum, Math.abs(timeline.sideDuration(s.side) - sum));
      let start = 0;
      s.items.forEach((it, i) => {
        boundaries++;
        const at = timeline.itemAt(s.side, start);
        if (!at || at.entry.item.id !== it.id || Math.abs(at.offsetS) > 1e-9) boundaryFailures++;
        // Just before the boundary belongs to the previous item, at its very end.
        if (i > 0) {
          const before = timeline.itemAt(s.side, start - 1e-6);
          if (!before || before.entry.item.id !== s.items[i - 1]!.id) boundaryFailures++;
        }
        // The middle of the item.
        const mid = timeline.itemAt(s.side, start + it.durationS / 2);
        if (!mid || mid.entry.item.id !== it.id || Math.abs(mid.offsetS - it.durationS / 2) > 1e-9) boundaryFailures++;
        start += it.durationS;
      });
      // Outside the music: lead-in and run-out have no item.
      if (timeline.itemAt(s.side, -0.001) !== null || timeline.itemAt(s.side, start) !== null) boundaryFailures++;
    }
    const meta = record.meta as { sideDurationsS: Record<string, number> };
    const metaDiff = Math.max(
      ...record.sides.map((s) => Math.abs(timeline.sideDuration(s.side) - meta.sideDurationsS[String(s.side)]!)),
    );
    // 1e-9 s: summing about 16 doubles of size up to 3,700 s carries rounding near 1e-12, so 1e-9 leaves margin.
    // 5e-4 s: record.json meta.sideDurationsS is written by the builder from the same sums (rounded to ms).
    const pass = worstSum < 1e-9 && boundaryFailures === 0 && metaDiff < 5e-4;
    recordCheck({
      id: 'record.timeline',
      claim: "The record's timeline puts every track in its place: each side lasts exactly as long as its tracks added up.",
      measured: `side 1 ${timeline.sideDuration(1).toFixed(3)} s, side 2 ${timeline.sideDuration(2).toFixed(3)} s; ${boundaries} track starts found at offset 0, ${boundaryFailures} failures`,
      expected: 'the sum of the shipped files\' durations in data/record.json (side 1 3684.310 s, side 2 3467.414 s)',
      tolerance: '1e-9 s (double rounding)',
      pass,
      notes: 'Side break after music 11 is an inference (D-A17). Both sides run longer than the cover\'s 53.8 min, as NASA\'s "about an hour per side" allows.',
    });
    expect(worstSum).toBeLessThan(1e-9);
    expect(boundaryFailures).toBe(0);
    expect(metaDiff).toBeLessThan(5e-4);
  });
});

describe('record groove', () => {
  it('spans 146.05 to 60.3 mm, inverts exactly, and has sideDuration / T turns', () => {
    let worstInverse = 0;
    let spanErr = 0;
    let turnsErr = 0;
    const facts: string[] = [];
    for (const side of timeline.sides()) {
      const d = timeline.sideDuration(side);
      spanErr = Math.max(
        spanErr,
        Math.abs(groove.radiusAtTime(side, 0) - R_OUTER_MUSIC_MM),
        Math.abs(groove.radiusAtTime(side, d) - R_INNER_MUSIC_MM),
        Math.abs(groove.timeAtRadius(side, R_OUTER_MUSIC_MM)),
        Math.abs(groove.timeAtRadius(side, R_INNER_MUSIC_MM) - d),
      );
      // Turns counted independently: radial span over pitch must equal duration over period.
      const turnsFromGeometry = (R_OUTER_MUSIC_MM - R_INNER_MUSIC_MM) / groove.pitchMm(side);
      turnsErr = Math.max(turnsErr, Math.abs(turnsFromGeometry - d / T), Math.abs(groove.turns(side) - d / T));
      // Inversion over the music band and lead-in, 2,001 points each way.
      for (let i = 0; i <= 2000; i++) {
        const t = -groove.leadInS + ((d + groove.leadInS) * i) / 2000;
        worstInverse = Math.max(worstInverse, Math.abs(groove.timeAtRadius(side, groove.radiusAtTime(side, t)) - t));
        const r = R_INNER_MUSIC_MM + ((R_LEAD_IN_OUTER_MM - R_INNER_MUSIC_MM) * i) / 2000;
        worstInverse = Math.max(worstInverse, Math.abs(groove.radiusAtTime(side, groove.timeAtRadius(side, r)) - r));
      }
      facts.push(`side ${side}: ${groove.turns(side).toFixed(2)} turns, pitch ${(groove.pitchMm(side) * 1000).toFixed(2)} um`);
    }
    const regionsOk =
      groove.regionAtRadius(150) === 'rim' &&
      groove.regionAtRadius(147) === 'leadin' &&
      groove.regionAtRadius(100) === 'music' &&
      groove.regionAtRadius(55) === 'runout';
    // 1e-9: the spec's inversion tolerance (s and mm); double rounding at these magnitudes is about 1e-12.
    const pass = worstInverse < 1e-9 && spanErr < 1e-9 && turnsErr < 1e-9 && regionsOk;
    recordCheck({
      id: 'record.groove',
      claim: 'Dropping the needle at a radius finds the right moment of the record: one turn every 3.6 s, from the outside in.',
      measured: `${facts.join('; ')}; worst radius/time round trip ${worstInverse.toExponential(1)}`,
      expected: `music from 146.05 mm to 60.3 mm (12-inch disc standard, IEC 60098 / RIAA), turns = side duration / T with T = ${T.toFixed(5)} s from the cover (cover.md 1b)`,
      tolerance: '1e-9 (s and mm)',
      pass,
      notes: "The Voyager record's real groove radii are not documented; the standard values are used, so the pitch is a model, not a measurement.",
    });
    expect(worstInverse).toBeLessThan(1e-9);
    expect(spanErr).toBeLessThan(1e-9);
    expect(turnsErr).toBeLessThan(1e-9);
    expect(regionsOk).toBe(true);
    // The cover's period: 3.59994 s (cover.md 1b, quoted to 5 decimals).
    expect(Math.abs(T - 3.59994)).toBeLessThan(5e-6);
  });
});
