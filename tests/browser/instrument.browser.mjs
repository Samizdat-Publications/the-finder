// The instrument bench on /play/bench/, driven only through the command bus (window.__finder, which the dev
// server installs). Three things are checked against independent truth:
//  1. The picture on the canvas is byte-for-byte the PictureDecoder output for the same slice and the
//     reference settings (the decoder itself is held to the Python reference by decoder.frames), and the
//     calibration circle on it is round.
//  2. A line time 5% off, with sync lock off, changes the picture and the circle is no longer round.
//  3. Side 1 loads, a needle dropped at Johnny B. Goode's groove radius lands on that track, and a speed
//     of 3.47 s per turn reads back as the cover's period over 3.47 (the speed ratio).
// Id: instrument.bench.

const CIRCLE_TOL = 0.01; // tools/ref-decoder/README.md section 7: a round circle is 1.00 +/- 0.01

export default async function run({ page, baseUrl, record, assert, log }) {
  await page.goto(`${baseUrl}/play/bench/`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__finder), null, { timeout: 30_000 });

  // ---- 1. the reference picture on the canvas equals the decoder's own output ----
  const ref = await page.evaluate(async () => {
    const f = window.__finder;
    await f.dispatch({ type: 'decoder.select', frame: 'L000' });
    await f.dispatch({ type: 'decoder.run', speed: 'fast' });
    await f.waitFor(() => f.state().decoder.status === 'done', 60_000);
    const readCanvas = () => {
      const cv = document.getElementById('picture-canvas');
      const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      const g = new Uint8Array(cv.width * cv.height);
      let grey = true;
      for (let i = 0; i < g.length; i++) {
        g[i] = px[4 * i];
        if (px[4 * i + 1] !== g[i] || px[4 * i + 2] !== g[i]) grey = false;
      }
      return { width: cv.width, height: cv.height, g, grey };
    };
    const canvas = readCanvas();
    const frames = await import('/src/media/frames.ts');
    const entry = frames.frameEntry('L000');
    const dec = new frames.PictureDecoder();
    const truth = await dec.decode(entry, await frames.fetchSlice(entry));
    dec.terminate();
    const ellipse = await import('/src/dsp/ellipse.ts');
    const ratio = (gray, w, h) => {
      try {
        const pts = ellipse.ringPoints(Array.from(gray), w, h);
        return ellipse.fitEllipse(pts.xs, pts.ys).axisRatio;
      } catch {
        return null;
      }
    };
    let differing = 0;
    for (let i = 0; i < truth.gray.length; i++) if (truth.gray[i] !== canvas.g[i]) differing++;
    const bench0 = f.state().decoder.bench;
    return {
      width: canvas.width,
      height: canvas.height,
      grey: canvas.grey,
      sameSize: truth.width === canvas.width && truth.height === canvas.height,
      differing,
      circle: ratio(canvas.g, canvas.width, canvas.height),
      canvasGray: Array.from(canvas.g),
      coverLineMs: bench0.lineTimeMs,
      truthTimingMs: truth.timings.totalMs,
    };
  });
  log(`L000 on the canvas: ${ref.width} x ${ref.height}, ${ref.differing} of ${ref.canvasGray.length} pixels differ from the decoder output; circle axis ratio ${ref.circle?.toFixed(4)}`);
  assert(ref.sameSize, 'the canvas is the size of the decoded picture');
  assert(ref.grey, 'a mono picture is drawn in grey');
  assert(ref.differing === 0, `the canvas equals the PictureDecoder output byte for byte (${ref.differing} pixels differ)`);
  assert(ref.circle !== null && Math.abs(ref.circle - 1) <= CIRCLE_TOL, `the reference circle is round (axis ratio ${ref.circle})`);

  // ---- 2. a line time 5% off, free-running: the picture changes and the circle is no longer round ----
  const wrong = await page.evaluate(async (refGray) => {
    const f = window.__finder;
    const cover = f.state().decoder.bench.lineTimeMs;
    await f.dispatch({ type: 'decoder.setParam', name: 'syncLock', value: false });
    await f.dispatch({ type: 'decoder.setParam', name: 'lineTimeMs', value: cover * 1.05 });
    await f.dispatch({ type: 'decoder.run', speed: 'fast' });
    await f.waitFor(() => f.state().decoder.status === 'done' && f.state().decoder.picture?.bench.syncLock === false, 60_000);
    const cv = document.getElementById('picture-canvas');
    const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    const g = new Uint8Array(cv.width * cv.height);
    let differing = 0;
    for (let i = 0; i < g.length; i++) {
      g[i] = px[4 * i];
      if (g[i] !== refGray[i]) differing++;
    }
    const ellipse = await import('/src/dsp/ellipse.ts');
    let ratio = null;
    let failure = null;
    try {
      const pts = ellipse.ringPoints(Array.from(g), cv.width, cv.height);
      ratio = ellipse.fitEllipse(pts.xs, pts.ys).axisRatio;
    } catch (e) {
      failure = String(e && e.message ? e.message : e);
    }
    const st = f.state().decoder;
    await f.dispatch({ type: 'decoder.reset' });
    return { cover, differing, total: g.length, ratio, failure, lineTimeMs: st.picture.bench.lineTimeMs, after: f.state().decoder.bench };
  }, ref.canvasGray);
  log(`+5% line time (${wrong.lineTimeMs.toFixed(4)} ms, sync lock off): ${wrong.differing} of ${wrong.total} pixels changed; circle ${wrong.ratio === null ? `not found (${wrong.failure})` : `axis ratio ${wrong.ratio.toFixed(4)}`}`);
  assert(Math.abs(wrong.lineTimeMs / wrong.cover - 1.05) < 1e-9, 'the line time used is 5% above the cover value');
  assert(wrong.differing > wrong.total * 0.2, 'the picture changed');
  const circleBroken = wrong.ratio === null || Math.abs(wrong.ratio - 1) > CIRCLE_TOL;
  assert(circleBroken, `the circle is no longer round (axis ratio ${wrong.ratio})`);
  assert(wrong.after.syncLock === true && Math.abs(wrong.after.lineTimeMs - wrong.cover) < 1e-12, 'reset returns the knobs to the reference');

  // ---- 3. the turntable: side 1, the needle on Johnny B. Goode, a wrong speed ----
  const tt = await page.evaluate(async () => {
    const f = window.__finder;
    const model = await import('/src/game/model.ts');
    const itemId = model.timeline.entries(1).find((e) => e.item.musicNumber === 7).item.id;
    const radius = model.radiusAtItemStart(1, itemId, 1);
    await f.dispatch({ type: 'turntable.load', side: 1 });
    await f.dispatch({ type: 'turntable.drop', radiusMm: radius });
    await f.waitFor(() => f.state().turntable.needle?.itemId === itemId, 90_000);
    const down = f.state().turntable;
    await f.dispatch({ type: 'turntable.setSpeed', secondsPerTurn: 3.47 });
    const after = f.state().turntable;
    await f.dispatch({ type: 'turntable.lift' });
    return {
      itemId,
      radius,
      down: { down: down.needle.down, region: down.needle.region, itemId: down.needle.itemId, load: down.load, status: down.status },
      speedRatio: after.speedRatio,
      needleSpeedRatio: after.needle.speedRatio,
      coverPeriod: model.COVER_PERIOD_S,
      lifted: f.state().turntable.needle.down,
    };
  });
  const expectedRatio = tt.coverPeriod / 3.47;
  log(`needle at ${tt.radius.toFixed(3)} mm on ${tt.itemId} (${tt.down.region}); loaded ${tt.down.load.loaded} of ${tt.down.load.total} bytes; speed ratio ${tt.speedRatio.toFixed(6)} (expected ${expectedRatio.toFixed(6)})`);
  assert(tt.down.down && tt.down.region === 'music', 'the needle is down in the music');
  assert(tt.down.itemId === tt.itemId && tt.itemId === 'ozma-11', 'the needle is on Johnny B. Goode (music 7)');
  assert(tt.down.load.total > 0 && tt.down.load.loaded <= tt.down.load.total, 'the load bar counts bytes');
  assert(Math.abs(tt.speedRatio - expectedRatio) < 1e-9 && Math.abs(tt.needleSpeedRatio - expectedRatio) < 1e-9, 'a 3.47 s turn reads back as the cover period over 3.47');
  assert(tt.lifted === false, 'lifting the needle puts it up');

  record({
    id: 'instrument.bench',
    claim: 'The bench works through the same commands a player uses: it draws the decoded picture exactly, shows a wrong line time as a broken picture, and drops the needle on the right track at the right speed ratio.',
    measured:
      `L000 on the canvas: ${ref.differing} pixels differ from the PictureDecoder output; circle axis ratio ${ref.circle.toFixed(4)}. ` +
      `Line time +5% (sync lock off): ${wrong.differing} of ${wrong.total} pixels changed, circle ${wrong.ratio === null ? 'no longer found' : `axis ratio ${wrong.ratio.toFixed(3)}`}. ` +
      `Needle at ${tt.radius.toFixed(2)} mm: ${tt.itemId}; speed ratio ${tt.speedRatio.toFixed(5)} at 3.47 s per turn.`,
    expected: 'the PictureDecoder output for L000 (byte-exact); a round circle (1.00) at the reference settings; the cover period 3.59994 s divided by 3.47 s for the speed ratio; music 7 at its groove radius',
    tolerance: 'canvas equals decoder output exactly; circle within 0.01 of round (README section 7); speed ratio within 1e-9',
    pass: true,
    notes: 'Driven only through window.__finder (dispatch, state, waitFor), as a bot would; no console errors allowed.',
  });
}
