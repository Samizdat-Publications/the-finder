// The oscilloscope: the frame's 96 kHz signal as it comes off the tape. Above, a long sweep of three lines
// in a row, the sync pulses showing as sharp falling edges; below, eight successive sweeps stacked, each one
// line time long. Free-running, each sweep starts one line time after the last (a wrong line time makes the
// edges walk across the stack); with the sync lock on, each sweep triggers on its own falling edge.

import { useEffect, useRef } from 'preact/hooks';
import { decoder as D } from '../../game/state';
import type { FrameSignal } from './measure';

const SWEEPS = 8;
/** Samples at 96 kHz shown before the trigger point. */
const PRE = 60;

/** Line starts the scope sweeps from: the decoder's own rule (locked edges, or line 1 plus k line times). */
function sweepStart(sig: FrameSignal, k: number, lock: boolean, lineTimeMs: number): number {
  const s = sig.sync;
  if (lock) return s.locked[Math.min(k, s.locked.length - 1)] as number;
  return (s.locked[0] as number) + ((k * lineTimeMs) / 1000) * sig.info.sampleRate;
}

function trace(ctx: CanvasRenderingContext2D, x: Float64Array, from: number, len: number, x0: number, w: number, yMid: number, amp: number, peak: number): void {
  ctx.beginPath();
  for (let px = 0; px < w; px++) {
    const i0 = Math.floor(from + (px / w) * len);
    const i1 = Math.max(i0 + 1, Math.floor(from + ((px + 1) / w) * len));
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = i0; i < i1; i++) {
      const v = (x[Math.min(x.length - 1, Math.max(0, i))] as number) / peak;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const yt = yMid - hi * amp;
    const yb = yMid - lo * amp;
    if (px === 0) ctx.moveTo(x0 + px + 0.5, yt);
    ctx.lineTo(x0 + px + 0.5, yt);
    ctx.lineTo(x0 + px + 0.5, Math.max(yb, yt + 1));
  }
  ctx.stroke();
}

const peaks = new WeakMap<FrameSignal, number>();
function peakOf(sig: FrameSignal): number {
  let p = peaks.get(sig);
  if (p === undefined) {
    p = 1e-9;
    for (let i = 0; i < sig.x.length; i += 5) p = Math.max(p, Math.abs(sig.x[i] as number));
    peaks.set(sig, p);
  }
  return p;
}

export function Scope(p: { sig: FrameSignal | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const bench = D.bench.value;
  const revealed = D.revealed.value;
  const sig = p.sig;

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(200, Math.round(cv.clientWidth * dpr));
    const H = Math.round(200 * dpr);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    ctx.fillStyle = '#08071a';
    ctx.fillRect(0, 0, W, H);
    if (!sig) return;
    const lock = bench.syncLock;
    const k = Math.max(0, Math.min(sig.sync.locked.length - SWEEPS - 3, revealed - 1));
    const peak = peakOf(sig);
    const sweepLen = lock ? sig.sync.fit.P : (bench.lineTimeMs / 1000) * sig.info.sampleRate;
    // grid
    ctx.strokeStyle = '#1d1b40';
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      ctx.beginPath();
      ctx.moveTo((i * W) / 10, 0);
      ctx.lineTo((i * W) / 10, H);
      ctx.stroke();
    }
    // long sweep: three line times in a row
    const topH = 64 * dpr;
    ctx.strokeStyle = '#4ff0c4';
    ctx.lineWidth = dpr;
    const s0 = sweepStart(sig, k, lock, bench.lineTimeMs) - PRE;
    trace(ctx, sig.x, s0, sweepLen * 3, 0, W, topH / 2, topH * 0.42, peak);
    ctx.strokeStyle = '#2a2750';
    ctx.beginPath();
    ctx.moveTo(0, topH + 4 * dpr);
    ctx.lineTo(W, topH + 4 * dpr);
    ctx.stroke();
    // stacked sweeps, one line time each
    const slot = (H - topH - 14 * dpr) / SWEEPS;
    for (let i = 0; i < SWEEPS; i++) {
      const from = sweepStart(sig, k + i, lock, bench.lineTimeMs) - PRE;
      ctx.strokeStyle = `rgba(79, 240, 196, ${0.35 + (0.65 * (i + 1)) / SWEEPS})`;
      trace(ctx, sig.x, from, sweepLen + PRE, 0, W, topH + 10 * dpr + slot * (i + 0.5), slot * 0.9, peak);
    }
    // the trigger point
    const xt = (PRE / (sweepLen + PRE)) * W;
    ctx.strokeStyle = lock ? 'rgba(232, 182, 74, 0.9)' : 'rgba(155, 123, 255, 0.7)';
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.beginPath();
    ctx.moveTo(xt, topH + 6 * dpr);
    ctx.lineTo(xt, H);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [sig, bench.syncLock, bench.lineTimeMs, revealed]);

  return (
    <figure class="pic-scope" data-scope-trigger={bench.syncLock ? 'edge' : 'free'}>
      <canvas ref={ref} aria-label="Oscilloscope of the tape signal: a long sweep of three lines, and eight successive sweeps of one line time each" />
      <figcaption class="note">
        {!sig
          ? 'Waiting for the signal ...'
          : bench.syncLock
            ? 'Triggered on each line\'s own falling edge: the edges stand in one column, whatever the tape\'s speed does.'
            : 'Free-running: each sweep starts one line time after the last. If the edges walk across the stack, the line time is off.'}
      </figcaption>
    </figure>
  );
}
