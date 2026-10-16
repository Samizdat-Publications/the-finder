// The rest of the record on the turntable: every item after the pictures in the record's order, face by face,
// with D-A17's side break shown as an inference, each played through the command bus (the same turntable The
// Player built: speed and direction from the cover, the needle dropped where the item begins). Beside it the
// spectrogram of the track in view, with the needle's place on it; a click drops the needle there, a drag marks
// a stretch (voices.others). Track titles are the human gloss: the alien reads kinds and numbers.

import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import recordJson from '../../../data/record.json';
import { dispatch } from '../../game/bus';
import { COVER_PERIOD_S, radiusAtItemStart } from '../../game/model';
import { game, turntable as T } from '../../game/state';
import { analyse, jobProgress, peekResult } from './analysisClient';
import { DISPLAY } from './analysisJobs';
import { TRACKS, trackById, type TrackRef } from './data';
import { Progress, Q } from './parts';

/** The track the spectrogram shows, and the stretch marked on it (instrument state, not game state). */
export const viewTrack = signal<string>('ozma-02');
export const marked = signal<{ track: string; start: number; end: number } | null>(null);

/** How the alien names an item: its kind and its place on the disc. */
export function trackLabel(t: TrackRef): string {
  if (t.kind === 'music') return `music ${t.musicNumber}`;
  const same = TRACKS.filter((x) => x.kind === t.kind);
  return same.length > 1 ? `${t.kind === 'greeting' ? 'voices' : t.kind} ${same.indexOf(t) + 1}` : t.kind === 'sounds' ? 'sounds' : t.kind;
}

/** Play an item from an offset (s): the cover's speed and direction, the needle where that moment lies. */
export async function playTrack(id: string, offsetS = 0): Promise<void> {
  const t = trackById(id);
  if (!t) return;
  if (Math.abs(T.secondsPerTurn.value - COVER_PERIOD_S) > 1e-9) await dispatch({ type: 'turntable.setSpeed', secondsPerTurn: COVER_PERIOD_S });
  if (T.direction.value !== 'cw') await dispatch({ type: 'turntable.setDirection', direction: 'cw' });
  if (T.side.value !== t.side) await dispatch({ type: 'turntable.load', side: t.side });
  await dispatch({ type: 'turntable.drop', radiusMm: radiusAtItemStart(t.side, id, Math.max(0, Math.min(offsetS, t.durationS - 0.5))) });
}

export function TrackList() {
  const playing = T.needle.value?.down ? T.needle.value.itemId : null;
  const gloss = game.settings.value.humanGloss;
  const brk = recordJson.sideBreak.afterMusic;
  return (
    <div class="vo-tracks" data-tracks="">
      {[1, 2].map((side) => (
        <section key={side} class="vo-face" aria-label={`Face ${side}`}>
          <h3 class="vo-facehead">
            Face {side}
            {side === 2 && <span class="vo-infer"> (where one face ends and the other begins, after music {brk}, is an inference: the record does not say)</span>}
          </h3>
          <ol class="vo-list">
            {TRACKS.filter((t) => t.side === side).map((t) => (
              <li key={t.id} class={`vo-track${playing === t.id ? ' playing' : ''}${viewTrack.value === t.id ? ' viewed' : ''}`} data-track={t.id}>
                <button type="button" class="vo-play" data-play={t.id} aria-label={`Play ${trackLabel(t)}`} onClick={() => { viewTrack.value = t.id; void playTrack(t.id).catch(() => undefined); }}>
                  {playing === t.id ? '■' : '▶'}
                </button>
                <button type="button" class="vo-name" data-view={t.id} onClick={() => (viewTrack.value = t.id)}>
                  {trackLabel(t)}
                  {gloss && <span class="si"> {t.title}</span>}
                </button>
                <span class="vo-len"><Q dim="time" si={t.durationS} digits={3} /></span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** The spectrogram of the track in view, drawn from the Worker's analysis of its runtime audio. */
export function SpectrogramView() {
  const id = viewTrack.value;
  const t = trackById(id)!;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(0);
  const res = peekResult(id, 'display');
  useEffect(() => {
    let live = true;
    void analyse(id, 'display').then(() => live && setReady((n) => n + 1)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [id]);
  useEffect(() => {
    const el = canvas.current;
    if (!el || !res) return;
    const s = res.spec;
    el.width = s.frames;
    el.height = s.bins;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(s.frames, s.bins);
    for (let j = 0; j < s.frames; j++) {
      for (let k = 0; k < s.bins; k++) {
        const v = (s.data[j * s.bins + k]! / 255) ** 1.6;
        const o = ((s.bins - 1 - k) * s.frames + j) * 4;
        // dark violet to cyan to white
        img.data[o] = Math.round(255 * Math.max(0, v * 1.6 - 0.6) + 20 * (1 - v));
        img.data[o + 1] = Math.round(255 * Math.min(1, v * 1.25) * 0.94);
        img.data[o + 2] = Math.round(60 + 160 * Math.min(1, v * 1.4));
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [res, ready]);

  const n = T.needle.value;
  const here = n?.down && n.itemId === id && n.offsetS !== null ? n.offsetS : null;
  const m = marked.value?.track === id ? marked.value : null;
  const drag = useRef<{ x0: number; t0: number } | null>(null);
  const [live, setLive] = useState<{ a: number; b: number } | null>(null);
  const timeAt = (e: PointerEvent): number => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * t.durationS;
  };
  const pct = (s: number): string => `${((s / t.durationS) * 100).toFixed(3)}%`;
  const progress = jobProgress.value[`${id}/display`];
  return (
    <div class="vo-spec" data-spectrogram={id} data-ready={res ? 'true' : 'false'}>
      <div class="vo-spechead">
        <span class="plabel">Pitch against time, {trackLabel(t)}: low at the bottom, up to <Q dim="frequency" si={DISPLAY.maxHz} digits={2} /> at the top</span>
        {!res && <Progress f={progress ?? 0} what="reading the track" />}
      </div>
      <div
        class="vo-specbox"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x0: e.clientX, t0: timeAt(e) };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d && Math.abs(e.clientX - d.x0) > 4) {
            const t1 = timeAt(e);
            setLive({ a: Math.min(d.t0, t1), b: Math.max(d.t0, t1) });
          }
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          if (Math.abs(e.clientX - d.x0) > 4) {
            const t1 = timeAt(e);
            marked.value = { track: id, start: Math.min(d.t0, t1), end: Math.max(d.t0, t1) };
            setLive(null);
          } else void playTrack(id, d.t0).catch(() => undefined);
        }}
      >
        <canvas ref={canvas} class="vo-canvas" aria-label={`Spectrogram of ${trackLabel(t)}`} />
        {(live ?? (m ? { a: m.start, b: m.end } : null)) && (
          <div class="vo-mark" data-mark="" style={{ left: pct((live ?? { a: m!.start }).a), width: pct((live ? live.b - live.a : m!.end - m!.start)) }} />
        )}
        {here !== null && <div class="vo-needle" data-needle={here.toFixed(2)} style={{ left: pct(here) }} />}
      </div>
      <p class="note small vo-spechelp">Click to play from that moment; drag across to mark a stretch.</p>
    </div>
  );
}
