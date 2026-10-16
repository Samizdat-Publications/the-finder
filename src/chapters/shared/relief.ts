// Raking-light relief: the cover's etched strokes used as a height map (grooves cut into a flat plate) and
// shaded by one distant lamp. Light from straight above shows the marks only faintly; light skimming the
// plate makes one wall of every groove glint and the other fall into shadow, so every mark stands out.
// Pure: works on plain arrays, no DOM (the viewer rasterises the strokes and hands the coverage in).

export interface Lamp {
  /** Direction the light comes FROM, degrees counter-clockwise from screen right. */
  azimuthDeg: number;
  /** Height of the lamp above the plate, degrees: 90 is straight overhead, near 0 skims the surface. */
  elevationDeg: number;
}

export interface ReliefOptions {
  /** Box-blur radius in pixels that rounds the groove walls (at least 1). */
  blurPx: number;
  /** Steepness of the groove walls: the tangent of the wall angle at full coverage gradient. */
  wallSlope: number;
  /** Plate colour, 0 to 255 each. */
  rgb: [number, number, number];
  /** Light that reaches everywhere (scattered), 0 to 1. */
  ambient: number;
}

export const DEFAULT_RELIEF: ReliefOptions = { blurPx: 1, wallSlope: 0.7, rgb: [232, 182, 74], ambient: 0.12 };

/** One horizontal then one vertical box blur (radius r), in place on a copy. */
export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += src[row + Math.min(w - 1, Math.max(0, x + k))] as number;
      tmp[row + x] = s / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x] as number;
      out[y * w + x] = s / n;
    }
  }
  return out;
}

/** Unit vector pointing from the plate toward the lamp, in screen axes (x right, y down, z out of the screen). */
export function lampVector(l: Lamp): [number, number, number] {
  const az = (l.azimuthDeg * Math.PI) / 180;
  const el = (Math.max(0, Math.min(90, l.elevationDeg)) * Math.PI) / 180;
  return [Math.cos(el) * Math.cos(az), -Math.cos(el) * Math.sin(az), Math.sin(el)];
}

/**
 * Shade the plate. `coverage` is 0 (bare plate) to 1 (inside a stroke) per pixel; the groove depth follows
 * it. `inside` marks pixels on the plate (others come out transparent). Writes RGBA into `out`.
 */
export function shadeRelief(
  coverage: Float32Array,
  inside: Uint8Array,
  w: number,
  h: number,
  lamp: Lamp,
  out: Uint8ClampedArray,
  opt: ReliefOptions = DEFAULT_RELIEF,
): void {
  const r = Math.max(1, Math.round(opt.blurPx));
  const b = boxBlur(coverage, w, h, r);
  const [lx, ly, lz] = lampVector(lamp);
  // A wall slope s at the steepest gradient of a blurred step (1 / (2r + 1) per pixel).
  const k = opt.wallSlope * (2 * r + 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 4;
      if (!inside[i]) {
        out[o + 3] = 0;
        continue;
      }
      // height = -depth x coverage, so the surface normal is (d cov/dx, d cov/dy, 1) scaled by k
      const gx = ((b[i + (x < w - 1 ? 1 : 0)] as number) - (b[i - (x > 0 ? 1 : 0)] as number)) * 0.5 * k;
      const gy = ((b[i + (y < h - 1 ? w : 0)] as number) - (b[i - (y > 0 ? w : 0)] as number)) * 0.5 * k;
      const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      const lambert = Math.max(0, (gx * lx + gy * ly + lz) * inv);
      const shade = Math.min(1.25, opt.ambient + (1 - opt.ambient) * lambert);
      out[o] = opt.rgb[0] * shade;
      out[o + 1] = opt.rgb[1] * shade;
      out[o + 2] = opt.rgb[2] * shade;
      out[o + 3] = 255;
    }
  }
}

/** Michelson contrast of the shaded plate's luminance (for tests and the capture check). */
export function contrast(rgba: Uint8ClampedArray): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (let o = 0; o < rgba.length; o += 4) {
    if (rgba[o + 3] === 0) continue;
    const v = (rgba[o] as number) + (rgba[o + 1] as number) + (rgba[o + 2] as number);
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return hi + lo > 0 ? (hi - lo) / (hi + lo) : 0;
}
