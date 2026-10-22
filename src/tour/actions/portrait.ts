// "Do it for me" in Portrait: the clocks band's own handle (portraitHandle(), as The Map's chartHandle()) moves the
// marker "When it left" to the four clocks' combined time, computed from the player's own confirmed results, and
// the band's Propose button is pressed. The staged sky moment that follows is skipped with its own button.

import { portraitHandle } from '../../chapters/portrait/state';
import { ensureChapter, finish, proposeWith, sleep, waitFor } from '../actionsKit';

export function together(): Promise<void> {
  return finish('portrait.together', async () => {
    await ensureChapter('portrait');
    await waitFor('[data-instrument="portrait"] [data-portrait-marker]', 30_000, 'the marker on the clocks band');
    const h = await waitFor(() => portraitHandle(), 10_000, 'the clocks band');
    const c = h.combined();
    if (!c) throw new Error('Not every clock is read yet.');
    h.setMarker(c.mean);
    await sleep(250);
    await proposeWith('portrait.together', '[data-portrait-propose]');
  });
}
