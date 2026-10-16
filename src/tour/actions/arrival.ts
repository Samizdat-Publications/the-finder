// "Do it for me" in Arrival: open the scan the deduction is about, then click the answer on the instrument
// (the choice buttons propose at once; the decay clock has its own Propose button). The choice ids are the
// instrument's own (src/chapters/arrival/choices.ts), the same right answers the slice bot plays
// (tests/browser/slice.browser.mjs).

import { click, ensureChapter, finish, press, proposeAndConfirm, waitEnabled, waitFor } from '../actionsKit';

const READY_MS = 90_000;

/** The scene is ready (or failed: the scans work without the 3D view). */
async function ready(): Promise<void> {
  await ensureChapter('arrival');
  await waitFor('[data-instrument="arrival"][data-scene="ready"], [data-instrument="arrival"][data-scene="failed"]', READY_MS, 'the Arrival scene');
}

async function scan(tab: string): Promise<void> {
  await press(`[data-scan-tab="${tab}"]`, 20_000, `the ${tab} scan tab`);
  await waitFor(`[data-panel="${tab}"]`, 10_000, `the ${tab} scan`);
}

function choose(node: string, tab: string, choice: string): () => Promise<void> {
  return () =>
    finish(node, async () => {
      await ready();
      await scan(tab);
      const btn = await waitEnabled(`[data-answer="${node}"] button.ar-choice[data-choice="${choice}"]`, 20_000, 'the answer button');
      await proposeAndConfirm(node, () => click(btn));
    });
}

export const purpose = choose('arrival.purpose', 'structure', 'radio');
export const heat = choose('arrival.heat', 'heat', 'decay');
export const madeNotMined = choose('arrival.madeNotMined', 'isotopes', 'made');

export function fuelAge(): Promise<void> {
  return finish('arrival.fuelAge', async () => {
    await ready();
    await scan('clock');
    const radio = await waitEnabled<HTMLInputElement>('input[data-chain-choice="pu238"]', 20_000, 'the plutonium chain');
    if (!radio.checked) click(radio);
    await waitFor(() => (document.querySelector<HTMLInputElement>('input[data-chain-choice="pu238"]')?.checked ? true : null), 5000, 'the chain to be chosen');
    await proposeAndConfirm('arrival.fuelAge', async () => {
      await press('button[data-propose-chain]', 10_000, 'the decay clock\'s Propose button');
    });
  });
}
