// The guide: the narrator panel of the guided tour. One stop at a time: what we are looking at, the one thing to
// do (or watch), and once the deduction is confirmed what we learned, the real story and a question to talk
// about. GuideBody is the whole panel; Guide puts it in the workbench's side column and StoryStage (a card on the
// hub) reuses it. Every button is a command on the bus (rule 5).

import { useEffect, useRef, useState } from 'preact/hooks';
import { confirmedSet, game } from '../game/state';
import { send } from '../ui/send';
import { SHOW_ME } from './actions';
import { lastRefused, nodeUnlocked, partDots, progressFraction } from './progress';
import { PARTS, STOPS } from './script';
import { CoverDrawing } from './CoverDrawing';
import { showWhere } from './Spotlight';
import { Text } from './text';
import type { Stop } from './types';
import { VoyagerNow } from './VoyagerNow';
import { showEpilogueSection } from '../chapters/epilogue/EpilogueInstrument';

function Head(p: { stop: Stop; step: number; furthest: number }) {
  const part = PARTS.find((x) => x.id === p.stop.part);
  const dots = partDots(p.step, p.furthest);
  const pct = Math.round(progressFraction(p.step) * 100);
  return (
    <header class="g-head">
      <div class="g-headline">
        <span class="g-part">{part?.title ?? p.stop.part}</span>
        <span class="g-count">
          Step {p.step + 1} of {STOPS.length}
        </span>
      </div>
      <div class="g-bar" role="progressbar" aria-label="Progress through the tour" aria-valuemin={0} aria-valuemax={STOPS.length} aria-valuenow={p.step + 1}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <ol class="g-dots" aria-label="Parts of the tour">
        {dots.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              class={`g-dot ${d.state}`}
              data-part={d.id}
              aria-current={d.state === 'current' ? 'step' : undefined}
              aria-label={`${d.title}${d.reachable ? '' : ' (not reached yet)'}`}
              title={d.title}
              disabled={!d.reachable}
              onClick={() => send({ type: 'tour.goto', step: d.first })}
            />
          </li>
        ))}
      </ol>
    </header>
  );
}

/**
 * While "Do it for me" or "Show me" runs, the player's own clicks, drags, wheel turns and keys outside the guide
 * are held back, so a child's click cannot move a control under the action and derail it. Only trusted (real)
 * input is held: the actions drive the instrument with synthetic events, which pass. Escape still works.
 */
let acting = 0;
const HELD = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'wheel', 'keydown', 'touchstart'] as const;
function holdInput(e: Event): void {
  if (acting === 0 || !e.isTrusted) return;
  if (e instanceof KeyboardEvent && e.key === 'Escape') return;
  const t = e.target;
  // the guide itself only: NOT [data-guide], which the workbench body also carries while touring (it holds the instrument)
  if (t instanceof Element && t.closest('.guide, .guide-col')) return;
  e.preventDefault();
  e.stopPropagation();
}
let holdInstalled = false;
function beginActing(): void {
  if (!holdInstalled) {
    for (const type of HELD) window.addEventListener(type, holdInput, { capture: true, passive: false });
    holdInstalled = true;
  }
  acting += 1;
  document.documentElement.classList.add('tour-acting');
}
function endActing(): void {
  acting = Math.max(0, acting - 1);
  if (acting === 0) document.documentElement.classList.remove('tour-acting');
}

