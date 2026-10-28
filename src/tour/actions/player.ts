/// "Do it for me" in The Player, on the turntable's own controls, showing its work (V1 polish, 2026-10-28): the
// speed slider swept from where it stands to the cover's turn time so the platter is seen to speed up, the drop
// ring dragged out across the disc to the lead-in, the direction button with a beat to watch the microscope's
// grooves move inward, then Drop and Lift. The speed is the cover's turn time (data/cover.json
// record.rotationPeriod read through the key: binaryToSeconds, the hydrogen period); the drop point is the middle
// of the lead-in groove (src/record/groove.ts: R_OUTER_MUSIC_MM to R_LEAD_IN_OUTER_MM, 146.05 to 149.05 mm; the
// bots use 147.5 mm, inside the same band). The first sound is proposed by the instrument itself once the stylus
// has heard it (PlayerInstrument.tsx), up to 90 s.

import coverJson from '../../../data/cover.json';
import { turntable as T } from '../../game/state';
import { R_LEAD_IN_OUTER_MM, R_OUTER_MUSIC_MM } from '../../record/groove';
import { binaryToSeconds } from '../../science/units';
import { BEAT_S } from '../../ui/units';
import { SPEED_STEP_S } from '../../chapters/player/constants';
import { beat, click, ensureChapter, finish, isConfirmed, pointer, press, proposeAndConfirm, reveal, setValue, sleep, sweep, viewBoxToScreen, waitEnabled, waitFor } from '../actionsKit';

/** The cover's turn time, s: its binary count of hydrogen periods (cover.md; about 3.59994 s, controls.md). */
const TURN_S = binaryToSeconds(coverJson.record.rotationPeriod.binary);
/** Where the needle goes down: the middle of the lead-in, mm. */
const LEAD_IN_MM = (R_OUTER_MUSIC_MM + R_LEAD_IN_OUTER_MM) / 2;
/** How long the hand takes to move a control, ms (the spec allows about 4 s added per action). */
const SWEEP_MS = 1600;

async function ready(): Promise<void> {
  await ensureChapter('player');
  await waitFor('.playerinst[data-player-ready="true"]', 30_000, 'the turntable');
}

const speedRight = (): boolean => Math.abs(T.secondsPerTurn.value - TURN_S) <= SPEED_STEP_S / 2 + 1e-9;

/**
 * Sweep the speed slider to the cover's turn time, so the platter is seen to change speed (the slider snaps to its
 * 0.005-beat step, the nearest step to the cover's value). Should the slider not land, the typed box in the
 * "Fine tune" fold takes the value, as a player would type it.
 */
async function setSpeed(): Promise<void> {
  if (speedRight()) return;
  const slider = await waitEnabled<HTMLInputElement>('#pspeed', 10_000, 'the speed slider');
  await sweep(slider, TURN_S / BEAT_S, SWEEP_MS);
  try {
    await waitFor(() => speedRight(), 3000, 'the platter to take the speed');
  } catch {
    const box = await waitEnabled<HTMLInputElement>('input.pnum', 10_000, 'the speed box');
    setValue(box, (TURN_S / BEAT_S).toFixed(4), 'change');
    await waitFor(() => speedRight(), 10_000, 'the platter to take the speed');
  }
  await beat(700); // the platter at its new speed
}

