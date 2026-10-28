// "Do it for me" in Arrival: open the scan the deduction is about, give it a beat so its readings can be seen,
// then click the answer on the instrument (the choice buttons propose at once; the decay clock has its own
// Propose button). On the decay clock the guide shows its work (V1 polish, 2026-10-28): it tries each other chain
// in turn, so each curve is seen to miss or meet the measurement, and ends on the plutonium chain. The choice ids
// are the instrument's own (src/chapters/arrival/choices.ts), the same right answers the slice bot plays
// (tests/browser/slice.browser.mjs).

import { CHOICES } from '../../chapters/arrival/choices';
import { beat, click, ensureChapter, finish, press, proposeAndConfirm, reveal, waitEnabled, waitFor } from '../actionsKit';

const READY_MS = 90_000;

/** The scene is ready (or failed: the scans work without the 3D view). */
async function ready(): Promise<void> {
  await ensureChapter('arrival');
  await waitFor('[data-instrument="arrival"][data-scene="ready"], [data-instrument="arrival"][data-scene="failed"]', READY_MS, 'the Arrival scene');
}

async function scan(tab: string): Promise<void> {
  const btn = document.querySelector(`[data-scan-tab="${tab}"]`);
  const already = btn?.getAttribute('aria-pressed') === 'true';
  await press(`[data-scan-tab="${tab}"]`, 20_000, `the ${tab} scan tab`);
  await waitFor(`[data-panel="${tab}"]`, 10_000, `the ${tab} scan`);
  if (!already) await beat(900); // the scan's readings, before the answer
}

function choose(node: string, tab: string, choice: string): () => Promise<void> {
  return () =>
    finish(node, async () => {
      await ready();
      await scan(tab);
      const btn = await waitEnabled(`[data-answer="${node}"] button.ar-choice[data-choice="${choice}"]`, 20_000, 'the answer button');
      reveal(btn);
      await beat(400);
      await proposeAndConfirm(node, () => click(btn));
    });
}

export const purpose = choose('arrival.purpose', 'structure', 'radio');
export const heat = choose('arrival.heat', 'heat', 'decay');
export const madeNotMined = choose('arrival.madeNotMined', 'isotopes', 'made');

/** Pick a chain on the decay clock and wait until it is the one drawn. */
async function pickChain(id: string): Promise<void> {
  const radio = await waitEnabled<HTMLInputElement>(`input[data-chain-choice="${id}"]`, 20_000, 'the chain');
  if (!radio.checked) click(radio);
  await waitFor(() => (document.querySelector<HTMLInputElement>(`input[data-chain-choice="${id}"]`)?.checked ? true : null), 5000, 'the chain to be chosen');
}

export function fuelAge(): Promise<void> {
  return finish('arrival.fuelAge', async () => {
    await ready();
    await scan('clock');
    // Each other chain in turn, a beat on each curve against the measurement (about 2.4 s), then the plutonium chain.
    for (const c of CHOICES['arrival.fuelAge'] ?? []) {
      if (c.id === 'pu238') continue;
      await pickChain(c.id);
      await beat(800);
    }
    await pickChain('pu238');
    await beat(700);
    await proposeAndConfirm('arrival.fuelAge', async () => {
      await press('button[data-propose-chain]', 10_000, 'the decay clock\'s Propose button');
    });
  });
}
