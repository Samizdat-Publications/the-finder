// Structural similarity (SSIM) matching scikit-image's structural_similarity defaults for 8-bit
// grayscale, the metric the Python reference used for its 96 kHz versus 384 kHz comparison
// (tools/ref-decoder/make_slices.py): 7 x 7 uniform window, K1 0.01, K2 0.03, data range 255, sample
// covariance (normalized by 48/49), mean SSIM over the image with a 3-pixel border cropped (skimage
// crops (win_size - 1) / 2, so the filter's boundary mode never matters).

export const SSIM_WIN = 7;
export const SSIM_K1 = 0.01;
export const SSIM_K2 = 0.03;

/** Mean SSIM of two same-size row-major grayscale images. */
export function ssim(a: ArrayLike<number>, b: ArrayLike<number>, width: number, height: number, dataRange = 255): number {
  if (a.length !== width * height || b.length !== width * height) throw new Error('image size mismatch');
  const w = SSIM_WIN;
  const r = (w - 1) / 2;
  const np = w * w;
  const covNorm = np / (np - 1);
  const C1 = (SSIM_K1 * dataRange) ** 2;
  const C2 = (SSIM_K2 * dataRange) ** 2;
  // integral images of x, y, x^2, y^2, xy over the whole picture
  const W1 = width + 1;
  const I = [0, 1, 2, 3, 4].map(() => new Float64Array(W1 * (height + 1)));
  for (let y = 0; y < height; y++) {
    const rs = [0, 0, 0, 0, 0];
    for (let x = 0; x < width; x++) {
      const p = a[y * width + x] as number;
      const q = b[y * width + x] as number;
      const vals = [p, q, p * p, q * q, p * q];
      for (let k = 0; k < 5; k++) {
        rs[k] = (rs[k] as number) + (vals[k] as number);
        const Ik = I[k] as Float64Array;
        Ik[(y + 1) * W1 + x + 1] = (Ik[y * W1 + x + 1] as number) + (rs[k] as number);
      }
    }
  }
  const box = (k: number, y: number, x: number): number => {
    const Ik = I[k] as Float64Array;
    const y0 = y - r;
    const x0 = x - r;
    const y1 = y + r + 1;
    const x1 = x + r + 1;
    return ((Ik[y1 * W1 + x1] as number) - (Ik[y0 * W1 + x1] as number) - (Ik[y1 * W1 + x0] as number) + (Ik[y0 * W1 + x0] as number)) / np;
  };
  let sum = 0;
  let n = 0;
  for (let y = r; y < height - r; y++) {
    for (let x = r; x < width - r; x++) {
      const ux = box(0, y, x);
      const uy = box(1, y, x);
      const vx = covNorm * (box(2, y, x) - ux * ux);
      const vy = covNorm * (box(3, y, x) - uy * uy);
      const vxy = covNorm * (box(4, y, x) - ux * uy);
      const s = ((2 * ux * uy + C1) * (2 * vxy + C2)) / ((ux * ux + uy * uy + C1) * (vx + vy + C2));
      sum += s;
      n++;
    }
  }
  return sum / n;
}
