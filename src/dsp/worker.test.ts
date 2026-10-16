// The Worker's message handler, run in Node: its batches and its final picture must be byte-identical
// to the direct decode (which decode.test.ts compares with the Python reference).
import { describe, expect, it } from 'vitest';
import framesData from '../../data/frames.json';
import { loadSlice, slicesUnavailable } from '../../tests/support/wav';
import { decodeFrame, syncFrame, toTapeUnits } from './decode';
import { DECODED_LINES, periodPrior, referenceParams } from './params';
import { handleDecode, type DecoderReply, type DoneReply, type LinesReply } from './worker';

const SKIP = slicesUnavailable();
describe.skipIf(SKIP !== null)('decoder worker handler', () => {
  it('posts sync, line batches and the whole picture, identical to the direct decode', () => {
    const f = framesData.frames.find((fr) => fr.frame === 'L019') as (typeof framesData.frames)[number];
    const w = loadSlice(f.frame);
    const p = referenceParams('L');
    const x = toTapeUnits(w.samples, f.gain);
    const direct = decodeFrame(x, syncFrame(x, 96_000, f.firstLineOffset, periodPrior(f.frame)), p);
    const replies: DecoderReply[] = [];
    handleDecode(
      { type: 'decode', id: 7, samples: w.samples, gain: f.gain, seed: f.firstLineOffset, periodPrior384k: periodPrior(f.frame), params: p, batchLines: 100 },
      (m) => replies.push(m),
    );
    expect(replies[0]?.type).toBe('sync');
    const lines = replies.filter((m): m is LinesReply => m.type === 'lines');
    const done = replies.find((m): m is DoneReply => m.type === 'done') as DoneReply;
    // batches of 100 up to the decoded width (DECODED_LINES, the whole raster: 536)
    expect(lines.map((l) => [l.k0, l.k1])).toEqual([[0, 100], [100, 200], [200, 300], [300, 400], [400, 500], [500, DECODED_LINES]]);
    expect(done.width).toBe(DECODED_LINES);
    expect(Buffer.from(done.gray).equals(Buffer.from(direct.gray))).toBe(true);
    const H = done.height;
    let mismatches = 0;
    for (const l of lines)
      for (let k = l.k0; k < l.k1; k++) for (let j = 0; j < H; j++) if (l.gray[(k - l.k0) * H + j] !== direct.gray[j * done.width + k]) mismatches++;
    expect(mismatches).toBe(0);
    expect(replies.every((m) => m.id === 7)).toBe(true);
  });

  it('reports errors instead of throwing', () => {
    const replies: DecoderReply[] = [];
    handleDecode(
      { type: 'decode', id: 1, samples: new Float32Array(1000), gain: 1, seed: 500, periodPrior384k: 3197, params: referenceParams('L') },
      (m) => replies.push(m),
    );
    expect(replies.map((m) => m.type)).toEqual(['error']);
  });
});
