// The Pictures: every measurement its checkers make on a decoded picture of the real 1977 tape. Pure: it
// imports only src/dsp, the science units and data/ (no DOM), so Node tests and the browser run the same
// numbers. Each checker decodes the calibration frame (L000) with the player's settings and measures what
// those settings did: the slant, the line-start wobble, the even/odd comb, the shade of the slide mount
// at the frame's edges, the roundness of the circle.

import coverJson from '../../../data/cover.json';
import { decodeFrame, decodeLines, makeJob, measureInterlace, planLines, syncFrame, toTapeUnits, type DecodedFrame, type FrameSync } from '../../dsp/decode';
import { fitEllipse, ringPoints, type EllipseFit } from '../../dsp/ellipse';
import { argmax, pyInt, unwrap } from '../../dsp/numeric';
import { BASE_RATE, DECODER_DATA, periodPrior, referenceParams, type Channel, type DecodeParams } from '../../dsp/params';
import { refineEdge, robustLineFit } from '../../dsp/sync';
import { binaryToSeconds } from '../../science/units';

/** The calibration frame: the record's first picture, a circle (tools/ref-decoder/README.md section 7). */
export const CIRCLE_FRAME = 'L000';

/** The cover's etched line time, s: 101101001100000000000000 hydrogen periods = 8.3396 ms (cover.md section 1c). */
export const COVER_LINE_S = binaryToSeconds(coverJson.picture.lineTime.binary);

/** Samples at 384 kHz: the cover's line time on the tape's header clock (3202.4). */
export const COVER_PERIOD_384 = COVER_LINE_S * BASE_RATE;

/**
 * Fraction: the most the tape runs fast against the cover anywhere on the reel, computed from every frame's
 * fitted line period in data/decoder.json (README section 3: the transport drifts from 0.14% to 0.29% fast
 * along the reel; at the median 0.23%). No line time can be called wrong for missing the tape by less than
 * the tape's own speed error: about 0.29%.
 */
export const TAPE_SPEED_OFFSET_MAX = COVER_PERIOD_384 / Math.min(...Object.values(DECODER_DATA.frames).map((f) => f.periodSamples384k)) - 1;

/** Samples at 384 kHz rms: wow and flutter, the line starts' wobble about a straight line (README section 3: 4.6). */
export const WOW_FLUTTER_RMS_384 = 4.6;

/** Samples at 384 kHz rms: the short-term jitter of the sync edges themselves (README section 3: 1.8). */
export const SYNC_JITTER_RMS_384 = 1.8;

/**
 * Samples at 384 kHz: how close to zero the even/odd comb must come: the interquartile range of the
 * interlace offset across all frames (README section 6: 6.98 to 8.02), the spread one frame cannot beat.
 */
export const COMB_TOLERANCE_384 = DECODER_DATA.reference.interlaceIqr384k[1] - DECODER_DATA.reference.interlaceIqr384k[0];

/** Axis ratio tolerance of a round circle (README section 7: 1.00 +/- 0.01). */
export const ROUND_TOLERANCE = 0.01;

/**
 * Pixels: the width of the frame's outer ring taken as the slide mount (about 1% of the 355-row height).
 * Chosen once, before measuring, as "the outermost few pixels"; the polarity test reports how the cue holds
 * on every frame with it (src/chapters/pictures/pictures.test.ts).
 */
export const MOUNT_BORDER_PX = 4;

/** What the decoders need from a slice entry (data/frames.json). */
export interface SliceInfo {
  frame: string;
  channel: Channel;
  gain: number;
  firstLineOffset: number;
  sampleRate: number;
}

/** A frame's signal in tape units with its sync found once. */
export interface FrameSignal {
  info: SliceInfo;
  x: Float64Array;
  sync: FrameSync;
}

/** Samples (int16 / 32768, as decodeAudioData and the WAV reader give them) to a frame signal. */
export function frameSignal(info: SliceInfo, samples: ArrayLike<number>): FrameSignal {
  const x = toTapeUnits(samples, info.gain);
  return { info, x, sync: syncFrame(x, info.sampleRate, info.firstLineOffset, periodPrior(info.frame)) };
}

/** The player's settings, as the instrument proposes them (the bench knobs). */
export interface PictureSettings {
  /** ms: the free-running line time (used only with syncLock off). */
  lineTimeMs: number;
  syncLock: boolean;
  interlace: boolean;
  polarity: 'negative' | 'positive';
  rows: number;
}

/** Decoder parameters for these settings: droop correction is always on (not a puzzle in this slice). */
export function paramsFor(sig: FrameSignal, s: PictureSettings): DecodeParams {
  const ref = referenceParams(sig.info.channel, sig.info.sampleRate);
  return {
    ...ref,
    nRows: s.rows,
    // The parity level profile is per reference row; it is a small correction, dropped when the rows change.
    parityProfile: s.rows === ref.nRows ? ref.parityProfile : null,
    delta: s.interlace ? ref.delta : 0,
    polarity: s.polarity,
    syncLock: s.syncLock,
    linePeriod: s.syncLock ? null : s.lineTimeMs * (BASE_RATE / 1000),
  };
}

/** The reference settings (what the reference decoder uses); tests and the circle checker compare against them. */
export const REFERENCE_SETTINGS: PictureSettings = {
  lineTimeMs: COVER_LINE_S * 1000,
  syncLock: true,
  interlace: true,
  polarity: 'negative',
  rows: DECODER_DATA.geometry.nRows,
};