/** Drag the drop ring out across the platter to the lead-in, straight above the spindle (viewBox units are mm). */
async function aimAtLeadIn(): Promise<void> {
  const svg = await waitFor(() => document.querySelector<SVGSVGElement>('svg.platter'), 10_000, 'the platter');
  const mmNow = (): number => Number(svg.getAttribute('data-target-mm'));
  const inBand = (): boolean => mmNow() >= R_OUTER_MUSIC_MM && mmNow() <= R_LEAD_IN_OUTER_MM;
  if (inBand()) return;
  reveal(svg);
  const from = Number.isFinite(mmNow()) ? mmNow() : 100;
  const steps = 14;
  // Through the drawing's own transform: the platter is a square drawing centred in a box that may be taller or wider
  // (it fills the height its controls leave), so viewBoxToScreen's box-equals-viewBox mapping would miss.
  const at = (mm: number): [number, number] => {
    const m = svg.getScreenCTM();
    if (!m) return viewBoxToScreen(svg, 0, -mm);
    const p = new DOMPoint(0, -mm).matrixTransform(m);
    return [p.x, p.y];
  };
  let [x, y] = at(from);
  pointer(svg, 'pointerdown', x, y, true);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; // ease in and out, as sweep() does
    [x, y] = at(from + (LEAD_IN_MM - from) * e);
    pointer(svg, 'pointermove', x, y, true);
    await sleep(SWEEP_MS / steps);
  }
  pointer(svg, 'pointerup', x, y, false);
  try {
    if (svg.hasPointerCapture(1)) svg.releasePointerCapture(1);
  } catch {
    // nothing captured
  }
  await waitFor(() => (inBand() ? true : null), 5000, 'the drop point to move to the outermost groove');
  await beat(500); // "The needle drops on the outermost groove"
}

/** Choose clockwise on the direction buttons (the Drop button waits for a direction). */
async function chooseClockwise(): Promise<void> {
  const btn = await waitEnabled('button.pdir[data-direction="cw"]', 10_000, 'the clockwise button');
  if (btn.getAttribute('aria-pressed') === 'true') return;
  click(btn);
  await waitFor('button.pdir.on[data-direction="cw"]', 5000, 'clockwise to be chosen');
}

export function speed(): Promise<void> {
  return finish('player.speed', async () => {
    await ready();
    await setSpeed();
    await proposeAndConfirm('player.speed', async () => {
      await press('[data-propose-button="player.speed"]', 10_000, 'the speed\'s Propose button');
    });
  });
}

export function start(): Promise<void> {
  return finish('player.start', async () => {
    await ready();
    await setSpeed();
    await chooseClockwise();
    await aimAtLeadIn();
    // Drop the needle: the instrument proposes where it went down (PlayerInstrument.tsx onDrop).
    await proposeAndConfirm('player.start', async () => {
      await press('button[data-drop]', 20_000, 'the Drop button');
    }, 90_000);
  });
}

export function direction(): Promise<void> {
  return finish('player.direction', async () => {
    await ready();
    await chooseClockwise();
    // Watch the microscope: each turn carries the groove inward, toward the centre, as a groove that plays from the rim must.
    const scope = document.querySelector('.microscope');
    if (scope) reveal(scope);
    await beat(1800);
    await proposeAndConfirm('player.direction', async () => {
      await press('[data-propose-button="player.direction"]', 10_000, 'the direction\'s Propose button');
    });
  });
}

/** Drop the needle at the lead-in (lifting first if it rests anywhere else). */
async function dropAtLeadIn(): Promise<void> {
  await setSpeed();
  await chooseClockwise();
  await aimAtLeadIn();
  await press('button[data-drop]', 20_000, 'the Drop button');
}

export function firstSound(): Promise<void> {
  return finish('player.firstSound', async () => {
    await ready();
    const n = T.needle.value;
    // A needle already playing from the lead-in is listened to as it is; otherwise it goes down at the lead-in.
    const playing = n?.down === true && T.side.value === 1 && T.direction.value === 'cw' && n.timeS !== null && n.timeS < 60;
    if (!playing) await dropAtLeadIn();
    try {
      await waitFor(() => isConfirmed('player.firstSound'), 45_000, 'the first sound');
    } catch {
      // once more from the lead-in (the needle may have been moved meanwhile)
      await dropAtLeadIn();
      await waitFor(() => isConfirmed('player.firstSound'), 45_000, 'the first sound');
    }
    await sleep(1500); // let the buzz be heard a moment
    const lift = document.querySelector<HTMLButtonElement>('button[data-lift]');
    if (lift && !lift.disabled) click(lift);
  });
}