function Turn(p: { stop: Stop; refused: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = SHOW_ME[p.stop.id];
  const watch = p.stop.kind === 'watch';
  const run = (): void => {
    if (!action || busy) return;
    setBusy(true);
    setError(null);
    beginActing();
    action()
      .catch((e: unknown) => setError(e instanceof Error ? e.message.split('\n')[0] ?? 'That did not work.' : 'That did not work.'))
      .finally(() => {
        endActing();
        setBusy(false);
      });
  };
  return (
    <section class={`g-turn ${p.stop.kind}`} data-turn={p.stop.kind}>
      <h3 class="g-label">{watch ? 'Watch' : 'Your turn'}</h3>
      {p.stop.todo && <Text text={p.stop.todo} />}
      <div class="g-actions">
        {watch ? (
          action && (
            <button type="button" class="btn g-main" data-guide-action="show" data-tour-act disabled={busy} onClick={run}>
              {busy ? 'Working...' : 'Show me'}
            </button>
          )
        ) : (
          <>
            <button type="button" class="btn g-main" data-guide-action="where" onClick={() => showWhere(p.stop.id)}>
              Show me where
            </button>
            {action && (
              <button type="button" class="btn g-second" data-guide-action="do" data-tour-act disabled={busy} onClick={run}>
                {busy ? 'Working...' : 'Do it for me'}
              </button>
            )}
          </>
        )}
      </div>
      {busy && (
        <p class="g-gentle" role="status" data-tour-hands-off>
          Hands off for a moment: the guide is working the instrument.
        </p>
      )}
      {p.refused && !busy && (
        <p class="g-gentle" role="status">
          Not quite. The instrument's result says why. Try again, or press Do it for me.
        </p>
      )}
      {error && (
        <p class="g-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function StopView(p: { stop: Stop; step: number; layout: 'column' | 'card' }) {
  const { stop, step } = p;
  const tour = game.tour.value;
  const confirmed = confirmedSet.value;
  const calm = game.settings.value.reducedMotion;
  const done = nodeUnlocked(stop, confirmed);
  const attempts = stop.node ? game.records.value[stop.node]?.attempts : undefined;
  const away = game.chapter.value !== stop.chapter;
  const last = step >= STOPS.length - 1;
  const scroller = useRef<HTMLDivElement>(null);
  const learned = useRef<HTMLElement>(null);
  const was = useRef(done);
  const [fresh, setFresh] = useState(false);
  // Our Frame: turn the chapter to the section this stop talks about.
  useEffect(() => {
    if (stop.section) showEpilogueSection(stop.section);
  }, [stop.id]);

  // When the deduction gets confirmed while we are looking, bring "What we just learned" into view and give it a soft glow.
  useEffect(() => {
    if (done && !was.current) {
      const box = scroller.current;
      const el = learned.current;
      if (box && el) {
        const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 28;
        box.scrollTo({ top: Math.max(0, top), behavior: calm ? 'auto' : 'smooth' });
      }
      setFresh(true);
      const t = window.setTimeout(() => setFresh(false), 3500);
      was.current = done;
      return () => window.clearTimeout(t);
    }
    was.current = done;
    return undefined;
  }, [done]);

  return (
    <div class={`guide guide-${p.layout}`} data-guide data-tour-step={step} data-stop={stop.id} data-kind={stop.kind}>
      <Head stop={stop} step={step} furthest={tour.furthest} />
      <div class="g-scroll" ref={scroller}>
        {away && (
          <div class="g-away" role="status">
            <p>You have left this step.</p>
            <button type="button" class="btn small" data-guide-action="back-to-step" onClick={() => send({ type: 'tour.goto', step })}>
              Go back to it
            </button>
          </div>
        )}
        <h2 class="g-title">{stop.title}</h2>
        <section class="g-look">
          <h3 class="g-label">What we're looking at</h3>
          <Text text={stop.look} />
        </section>
        {stop.widget === 'voyagerNow' && <VoyagerNow />}
        {stop.widget === 'cover' && p.layout === 'column' && <CoverDrawing />}
        {!done && <Turn stop={stop} refused={lastRefused(attempts)} />}
        {done && (stop.why || stop.human || stop.ask) && (
          <div class={`g-after${fresh ? ' fresh' : ''}`} data-learned>
            {stop.why && (
              <section class="g-learned" ref={learned}>
                <h3 class="g-label">What we just learned</h3>
                <Text text={stop.why} />
              </section>
            )}
            {stop.human && (
              <section class="g-story">
                <h3 class="g-label">The real story</h3>
                <Text text={stop.human} class="g-text g-quote" />
              </section>
            )}
            {stop.ask && (
              <section class="g-ask">
                <h3 class="g-label">Talk about it</h3>
                <Text text={stop.ask} />
              </section>
            )}
          </div>
        )}
      </div>
      <footer class="g-foot">
        <button type="button" class="btn g-back" data-guide-action="back" data-tour-back disabled={step <= 0} onClick={() => send({ type: 'tour.goto', step: step - 1 })}>
          Back
        </button>
        <div class="g-nextwrap">
          <button
            type="button"
            class="btn g-next"
            data-guide-action="next"
            data-tour-next
            disabled={!done}
            onClick={() => send(last ? { type: 'tour.exit' } : { type: 'tour.goto', step: step + 1 })}
          >
            {last ? 'Finish' : 'Next'}
          </button>
          {!done && <span class="g-locked">Next unlocks when this step is done</span>}
        </div>
      </footer>
    </div>
  );
}

/** The whole panel for the stop being shown; remounted for each stop so its small state starts fresh. */
export function GuideBody(p: { layout: 'column' | 'card' }) {
  const tour = game.tour.value;
  const stop = STOPS[tour.step];
  if (!tour.on || !stop) return null;
  return <StopView key={stop.id} stop={stop} step={tour.step} layout={p.layout} />;
}

/** The guide in the workbench's side column, in place of the notebook. */
export function Guide() {
  return (
    <aside class="guide-col" id="guide" aria-label="Guided tour">
      <GuideBody layout="column" />
    </aside>
  );
}