/** For each used line start, the real sync edge within half a line, and the offsets (decode.py measure_slant). */
function edgeOffsets(sig: FrameSignal, starts: ArrayLike<number>): { ks: number[]; offs: Float64Array } {
  const { x, sync } = sig;
  const r = sync.r;
  const pTrue = sync.fit.P;
  const lastEdge = sync.raw[sync.raw.length - 1] as number;
  const half = pTrue / 2;
  const ks: number[] = [];
  const offs: number[] = [];
  for (let k = 0; k < starts.length; k++) {
    const u = starts[k] as number;
    if (u + half > lastEdge + 30 * r) break;
    const lo = pyInt(u - half);
    const hi = pyInt(u + half);
    if (lo < 0 || hi >= x.length) continue;
    const c = lo + argmax(sync.box, lo, hi);
    const [e] = refineEdge(x, c, r);
    if (Number.isFinite(e)) {
      ks.push(k);
      offs.push(e - u);
    }
  }
  return { ks, offs: unwrap(offs, pTrue) };
}

export interface LineTiming {
  /** Samples at 384 kHz per line: how far the real sync edge drifts from the used line start each line. */
  slant384: number;
  /** Samples at 384 kHz rms: the line starts' wobble about that straight drift. */
  wobble384: number;
  /** Lines measured. */
  n: number;
  /** Samples at 384 kHz per line: the largest slant the tape's own speed error allows on this frame. */
  slantLimit384: number;
  /** The frame's true line period, samples at 384 kHz. */
  period384: number;
}

/**
 * Slant and wobble of the line starts these settings use (free-running: line 1's edge plus k times the line
 * time; locked: each line's own edge), measured against the real sync edges as decode.py measure_slant does.
 */
export function lineTiming(sig: FrameSignal, s: PictureSettings): LineTiming {
  const plan = planLines(sig.sync, paramsFor(sig, s));
  const { ks, offs } = edgeOffsets(sig, plan.starts);
  const fit = robustLineFit(ks, offs, true);
  const r = sig.sync.r;
  const period384 = sig.sync.fit.P / r;
  // The slope fit's own scatter from wow and flutter: sigma_slope = rms * sqrt(12 / N^3) for N evenly spaced lines.
  const n = ks.length;
  const slopeSigma = WOW_FLUTTER_RMS_384 * Math.sqrt(12 / n ** 3);
  return {
    slant384: fit.P / r,
    wobble384: fit.rms / r,
    n,
    slantLimit384: TAPE_SPEED_OFFSET_MAX * period384 + 3 * slopeSigma,
    period384,
  };
}

/**
 * The even/odd comb: the content shift between long-pulse and short-pulse lines, in samples at 384 kHz,
 * decoded at one row per 384 kHz sample with the sync locked (decode_all.py: max lag 40, min peak 0.5).
 */
export function evenOddComb(sig: FrameSignal, interlace: boolean): number {
  const p = paramsFor(sig, { ...REFERENCE_SETTINGS, interlace });
  const pf: DecodeParams = { ...p, nRows: Math.trunc(p.w1 - p.w0), parityProfile: null };
  const job = makeJob(sig.x, sig.sync, pf);
  const V = new Float64Array(pf.nRows * job.nLines);
  decodeLines(job, 0, job.nLines, V);
  return measureInterlace(V, pf.nRows, sig.sync.parityLong, 40, 0.5).offset;
}

/** Decode with these settings (memoised per signal and settings: the checkers often ask twice). */
const memo = new WeakMap<FrameSignal, Map<string, DecodedFrame>>();
export function decodeWith(sig: FrameSignal, s: PictureSettings): DecodedFrame {
  const key = JSON.stringify([s.lineTimeMs, s.syncLock, s.interlace, s.polarity, s.rows]);
  let m = memo.get(sig);
  if (!m) memo.set(sig, (m = new Map()));
  const hit = m.get(key);
  if (hit) return hit;
  const d = decodeFrame(sig.x, sig.sync, paramsFor(sig, s));
  if (m.size > 6) m.delete(m.keys().next().value as string);
  m.set(key, d);
  return d;
}

/**
 * The slide mount cue: mean grey of the frame's outer ring (MOUNT_BORDER_PX wide) and of its central half,
 * in the decoded 8-bit picture. Each frame is a photograph of a slide in its mount, and no light comes
 * through a mount: in a right reading the border is the darker (images-and-audio.md section 1).
 */
export function mountCue(d: DecodedFrame): { border: number; centre: number; margin: number } {
  const { width: W, height: H, gray } = d;
  const b = MOUNT_BORDER_PX;
  let sb = 0;
  let nb = 0;
  let sc = 0;
  let nc = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = gray[y * W + x] as number;
      if (x < b || x >= W - b || y < b || y >= H - b) {
        sb += v;
        nb++;
      } else if (x >= W / 4 && x < (3 * W) / 4 && y >= H / 4 && y < (3 * H) / 4) {
        sc += v;
        nc++;
      }
    }
  }
  const border = sb / nb;
  const centre = sc / nc;
  return { border, centre, margin: centre - border };
}

/**
 * The calibration circle's ring, fitted with an ellipse (as aspect.py). The ring is found on the float
 * picture with more signal read as darker (-values, larger = lighter), so the fit does not depend on the
 * display polarity.
 */
export function circleFit(d: DecodedFrame): EllipseFit {
  const pts = ringPoints(d.values.map((v) => -v), d.width, d.height);
  return fitEllipse(pts.xs, pts.ys);
}
