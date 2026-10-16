// The detector's audible click: one short, quiet tick per counted alpha, through the shared audio context and
// the interface's master level (so the volume and mute settings apply; reduced motion does not affect it).
// Nothing plays before the player's first gesture has started the context. Browser module.

import { mixer, sharedContext } from '../../audio/mixer';
import { createRng, type Rng } from '../../science/random';

/** Peak gain of one click relative to the master (quiet: a tick under the other interface sounds). */
const CLICK_GAIN = 0.16;
/** At most this many clicks are voiced per sample; more would be a buzz anyway. */
const MAX_CLICKS = 24;

let buffer: AudioBuffer | null = null;

function clickBuffer(ctx: BaseAudioContext): AudioBuffer {
  if (buffer && buffer.sampleRate === ctx.sampleRate) return buffer;
  const n = Math.round(ctx.sampleRate * 0.006);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  const rng = createRng('spot/click');
  for (let i = 0; i < n; i++) d[i] = (2 * rng.uniform() - 1) * Math.exp(-i / (n / 6));
  buffer = b;
  return b;
}

/** Voice `n` clicks spread over the next `spanS` seconds (times from the given stream). */
export function playClicks(n: number, spanS: number, rng: Rng): void {
  if (n <= 0 || !mixer.ctx || !mixer.master) return;
  const ctx = sharedContext();
  if (ctx.state !== 'running') return;
  const buf = clickBuffer(ctx);
  const master = mixer.master;
  const t0 = ctx.currentTime + 0.02;
  for (let i = 0; i < Math.min(n, MAX_CLICKS); i++) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = CLICK_GAIN;
    src.connect(g);
    g.connect(master);
    src.start(t0 + rng.uniform() * spanS);
  }
}
