// The rest of the record on the turntable: every item after the pictures in the record's order, one face at a
// time (the face of the track in view first), with D-A17's side break shown as an inference, each played through
// the command bus (the same turntable The Player built: speed and direction from the cover, the needle dropped
// where the item begins). Above it the spectrogram of the track in view, with the needle's place on it; a click
// drops the needle there, a drag marks a stretch (voices.others). While the drag runs, the stretch shows what it
// holds, from the same measurement the checker uses (measureStretch: held calls wholly inside, speech touching
// it, for music held tones), and each held call inside is drawn as a bright trace at its pitch from its start to
// its end. Nothing is drawn outside the player's own stretch, so the finding stays theirs. On release the
// stretch plays once. Track titles are the human gloss: the alien reads kinds and numbers.

import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import recordJson from '../../../data/record.json';
import { dispatch } from '../../game/bus';
import { onStartOver } from '../../game/resetHooks';
import { COVER_PERIOD_S, radiusAtItemStart } from '../../game/model';
import { game, turntable as T } from '../../game/state';
import { pluralKey } from '../../ui/message';
import { quantity } from '../../ui/units';
import { analyse, jobProgress, peekResult } from './analysisClient';
import { DISPLAY } from './analysisJobs';
import { TRACKS, measureStretch, trackById, type StretchMeasure, type TrackRef } from './data';
import { Progress, Q } from './parts';

/** The track the spectrogram shows, and the stretch marked on it (instrument state, not game state). */
export const viewTrack = signal<string>('ozma-02');
export const marked = signal<{ track: string; start: number; end: number } | null>(null);
/** The stretch under the player's drag, before release (shown live, never proposed). */
export const dragging = signal<{ track: string; start: number; end: number } | null>(null);
onStartOver(() => {
  viewTrack.value = 'ozma-02';
  marked.value = null;
  dragging.value = null;
  stopStretch();
});

/** How the alien names an item: its kind and its place on the disc. */
export function trackLabel(t: TrackRef): string {
  if (t.kind === 'music') return `music ${t.musicNumber}`;
  const same = TRACKS.filter((x) => x.kind === t.kind);
  return same.length > 1 ? `${t.kind === 'greeting' ? 'voices' : t.kind} ${same.indexOf(t) + 1}` : t.kind === 'sounds' ? 'sounds' : t.kind;
}

