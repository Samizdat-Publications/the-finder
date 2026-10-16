// How a region's contour level is written (M4 step 7e, from the QA audit): a point far outside the region
// once read "the 100.000% contour", which says nothing. Levels above 99.9% (chi-square 13.82 for two degrees of
// freedom, the 99.9% contour the checks already use: src/science/triangulation.ts CHI2_2DOF_999) read as
// "beyond the 99.9% contour"; below, the level with its usual figures. Pure.

/** The highest contour level written as a number (99.9%). */
export const CONTOUR_CAP = 0.999;

/** A contour level as a percentage, or "beyond 99.9%". */
export function contourPct(level: number, digits = 1): string {
  return level > CONTOUR_CAP ? 'beyond 99.9%' : `${(level * 100).toFixed(digits)}%`;
}

/** Where a point lies: "on the 97.3% contour", or "beyond the 99.9% contour". */
export function onContour(level: number, digits = 1): string {
  return level > CONTOUR_CAP ? 'beyond the 99.9% contour' : `on the ${(level * 100).toFixed(digits)}% contour`;
}
