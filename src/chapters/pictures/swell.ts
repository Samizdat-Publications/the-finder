// The harmonic swell when the circle comes out round. A PLACEHOLDER tone until the sound pass (M3 step 7):
// six harmonics of 110 Hz (amplitude 1/n) rising over 1.6 s, holding, and fading over 3 s, at the player's
// master volume. Browser only (Web Audio). If the browser has not allowed audio yet, it stays silent.

let ctx: AudioContext | null = null;

export function playSwell(volume: number): void {
  if (volume <= 0 || typeof AudioContext === 'undefined') return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    const t0 = ctx.currentTime + 0.05;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t0);
    out.gain.linearRampToValueAtTime(0.18 * volume, t0 + 1.6);
    out.gain.setValueAtTime(0.18 * volume, t0 + 2.4);
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + 5.4);
    out.connect(ctx.destination);
    for (let n = 1; n <= 6; n++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 110 * n;
      g.gain.value = 1 / n / 2.45; // the harmonics sum to about 1
      o.connect(g).connect(out);
      o.start(t0 + (n - 1) * 0.12);
      o.stop(t0 + 5.6);
    }
  } catch {
    // no audio device: the caption still says what sounded
  }
}
