// The album and two work views on it: the colour mixer (three consecutive frames stacked as three primaries) and
// the turntable for "which way is up". Every picture is the decoder's, from the tape, with the player's settings.
// The mixer composes the three decoded greys (src/dsp/colour.ts): a real triple blooms into colour, any other
// pick comes out a misregistered smear. Proposals go through the command bus.

import { useEffect, useMemo, useRef } from 'preact/hooks';
import { compose } from '../../dsp/colour';
import { confirmedSet, decoder as D } from '../../game/state';
import { Clamp } from '../../ui/Fine';
import { send } from '../../ui/send';
import { album, benchSettings, developOne, developSide, developing, runningSide, stopSide } from './album';
import { nodeStatus } from '../../game/deductions';
import { ALBUM_FRAMES, BARRY_TO_CW, channelFrames, frameRow } from './checkersM5';
import { Crop, Numerals } from './Crop';
import { quarterTurns, stackStart, turnFrame, view } from './workState';

/** Clockwise quarter turns to show a frame upright, once the player has found which way is up. */
export function uprightTurns(frame: string): number {
  return confirmedSet.value.has('pictures.down') ? (BARRY_TO_CW[frameRow(frame).orientationBarry] ?? 0) : 0;
}

/** The three frames from a first one along its track, or null at the track's end. */
export function stackFrom(first: string): [string, string, string] | null {
  const ch = channelFrames(frameRow(first).channel);
  const i = ch.indexOf(first);
  return i >= 0 && i + 2 < ch.length ? [ch[i]!, ch[i + 1]!, ch[i + 2]!] : null;
}

function Thumb(p: { frame: string; onPick: (f: string) => void; marked: boolean }) {
  const pic = album.value[p.frame];
  const t = uprightTurns(p.frame);
  return (
    <li class={`pic-thumb${p.marked ? ' marked' : ''}${pic ? '' : ' empty'}`} data-album-frame={p.frame} data-developed={pic ? 'true' : 'false'}>
      <button type="button" disabled={!pic} onClick={() => p.onPick(p.frame)} title={p.frame} aria-label={`Frame ${p.frame}${pic ? '' : ', not developed yet'}`}>
        {pic ? <img src={pic.thumb} alt="" style={t ? { transform: `rotate(${t * 90}deg) scale(${t % 2 ? 0.66 : 1})` } : undefined} /> : <span>{p.frame === developing.value ? '...' : ''}</span>}
      </button>
    </li>
  );
}

export function AlbumGrid(p: { onPick: (f: string) => void; marked?: readonly string[] }) {
  const n = Object.keys(album.value).length;
  const busy = D.status.value === 'loading' || D.status.value === 'decoding' || D.status.value === 'revealing';
  const run = runningSide.value;
  return (
    <section class="pic-album" aria-label="The album of decoded pictures" data-album-count={n}>
      <header class="pic-album-head">
        <span class="pic-album-count">
          <Numerals value={n} height={18} /> <span class="note">of {ALBUM_FRAMES.length} frames developed</span>
        </span>
        {run ? (
          <button type="button" class="btn small" onClick={stopSide} data-album-stop="">
            Stop after this frame
          </button>
        ) : (
          <>
            <button type="button" class="btn small" disabled={busy || n === ALBUM_FRAMES.length} onClick={() => void developSide('record').catch(() => undefined)} data-album-play="">
              Play the side at record speed
            </button>
            <button type="button" class="btn small" disabled={busy || n === ALBUM_FRAMES.length} onClick={() => void developSide('fast').catch(() => undefined)} data-album-develop="">
              Develop the rest at once
            </button>
          </>
        )}
      </header>
      {['L', 'R'].map((ch) => (
        <ol class="pic-album-track" key={ch} aria-label={`Track ${ch === 'L' ? 'one' : 'two'}`}>
          {channelFrames(ch).map((f) => (
            <Thumb key={f} frame={f} onPick={p.onPick} marked={p.marked?.includes(f) ?? false} />
          ))}
        </ol>
      ))}
    </section>
  );
}