/** A length as plain text in the alien's units (with the human gloss when it is on), for a tooltip. */
function lengthText(s: number): string {
  const q = quantity('time', s);
  return `${q.number} ${q.number === '1' ? q.unitKey : pluralKey(q.unitKey)}${game.settings.value.humanGloss ? ` (${q.si})` : ''}`;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** What a stretch holds, in words: the same measurement voices.others is checked on (data.ts measureStretch). */
export function holdsText(m: StretchMeasure | null): string {
  if (!m) return 'not measured';
  if (m.kind === 'music') return `music: ${plural(m.heldTones, 'held tone', 'held tones')}`;
  const calls = plural(m.calls.length, 'held call', 'held calls');
  const speech = m.speech.length ? plural(m.speech.length, 'stretch of speech', 'stretches of speech') : 'no speech';
  return `${calls}, ${speech}`;
}

/** Play an item from an offset (s): the cover's speed and direction, the needle where that moment lies. */
export async function playTrack(id: string, offsetS = 0): Promise<void> {
  const t = trackById(id);
  if (!t) return;
  stopStretch();
  if (Math.abs(T.secondsPerTurn.value - COVER_PERIOD_S) > 1e-9) await dispatch({ type: 'turntable.setSpeed', secondsPerTurn: COVER_PERIOD_S });
  if (T.direction.value !== 'cw') await dispatch({ type: 'turntable.setDirection', direction: 'cw' });
  if (T.side.value !== t.side) await dispatch({ type: 'turntable.load', side: t.side });
  await dispatch({ type: 'turntable.drop', radiusMm: radiusAtItemStart(t.side, id, Math.max(0, Math.min(offsetS, t.durationS - 0.5))) });
}

/** The watch on a marked stretch being played once: lifts the needle at the stretch's end. */
let stretchWatch: number | null = null;
function stopStretch(): void {
  if (stretchWatch !== null) window.clearInterval(stretchWatch);
  stretchWatch = null;
}

/**
 * Play a marked stretch once: the needle dropped at its start and lifted (through the bus) when the engine reports
 * it past the end. Anything else that moves the needle (another track, a click, a lift) ends the watch.
 */
export async function playStretch(id: string, start: number, end: number): Promise<void> {
  await playTrack(id, start);
  const t0 = Date.now();
  // The engine reports the needle every 50 ms (src/game/turntableService.ts); a slow start (the audio still
  // loading) is allowed for with 20 s of slack before the watch gives up.
  const limitMs = (end - start) * 1000 + 20_000;
  let started = false;
  stretchWatch = window.setInterval(() => {
    const n = T.needle.value;
    const here = n?.down && n.itemId === id && n.offsetS !== null ? n.offsetS : null;
    // Started once the needle reads inside the stretch (an older reading from before the drop never counts).
    if (here !== null && here >= start - 1 && here < end) started = true;
    if ((started && here === null) || Date.now() - t0 > limitMs) return stopStretch();
    if (started && here !== null && here >= end) {
      stopStretch();
      void dispatch({ type: 'turntable.lift' }).catch(() => undefined);
    }
  }, 60);
}

export function TrackList() {
  const playing = T.needle.value?.down ? T.needle.value.itemId : null;
  const gloss = game.settings.value.humanGloss;
  const brk = recordJson.sideBreak.afterMusic;
  const viewedSide = trackById(viewTrack.value)?.side ?? 1;
  const [face, setFace] = useState(viewedSide);
  useEffect(() => setFace(viewedSide), [viewedSide]);
  return (
    <div class="vo-tracks" data-tracks="" data-face-shown={face}>
      <div class="vo-faces" role="tablist" aria-label="Faces of the disc">
        {[1, 2].map((side) => (
          <button key={side} type="button" role="tab" class={`vo-facetab${face === side ? ' on' : ''}`} aria-selected={face === side} data-face={side} onClick={() => setFace(side)}>
            Face {side}
          </button>
        ))}
        <span class="vo-infer" title="The record does not say where one face ends and the other begins.">the break after music {brk} is an inference</span>
      </div>
      <ol class="vo-list" aria-label={`Face ${face}`}>
        {TRACKS.filter((t) => t.side === face).map((t) => (
          <li key={t.id} class={`vo-track${playing === t.id ? ' playing' : ''}${viewTrack.value === t.id ? ' viewed' : ''}`} data-track={t.id} title={`${trackLabel(t)}${gloss ? `, ${t.title}` : ''}: ${lengthText(t.durationS)}`}>
            <button type="button" class="vo-play" data-play={t.id} aria-label={`Play ${trackLabel(t)}`} onClick={() => { viewTrack.value = t.id; void playTrack(t.id).catch(() => undefined); }}>
              {playing === t.id ? '■' : '▶'}
            </button>
            <button type="button" class="vo-name" data-view={t.id} onClick={() => (viewTrack.value = t.id)}>
              {trackLabel(t)}
              {gloss && <span class="si"> {t.title}</span>}
            </button>
          </li>
        ))}
      </ol>
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
  const dr = dragging.value?.track === id ? dragging.value : null;
  const mk = marked.value?.track === id ? marked.value : null;
  const shown = dr ?? mk;
  const holds = shown ? measureStretch(id, shown.start, shown.end) : null;
  const drag = useRef<{ x0: number; t0: number } | null>(null);
  const timeAt = (e: PointerEvent): number => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * t.durationS;
  };
  const frac = (s: number): number => Math.max(0, Math.min(1, s / t.durationS));
  const pct = (s: number): string => `${(frac(s) * 100).toFixed(3)}%`;
  // The canvas's top row: the highest bin's upper edge (src/dsp/spectrum.ts spectrogram), about DISPLAY.maxHz.
  const topHz = res ? res.spec.bins * res.spec.binHz : DISPLAY.maxHz;
  const progress = jobProgress.value[`${id}/display`];
  // The tag that says what the stretch holds sits at the stretch's left edge, or its right in the right part.
  const tagRight = shown ? frac(shown.start) > 0.55 : false;
  return (
    <div class="vo-spec" data-spectrogram={id} data-ready={res ? 'true' : 'false'}>
      <div class="vo-spechead">
        <span class="plabel">
          <b class="vo-viewname">{trackLabel(t)}</b>
          {game.settings.value.humanGloss && <span class="si"> {t.title}</span>}
          <span class="dim">, <Q dim="time" si={t.durationS} digits={3} /></span>
        </span>
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
            dragging.value = { track: id, start: Math.min(d.t0, t1), end: Math.max(d.t0, t1) };
          }
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          dragging.value = null;
          if (!d) return;
          if (Math.abs(e.clientX - d.x0) > 4) {
            const t1 = timeAt(e);
            const m = { track: id, start: Math.min(d.t0, t1), end: Math.max(d.t0, t1) };
            marked.value = m;
            void playStretch(id, m.start, m.end).catch(() => undefined);
          } else void playTrack(id, d.t0).catch(() => undefined);
        }}
        onPointerCancel={() => {
          drag.current = null;
          dragging.value = null;
        }}
      >
        <canvas ref={canvas} class="vo-canvas" aria-label={`Spectrogram of ${trackLabel(t)}`} />
        {shown && (
          <>
            <div class={`vo-mark${dr ? ' live' : ''}`} data-mark="" data-calls={holds?.calls.length ?? 0} style={{ left: pct(shown.start), width: pct(shown.end - shown.start) }} />
            {holds && (
              <svg class="vo-held" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
                {holds.speech.map(([a, b], i) => {
                  // Speech runs touching the stretch, cut to it: a thin band along the bottom.
                  const x0 = frac(Math.max(a, shown.start)) * 1000;
                  const x1 = frac(Math.min(b, shown.end)) * 1000;
                  return <rect key={`s${i}`} class="vo-speechrun" x={x0} width={Math.max(0.5, x1 - x0)} y={96} height={4} />;
                })}
                {holds.calls.map((c, i) => {
                  const y = (1 - Math.min(1, c.hz / topHz)) * 100;
                  return <line key={`c${i}`} class="vo-call" data-call-hz={c.hz.toFixed(0)} x1={frac(c.startS) * 1000} x2={frac(c.endS) * 1000} y1={y} y2={y} />;
                })}
              </svg>
            )}
            <span class={`vo-holds${tagRight ? ' right' : ''}`} data-holds={holdsText(holds)} style={tagRight ? { right: `${((1 - frac(shown.end)) * 100).toFixed(3)}%` } : { left: pct(shown.start) }}>
              {holdsText(holds)}
            </span>
          </>
        )}
        {here !== null && <div class="vo-needle" data-needle={here.toFixed(2)} style={{ left: pct(here) }} />}
      </div>
      <p class="note small vo-spechelp">
        Up: pitch, to <Q dim="frequency" si={DISPLAY.maxHz} digits={2} />. Click to play from a moment; drag across to mark a stretch and hear it.
      </p>
    </div>
  );
}
