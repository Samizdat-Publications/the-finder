// "Do it for me" in The Key: pick the reading in each panel's choices and press its Propose button, showing the
// work first (V1 polish, 2026-10-28): in the atlas each row is clicked in turn, so the table is seen to reread the
// cover's numbers with each transition (map numbers "too fast" until the spin flip), ending on the spin flip; in
// the other two panels a beat on the evidence and on the picked answer before Propose. The choice ids are the
// panels' own (BinaryPanel.tsx, AtlasPanel.tsx, TimesPanel.tsx), the right answers the slice bot plays
// (tests/browser/slice.browser.mjs).

import { TRANSITIONS } from '../../chapters/key/physics';
import { beat, click, ensureChapter, finish, press, proposeAndConfirm, reveal, waitEnabled, waitFor } from '../actionsKit';

async function ready(): Promise<void> {
  await ensureChapter('key');
  await waitFor('.keyinst[data-key-ready="true"]', 60_000, 'The Key');
}

function choose(node: string, choice: string, before?: () => Promise<void>): () => Promise<void> {
  return () =>
    finish(node, async () => {
      await ready();
      if (before) await before();
      const radio = await waitEnabled<HTMLInputElement>(`fieldset[data-propose="${node}"] input[data-choice="${choice}"]`, 20_000, 'the choice');
      if (!radio.checked) click(radio);
      await beat(600); // the picked answer, before Propose
      await proposeAndConfirm(node, async () => {
        await press(`fieldset[data-propose="${node}"] [data-propose-button="${node}"]`, 10_000, 'the Propose button');
      });
    });
}

/** Click each atlas row in turn (a beat on each table), ending on the spin flip, as the guide asks the player to. */
async function readAtlas(): Promise<void> {
  const others = TRANSITIONS.filter((t) => t.id !== 'hyperfine');
  for (const t of [...others, ...TRANSITIONS.filter((x) => x.id === 'hyperfine')]) {
    const row = await waitEnabled(`button.atlasrow[data-atlas="${t.id}"]`, 10_000, 'the atlas row');
    click(row);
    await waitFor(`[data-units="${t.id}"]`, 5000, 'the table to reread the numbers');
    await beat(t.id === 'hyperfine' ? 900 : 550);
  }
}

/** A beat on the times-or-lengths table, so its red "as a length" columns can be seen. */
async function readTable(): Promise<void> {
  const table = document.querySelector('[data-times-lengths]');
  if (table) reveal(table);
  await beat(1000);
}

export const binary = choose('key.binary', 'across-one');
export const unit = choose('key.unit', 'hyperfine', readAtlas);
export const timesNotLengths = choose('key.timesNotLengths', 'times', readTable);