/** The decoded composite of three frames as a canvas (computed once per pick). */
function Composite(p: { frames: [string, string, string] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pics = p.frames.map((f) => album.value[f]);
  const c = useMemo(() => (pics.every(Boolean) ? compose(pics[0]!, pics[1]!, pics[2]!) : null), [p.frames.join(), pics.every(Boolean)]);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx || !c) return;
    cv.width = c.width;
    cv.height = c.height;
    const img = ctx.createImageData(c.width, c.height);
    img.data.set(c.rgba);
    ctx.putImageData(img, 0, 0);
  }, [c]);
  if (!c) return null;
  return <canvas ref={ref} class="pic-composite" role="img" aria-label="The three frames stacked as red, green and blue light" data-composite={p.frames.join(',')} />;
}

export function ColourMixer() {
  const first = stackStart.value;
  const three = first ? stackFrom(first) : null;
  const status = confirmedSet.value.has('pictures.colour');
  return (
    <div class="pic-work pic-mixer" data-work="colour">
      <Clamp>Pick a picture in the album: it and the two after it on its track go onto the mixer as three primaries.</Clamp>
      {three && (
        <div class="pic-mix-row">
          <div class="pic-mix-greys">
            {three.map((f, i) => (
              <figure key={f} class={`pic-mix-sep sep${i}`}>
                <Crop frame={f} label={`Frame ${f} as one primary`} scale={0.34} turns={uprightTurns(f)} />
                <figcaption>{f}</figcaption>
              </figure>
            ))}
          </div>
          <Composite frames={three} />
        </div>
      )}
      {three && !status && (
        <button type="button" class="btn small" data-propose-button="pictures.colour" onClick={() => send({ type: 'deduction.propose', id: 'pictures.colour', answer: { frames: three } })}>
          Propose: these three are one picture
        </button>
      )}
      <AlbumGrid onPick={(f) => (stackStart.value = f)} marked={three ?? []} />
    </div>
  );
}

export function TurnTable() {
  const f = turnFrame.value;
  const t = quarterTurns.value;
  const done = confirmedSet.value.has('pictures.down');
  return (
    <div class="pic-work pic-turn" data-work="turn">
      <Clamp>Pick a picture in the album and turn it until it looks like the world it shows: people standing, water lying flat.</Clamp>
      {f && (
        <div class="pic-turn-row">
          <div class="pic-turn-stage">
            <Crop frame={f} label={`Frame ${f}, turned`} scale={0.62} turns={t} />
          </div>
          <div class="pic-turn-tools hero-control">
            <button type="button" class="btn small" data-turn="-1" onClick={() => (quarterTurns.value = (t + 3) % 4)}>
              Turn anticlockwise
            </button>
            <button type="button" class="btn small" data-turn="1" onClick={() => (quarterTurns.value = (t + 1) % 4)}>
              Turn clockwise
            </button>
            {!done && (
              <button type="button" class="btn small" data-propose-button="pictures.down" onClick={() => send({ type: 'deduction.propose', id: 'pictures.down', answer: { frame: f, quarterTurns: t } })}>
                Propose: this way is up
              </button>
            )}
          </div>
        </div>
      )}
      <AlbumGrid
        onPick={(x) => {
          turnFrame.value = x;
          quarterTurns.value = 0;
        }}
        marked={f ? [f] : []}
      />
    </div>
  );
}

export function AlbumView() {
  const open = nodeStatus('pictures.album', confirmedSet.value) === 'open';
  return (
    <div class="pic-work" data-work="album">
      {open && (
        <button
          type="button"
          class="btn small"
          data-propose-button="pictures.album"
          onClick={() => send({ type: 'deduction.propose', id: 'pictures.album', answer: { developed: Object.keys(album.value).sort(), settings: { ...benchSettings() } } })}
        >
          Propose: the side is developed
        </button>
      )}
      <AlbumGrid
        onPick={(f) => {
          view.value = 'decoder';
          void developOne(f).catch(() => undefined);
        }}
      />
    </div>
  );
}
