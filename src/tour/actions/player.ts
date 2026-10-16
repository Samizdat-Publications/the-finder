// "Do it for me" in The Player, on the turntable's own controls: the speed typed into the "Beats per turn" box,
// the needle's drop point pressed on the platter, the direction button, Drop and Lift. The speed is the cover's
// turn time (data/cover.json record.rotationPeriod read through the key: binaryToSeconds, the hydrogen period);
// the drop point is the middle of the lead-in groove (src/record/groove.ts: R_OUTER_MUSIC_MM to
// R_LEAD_IN_OUTER_MM, 146.05 to 149.05 mm; the bots use 147.5 mm, inside the same band). The first sound is
// proposed by the instrument itself once the stylus has heard it (PlayerInstrument.tsx), up to 90 s.

import coverJson from '../../../data/cover.json';
import { turntable as T } from '../../game/state';
import { R_LEAD_IN_OUTER_MM, R_OUTER_MUSIC_MM } from '../../record/groove';
import { binaryToSeconds } from '../../science/units';
import { BEAT_S } from '../../ui/units';
import { SPEED_STEP_S } from '../../chapters/player/constants';
import { click, ensureChapter, finish, isConfirmed, press, proposeAndConfirm, setValue, sleep, tap, viewBoxToScreen, waitEnabled, waitFor } from '../actionsKit';

/** The cover's turn time, s: its binary count of hydrogen periods (cover.md; about 3.59994 s, controls.md). */
const TURN_S = binaryToSeconds(coverJson.record.rotationPeriod.binary);
/** Where the needle goes down: the middle of the lead-in, mm. */
const LEAD_IN_MM = (R_OUTER_MUSIC_MM + R_LEAD_IN_OUTER_MM) / 2;

async function ready(): Promise<void> {
  await ensureChapter('player');
  await waitFor('.playerinst[data-player-ready="true"]', 30_000, 'the turntable');
}

/** Type the cover's turn time into the speed box (the control rounds it to its 0.005-beat step). */
async function setSpeed(): Promise<void> {
  if (Math.abs(T.secondsPerTurn.value - TURN_S) <= SPEED_STEP_S / 2 + 1e-9) return;
  const box = await waitEnabled<HTMLInputElement>('input.pnum', 10_000, 'the speed box');
  setValue(box, (TURN_S / BEAT_S).toFixed(4), 'change');
  await waitFor(() => Math.abs(T.secondsPerTurn.value - TURN_S) <= SPEED_STEP_S / 2 + 1e-9, 10_000, 'the platter to take the speed');
}

/** Press the platter at the lead-in, straight above the spindle (viewBox units are mm). */
async function aimAtLeadIn(): Promise<void> {
  const svg = await waitFor(() => document.querySelector<SVGSVGElement>('svg.platter'), 10_000, 'the platter');
  const inBand = (): boolean => {
    const mm = Number(svg.getAttribute('data-target-mm'));
    return mm >= R_OUTER_MUSIC_MM && mm <= R_LEAD_IN_OUTER_MM;
  };
  if (inBand()) return;
  const [x, y] = viewBoxToScreen(svg, 0, -LEAD_IN_MM);
  tap(svg, x, y);
  await waitFor(() => (inBand() ? true : null), 5000, 'the drop point to move to the outermost groove');
}

/** Choose clockwise on the direction buttons (the Drop button waits for a direction). */
async function chooseClockwise(): Promise<void> {
  const btn = await waitEnabled('button.pdir[data-direction="cw"]', 10_000, 'the clockwise button');
  if (btn.getAttribute('aria-pressed') !== 'true') click(btn);
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
    await aimAtLeadIn();
    await chooseClockwise();
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
    await proposeAndConfirm('player.direction', async () => {
      await press('[data-propose-button="player.direction"]', 10_000, 'the direction\'s Propose button');
    });
  });
}

/** Drop the needle at the lead-in (lifting first if it rests anywhere else). */
async function dropAtLeadIn(): Promise<void> {
  await setSpeed();
  await aimAtLeadIn();
  await chooseClockwise();
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
