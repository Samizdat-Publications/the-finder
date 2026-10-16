// The picture decoder through the real browser path: fetch the FLAC slice, decodeAudioData in an
// OfflineAudioContext at 96 kHz (src/media/frames.ts), decode in the Worker (src/dsp/worker.ts). The
// truth is the Node decode of the same slice by the same code (which decode.test.ts holds pixel-equal
// to the Python reference): V8 runs both, so at most 1 grey level may differ per pixel (spec).
// Node side: the TypeScript modules are loaded through a Vite SSR server (the runner is plain Node).
import { createServer } from 'vite';

const IDS = ['L000', 'L019', 'R072']; // the circle, a diagram, a right-channel photograph
const MAX_GREY_DIFF = 1; // spec: at most 1 grey level per pixel between browser and Node
const TARGET_MS = 250; // spec: decode under 250 ms per frame in the Worker on this PC

export default async function run({ page, record, assert, log }) {
  // ---- browser: fetch, decodeAudioData, Worker ----
  const browser = await page.evaluate(async (ids) => {
    const m = await import('/src/media/frames.ts');
    // Chrome hands positive 16-bit samples back as w / 32767 and negative ones as w / 32768;
    // restoreInt16 must give exactly w / 32768 for both (what the Node decode reads)
    const w = [-32768, -1, 0, 1, 16384, 23679, 32767];
    const chromeLike = Float32Array.from(w, (v) => (v > 0 ? v / 32767 : v / 32768));
    const restored = Array.from(m.restoreInt16(chromeLike));
    const restoreOk = restored.every((v, i) => v === Math.fround(w[i] / 32768));
    const dec = new m.PictureDecoder();
    const out = [];
    // a warm-up decode first, so the timed decodes measure the decoder rather than first-load JIT
    const warm = m.frameEntry(ids[0]);
    await dec.decode(warm, await m.fetchSlice(warm));
    for (const id of ids) {
      const entry = m.frameEntry(id);
      const t0 = performance.now();
      const samples = await m.fetchSlice(entry);
      const t1 = performance.now();
      let batches = 0;
      const done = await dec.decode(entry, samples, { batchLines: 64, onLines: () => batches++ });
      const t2 = performance.now();
      let s = '';
      for (let i = 0; i < done.gray.length; i += 8192) s += String.fromCharCode(...done.gray.subarray(i, i + 8192));
      out.push({ id, width: done.width, height: done.height, gray: btoa(s), timings: done.timings, loadMs: t1 - t0, roundTripMs: t2 - t1, batches });
    }
    dec.terminate();
    return { out, restoreOk };
  }, IDS);
  assert(browser.restoreOk, 'restoreInt16 recovers w / 32768 from Chrome-style w / 32767 positives');
  const decoded = browser.out;

  // ---- Node: the same slices, the same code ----
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  let rows;
  try {
    const wav = await vite.ssrLoadModule('/tests/support/wav.ts');
    const decode = await vite.ssrLoadModule('/src/dsp/decode.ts');
    const params = await vite.ssrLoadModule('/src/dsp/params.ts');
    const frames = (await vite.ssrLoadModule('/data/frames.json')).default.frames;
    rows = decoded.map((b) => {
      const f = frames.find((e) => e.frame === b.id);
      const w = wav.loadSlice(b.id);
      const x = decode.toTapeUnits(w.samples, f.gain);
      const sync = decode.syncFrame(x, w.sampleRate, f.firstLineOffset, params.periodPrior(b.id));
      const node = decode.decodeFrame(x, sync, params.referenceParams(f.channel));
      const g = Buffer.from(b.gray, 'base64');
      let maxDiff = 0;
      let differing = 0;
      for (let i = 0; i < node.gray.length; i++) {
        const d = Math.abs(g[i] - node.gray[i]);
        if (d) differing++;
        if (d > maxDiff) maxDiff = d;
      }
      const sizeOk = b.width === node.width && b.height === node.height && g.length === node.gray.length;
      return { ...b, maxDiff, differing, sizeOk };
    });
  } finally {
    await vite.close();
  }

  for (const r of rows) {
    log(
      `${r.id}: max pixel difference ${r.maxDiff} (${r.differing} pixels differ); Worker decode ${r.timings.totalMs.toFixed(0)} ms ` +
        `(sync ${r.timings.syncMs.toFixed(0)}, lines ${r.timings.decodeMs.toFixed(0)}, stretch ${r.timings.grayMs.toFixed(0)}); ` +
        `fetch + decodeAudioData ${r.loadMs.toFixed(0)} ms; round trip ${r.roundTripMs.toFixed(0)} ms; ${r.batches} batches`,
    );
  }
  const maxDiff = Math.max(...rows.map((r) => r.maxDiff));
  const worstMs = Math.max(...rows.map((r) => r.timings.totalMs));
  const pass = rows.every((r) => r.sizeOk && r.batches === 8) && maxDiff <= MAX_GREY_DIFF && worstMs < TARGET_MS;
  record({
    id: 'decoder.browser',
    claim: 'In the browser, the real path (FLAC fetched whole, decoded at 96 kHz, decoded in a Worker) gives the same pictures as the tested Node decode, fast enough to keep up with playback.',
    measured: `${rows.length} frames (${IDS.join(', ')}): largest pixel difference ${maxDiff} grey levels; Worker decode ${rows.map((r) => r.timings.totalMs.toFixed(0)).join(', ')} ms`,
    expected: 'The Node decode of the same slices by the same code (itself pixel-equal to the Python reference, decoder.frames)',
    tolerance: `At most ${MAX_GREY_DIFF} grey level per pixel (spec; both run V8); under ${TARGET_MS} ms per frame (spec target for this PC; a frame lasts 4.3 s of tape)`,
    pass,
    notes: `Installed Chrome via Playwright. Chrome's decodeAudioData returns positive 16-bit samples as w / 32767 (negatives as w / 32768); src/media/frames.ts restores the exact integers before decoding, without which up to 407 pixels per frame differed by 1 grey level. Fetch plus decodeAudioData took ${rows.map((r) => r.loadMs.toFixed(0)).join(', ')} ms per frame on the dev server.`,
  });
  assert(rows.every((r) => r.sizeOk), 'browser and Node pictures have the same size');
  assert(rows.every((r) => r.batches === 8), 'the Worker posts 512 lines in 8 batches of 64');
  assert(maxDiff <= MAX_GREY_DIFF, `browser and Node decodes agree within ${MAX_GREY_DIFF} grey level (max ${maxDiff})`);
  assert(worstMs < TARGET_MS, `Worker decode under ${TARGET_MS} ms per frame (worst ${worstMs.toFixed(0)} ms)`);
}
