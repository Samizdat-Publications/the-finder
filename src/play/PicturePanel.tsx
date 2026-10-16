// The picture panel: pick a frame from the real image tape, decode it as the record would deliver it, and
// turn the decoder's knobs (including wrong settings) to see what each one does. Every control dispatches
// a command on the bus.

import { dispatch, type Command } from '../game/bus';
import { COVER_LINE_MS, LINE_MS_RANGE, REFERENCE_ROWS, ROWS_RANGE, TAPE_LINE_MS, lineTimePercentOff } from '../game/model';
import { decoder as D } from '../game/state';
import { FRAMES, frameEntry } from '../media/frames';
import { PictureCanvas } from './PictureCanvas';
import { Slider, Switch, fmtSigned } from './ui';

function send(cmd: Command, rerun = false): void {
  dispatch(cmd)
    .then(() => (rerun ? decodeAgain() : undefined))
    .catch(() => undefined);
}

/** A knob turned on a finished picture decodes it again at once (fast), so the effect is visible. */
function decodeAgain(): Promise<void> | undefined {
  const s = D.status.value;
  if ((s === 'done' || s === 'revealing') && D.picture.value) return dispatch({ type: 'decoder.run', speed: 'fast' });
  return undefined;
}

function roleText(role: string): string {
  return role === 'mono' ? 'mono' : `colour ${role}`;
}

export function PicturePanel() {
  const frame = D.frame.value;
  const entry = frameEntry(frame);
  const b = D.bench.value;
  const status = D.status.value;
  const busy = status === 'loading' || status === 'decoding';
  const isColour = entry.colourRole !== 'mono';
  const picture = D.picture.value;
  const colour = D.colour.value;
  const pct = lineTimePercentOff(b.lineTimeMs);
  const set = <K extends keyof typeof b>(name: K, value: (typeof b)[K], rerun = true): void =>
    send({ type: 'decoder.setParam', name, value } as Command, rerun);
  const again = (): void => void decodeAgain()?.catch(() => undefined);

  return (
    <section class="panel bench-panel" aria-labelledby="pic-h">
      <h2 id="pic-h">The pictures</h2>
      <p class="help">
        Each picture is decoded live from the 1977 image tape. The columns are the lines of the signal, left to right. Pictures are shown exactly as
        the decoder makes them, so some come out turned.
      </p>

      <div class="ctl">
        <label for="frame">
          <span>Frame ({FRAMES.length} on the tape)</span>
        </label>
        <select id="frame" value={frame} onChange={(e) => send({ type: 'decoder.select', frame: (e.currentTarget as HTMLSelectElement).value })}>
          {FRAMES.map((f) => (
            <option key={f.frame} value={f.frame}>
              {`${f.frame}  |  image ${f.image}  |  ${f.title}  |  ${roleText(f.colourRole)}`}
            </option>
          ))}
        </select>
      </div>

      <div class="row">
        <button type="button" class="btn primary" disabled={busy} onClick={() => send({ type: 'decoder.run', speed: 'record' })}>
          Decode at record speed
        </button>
        <button type="button" class="btn" disabled={busy} onClick={() => send({ type: 'decoder.run', speed: 'fast' })}>
          Decode fast
        </button>
        <span class="help">Record speed shows one line every {TAPE_LINE_MS.toFixed(2)} ms, about {((512 * TAPE_LINE_MS) / 1000).toFixed(1)} s a picture.</span>
      </div>
      {isColour && (
        <div class="row">
          <button type="button" class="btn" disabled={busy} onClick={() => send({ type: 'decoder.composeColour', image: entry.image })}>
            Compose colour (order R, G, B is probable, not proven)
          </button>
          <span class="help">
            Image {entry.image} is three frames ({FRAMES.filter((f) => f.image === entry.image)
              .map((f) => f.frame)
              .join(', ')}). Composing decodes all three with the settings below.
          </span>
        </div>
      )}
      {D.error.value && <p class="error" role="alert">{D.error.value}</p>}

      <div class="stage">
        <PictureCanvas />
        <p class="help status" aria-live="polite">
          {status === 'idle' && 'Ready.'}
          {status === 'loading' && 'Fetching the slice of tape ...'}
          {status === 'decoding' && 'Decoding in a Worker ...'}
          {status === 'revealing' && `Lines arriving: ${D.revealed.value} of ${picture?.width ?? 512}`}
          {status === 'done' && picture && `Decoded ${picture.frame}: ${picture.width} lines by ${picture.height} rows in ${picture.timings.totalMs.toFixed(0)} ms.`}
          {status === 'done' && colour && `Composed image ${colour.image} from ${colour.frames.join(', ')}. G moved ${colour.shiftG.shift.map((v) => v.toFixed(2)).join(', ')} and B moved ${colour.shiftB.shift.map((v) => v.toFixed(2)).join(', ')} pixels (rows, columns) to line up with R.`}
          {status === 'error' && 'The decode failed.'}
        </p>
      </div>

      <h3>Settings</h3>
      <Slider
        id="linetime"
        label="Line time"
        value={b.lineTimeMs}
        min={LINE_MS_RANGE.min}
        max={LINE_MS_RANGE.max}
        step={0.001}
        mark={COVER_LINE_MS}
        markLabel={`cover: ${COVER_LINE_MS.toFixed(4)} ms`}
        disabled={b.syncLock}
        readout={`${b.lineTimeMs.toFixed(4)} ms (${fmtSigned(pct)}%)`}
        onInput={(v) => set('lineTimeMs', v, false)}
        onCommit={again}
      />
      <p class="help sub">{b.syncLock ? 'Line time is used only when sync lock is off.' : 'Lines start at this fixed spacing from the first one.'}</p>
      <Switch
        label="Sync lock"
        help="On: every line starts at its own sync pulse. Off: lines start at the fixed line time."
        value={b.syncLock}
        options={[
          { value: true, text: 'On' },
          { value: false, text: 'Off' },
        ]}
        onPick={(v) => set('syncLock', v)}
      />
      <Switch
        label="Interlace offset"
        help="On: the shift between lines with long and short sync pulses is corrected."
        value={b.interlace}
        options={[
          { value: true, text: 'On' },
          { value: false, text: 'Off' },
        ]}
        onPick={(v) => set('interlace', v)}
      />
      <Switch
        label="Polarity"
        help="Normal: more signal is darker."
        value={b.polarity}
        options={[
          { value: 'negative', text: 'Normal' },
          { value: 'positive', text: 'Inverted' },
        ]}
        onPick={(v) => set('polarity', v)}
      />
      <Switch
        label="Droop correction"
        help="On: the sag of the AC-coupled signal along each line is undone."
        value={b.droop}
        options={[
          { value: true, text: 'On' },
          { value: false, text: 'Off' },
        ]}
        onPick={(v) => set('droop', v)}
      />
      <Slider
        id="rows"
        label="Rows per picture"
        value={b.rows}
        min={ROWS_RANGE.min}
        max={ROWS_RANGE.max}
        step={1}
        mark={REFERENCE_ROWS}
        markLabel={`reference: ${REFERENCE_ROWS}`}
        readout={`${b.rows} rows`}
        onInput={(v) => set('rows', v, false)}
        onCommit={again}
      />
      <div class="row">
        <button type="button" class="btn" onClick={() => send({ type: 'decoder.reset' }, true)}>
          Reset to reference
        </button>
      </div>
    </section>
  );
}
