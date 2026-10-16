// Dev page for the encounter scene (/play/scene/): mounts it full-window with buttons to frame each
// hotspot. Query: ?reduced=1 turns drift off; ?clean=1 hides the buttons and readout (captures).
// Exposes the handle as window.__encounter for the browser test and captures.
import { mountEncounter, type EncounterHandle } from '../../world/encounter';

declare global {
  interface Window {
    __encounter?: EncounterHandle;
  }
}

const q = new URLSearchParams(location.search);
if (q.get('clean') === '1') document.body.classList.add('clean');
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const handle = mountEncounter(canvas, { reducedMotion: q.get('reduced') === '1' });
window.__encounter = handle;

const info = document.getElementById('info')!;
const hud = document.getElementById('hud')!;
handle.ready.then((i) => {
  const ra = (Math.atan2(i.sun.dirIcrs[1], i.sun.dirIcrs[0]) * 180) / Math.PI;
  const dec = (Math.asin(i.sun.dirIcrs[2]) * 180) / Math.PI;
  info.textContent =
    `Voyager 1, AD ${Math.floor(i.decimalYear)}, ${i.sun.distPc.toFixed(3)} pc from the Sun\n` +
    `Sun: mag ${i.sun.appMag.toFixed(2)} at RA ${((ra + 360) % 360).toFixed(2)}, Dec ${dec.toFixed(2)}\n` +
    `stars: ${i.counts.shown} shown (near ${i.counts.near}, sky ${i.counts.sky})`;
  const add = (label: string, fn: () => void): void => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', fn);
    hud.appendChild(b);
  };
  add('Overview', () => void handle.frame('overview'));
  for (const h of handle.hotspots) add(h.label, () => void handle.frame(h.id));
});
