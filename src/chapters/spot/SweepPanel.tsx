// The detector sweep: the count rate under the probe with a strip chart of the last few seconds, the probe
// keys (for a keyboard), and the mark the player proposes. The counts come from the seeded sweep stream in
// SpotInstrument; nothing here knows where the spot is.

import { nodeStatus } from '../../game/deductions';
import { confirmedSet, game } from '../../game/state';
import { GlyphSvg } from '../../ui/Glyph';
import { UNIT_KEY, quantity, toAlien } from '../../ui/units';
import { sig } from './checkers';
import { Panel, propose } from './parts';

/** Seconds per sample of the sweep (the dwell of each count) and how many samples the strip chart holds. */
export const SAMPLE_S = 0.2;
export const HISTORY = 75;
/** The rate readout averages the last this many samples (3 s). */
const RATE_SAMPLES = 15;

export type Pt = [number, number];

export interface SweepProps {
  probe: Pt | null;
  mark: Pt | null;
  history: readonly (number | null)[];
  onKeyMove: (dx: number, dy: number) => void;
  onMark: () => void;
}

function Strip(p: { history: readonly (number | null)[] }) {
  const W = 300;
  const H = 64;
  const max = Math.max(4, ...p.history.map((n) => n ?? 0));
  const bw = W / HISTORY;
  const off = HISTORY - p.history.length;
  return (
    <svg class="sp-strip" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Counts in each fifth of a second over the last fifteen seconds">
      <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} class="axisline" />
      {p.history.map((n, i) =>
        n === null ? null : (
          <rect key={i} x={(off + i) * bw + 0.5} width={Math.max(1, bw - 1)} y={H - (n / max) * (H - 4)} height={(n / max) * (H - 4)} class="bar" />
        ),
      )}
    </svg>
  );
}

export function SweepPanel(p: SweepProps) {
  const id = 'spot.find';
  const status = nodeStatus(id, confirmedSet.value);
  const recent = p.history.slice(-RATE_SAMPLES).filter((n): n is number => n !== null);
  const counts = recent.reduce((s, n) => s + n, 0);
  const rateS = recent.length ? counts / (recent.length * SAMPLE_S) : null;
  const gloss = game.settings.value.humanGloss;
  const q = rateS === null ? null : quantity('frequency', rateS);
  return (
    <Panel id={id} title="Detector sweep" glyph="detector">
      <p class="sp-small">
        Move the probe over the plate (pointer, or the probe keys below); every alpha particle it catches clicks. Click the plate to mark a point.
      </p>
      <div class="sp-readout" aria-live="off">
        <span class="k">count rate</span>
        <span class="v" data-rate={rateS ?? ''}>
          {q ? (
            <>
              <span class="num">{q.number}</span> <GlyphSvg k={UNIT_KEY.frequency} height={15} class="unit" />
              {gloss && <span class="si"> ({q.si})</span>}
            </>
          ) : (
            <span class="dim">probe off the plate</span>
          )}
        </span>
        <span class="k">
          counts in the last {sig(toAlien('time', RATE_SAMPLES * SAMPLE_S), 2)} {UNIT_KEY.time}s
        </span>
        <span class="v num">{recent.length ? counts : '-'}</span>
      </div>
      <Strip history={p.history} />
      <div class="sp-row">
        <button
          type="button"
          class="btn small sp-pad"
          data-probe-keys
          aria-label="Probe keys: arrow keys move the probe, Shift for longer steps, Enter marks the point"
          onKeyDown={(e) => {
            const step = e.shiftKey ? 10 : 2;
            const d: Record<string, Pt> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
            const v = d[e.key];
            if (v) {
              p.onKeyMove(v[0], v[1]);
              e.preventDefault();
            } else if (e.key === 'Enter') {
              p.onMark();
              e.preventDefault();
            }
          }}
          onClick={() => undefined}
        >
          Probe keys
        </button>
        <span class="sp-small">{p.mark ? 'Marked: the cyan cross on the plate.' : 'No point marked yet.'}</span>
      </div>
      {status === 'open' && (
        <button
          type="button"
          class="btn"
          data-propose="spot.find"
          disabled={!p.mark}
          onClick={() => p.mark && propose(id, { xMm: Math.round(p.mark[0] * 10) / 10, yMm: Math.round(p.mark[1] * 10) / 10 })}
        >
          Something is here
        </button>
      )}
    </Panel>
  );
}
