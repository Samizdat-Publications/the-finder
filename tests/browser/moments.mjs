// The staged moments in the bots (M4 step 7e): after a deduction with a moment is confirmed, the moment covers
// the screen; a bot skips it through the same control a player uses (its Continue button), optionally after
// capturing it. src/ui/momentState.ts lists the deductions; this list is the same.
export const MOMENT_IDS = ['map.region', 'spot.age', 'trail.origin', 'trail.neighbour', 'trail.when'];

/**
 * If a staged moment shows, optionally capture it (after settleMs, so its camera ease and text have landed),
 * then press its Continue button and wait for it to go; repeat for any queued after it. Throws if the game state
 * differs before and after a moment. Returns the ids skipped.
 * @param {import('playwright').Page} page
 * @param {{ shot?: (id: string) => Promise<void>, settleMs?: number, waitMs?: number }} [opts]
 */
export async function skipMoments(page, opts = {}) {
  const ids = [];
  for (let i = 0; i < MOMENT_IDS.length; i++) {
    const el = await page.waitForSelector('[data-moment]', { timeout: i === 0 ? (opts.waitMs ?? 4000) : 800 }).catch(() => null);
    if (!el) break;
    const id = await el.getAttribute('data-moment');
    const n = await el.getAttribute('data-moment-n');
    if (opts.shot) {
      await page.waitForTimeout(opts.settleMs ?? 0);
      await opts.shot(id);
    }
    const before = await page.evaluate(() => JSON.stringify(window.__finder.state().game));
    await page.click('[data-moment-skip]');
    await page.waitForFunction((k) => document.querySelector(`[data-moment-n="${k}"]`) === null, n);
    const after = await page.evaluate(() => JSON.stringify(window.__finder.state().game));
    // A moment only reads the game: skipping it leaves the state exactly as it was.
    if (after !== before) throw new Error(`the ${id} moment changed the game state`);
    ids.push(id);
  }
  return ids;
}
