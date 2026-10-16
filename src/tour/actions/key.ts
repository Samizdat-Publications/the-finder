// "Do it for me" in The Key: pick the reading in each panel's choices and press its Propose button. The choice
// ids are the panels' own (BinaryPanel.tsx, AtlasPanel.tsx, TimesPanel.tsx), the right answers the slice bot
// plays (tests/browser/slice.browser.mjs). In the atlas the spin-flip row is opened first, as a player would.

import { click, ensureChapter, finish, press, proposeAndConfirm, waitEnabled, waitFor } from '../actionsKit';

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
      await proposeAndConfirm(node, async () => {
        await press(`fieldset[data-propose="${node}"] [data-propose-button="${node}"]`, 10_000, 'the Propose button');
      });
    });
}

export const binary = choose('key.binary', 'across-one');
export const unit = choose('key.unit', 'hyperfine', async () => {
  const row = document.querySelector('button.atlasrow[data-atlas="hyperfine"]');
  if (row) click(row);
});
export const timesNotLengths = choose('key.timesNotLengths', 'times');
