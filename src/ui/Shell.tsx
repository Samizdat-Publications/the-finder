// The alien instrument frame: a top bar (the vessel's status line, the ring of chapters, hint, codex,
// settings), the workbench or the hub in the middle, the codex and settings as side drawers, and a notice
// line for a refused command. Escape closes the drawers. Everything it does is a command on the bus.

import { useEffect } from 'preact/hooks';
import { chapterStatus, openNodes } from '../game/deductions';
import { CHAPTERS, NODES, chapterDef } from '../game/graph';
import { confirmedSet, game, hintsUsed } from '../game/state';
import { Codex } from './Codex';
import { GlyphLabel } from './Glyph';
import { Hub } from './Hub';
import { notebookOpen, revealInside } from './notebook';
import { SettingsPanel } from './SettingsPanel';
import { Workbench } from './Workbench';
import { send } from './send';

/** A small ring of dots, one per chapter, lit when the chapter is open or done. */
function MiniRing() {
  const confirmed = confirmedSet.value;
  return (
    <svg class="miniring" viewBox="-12 -12 24 24" width="26" height="26" aria-hidden="true">
      <circle r="9" class="mtrack" />
      {CHAPTERS.map((c, i) => {
        const a = (i / CHAPTERS.length) * 2 * Math.PI - Math.PI / 2;
        const s = chapterStatus(c.id, confirmed);
        return <circle key={c.id} cx={9 * Math.cos(a)} cy={9 * Math.sin(a)} r="1.9" class={`mdot ${s}`} />;
      })}
    </svg>
  );
}

function TopBar() {
  const confirmed = confirmedSet.value;
  const view = game.chapter.value;
  const where = view === 'hub' ? 'the ring' : (chapterDef(view)?.title ?? view);
  const open = view === 'hub' ? [] : openNodes(view, confirmed);
  // Only chapters whose instruments exist count: the later chapters' deductions are in the graph before they are playable.
  const playable = NODES.filter((n) => chapterDef(n.chapter)?.built);
  return (
    <header class="topbar">
      <div class="status" role="status">
        <GlyphLabel k="vessel status" height={20} />
        <span class="statusline">
          At {where}. {playable.filter((n) => confirmed.has(n.id)).length} of {playable.length} deductions confirmed
          {hintsUsed.value > 0 ? `, ${hintsUsed.value} hint${hintsUsed.value === 1 ? '' : 's'} used` : ''}.
        </span>
      </div>
      <nav class="tools" aria-label="Instruments">
        <button type="button" class="tool" data-tool="hub" aria-current={view === 'hub'} onClick={() => send({ type: 'chapter.enter', chapter: 'hub' })}>
          <MiniRing />
          <span>Ring</span>
        </button>
        <button
          type="button"
          class="tool"
          data-tool="hint"
          disabled={open.length === 0}
          title={open.length === 0 ? 'Open a chapter to ask for a hint' : 'Go to the first open deduction and its hint'}
          onClick={() => {
            const first = open[0];
            if (!first) return;
            // The hint buttons live in the notebook: open it, then reveal the button inside its own column.
            notebookOpen.value = true;
            requestAnimationFrame(() => {
              const btn = document.querySelector<HTMLElement>(`[data-hint="${first.id}"]`);
              if (!btn) return;
              btn.focus({ preventScroll: true });
              revealInside(btn);
            });
          }}
        >
          <span>Hint</span>
        </button>
        <button
          type="button"
          class="tool"
          data-tool="codex"
          aria-expanded={game.codexOpen.value}
          aria-controls="codex"
          onClick={() => send(game.codexOpen.value ? { type: 'codex.close' } : { type: 'codex.open' })}
        >
          <span>Codex</span>
          <b class="count">{confirmed.size}</b>
        </button>
        <button
          type="button"
          class="tool"
          data-tool="settings"
          aria-expanded={game.settingsOpen.value}
          aria-controls="settings"
          onClick={() => send({ type: 'settings.panel', open: !game.settingsOpen.value })}
        >
          <span>Settings</span>
        </button>
      </nav>
    </header>
  );
}

export function Shell() {
  const view = game.chapter.value;
  const notice = game.error.value;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      if (game.settingsOpen.value) send({ type: 'settings.panel', open: false });
      else if (game.codexOpen.value) send({ type: 'codex.close' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div class="shell">
      <TopBar />
      <main class="stage" id="stage">
        {view === 'hub' ? <Hub /> : <Workbench chapter={view} />}
      </main>
      <div class="notice" role="alert" aria-live="assertive">
        {notice && <span>{notice}</span>}
      </div>
      {game.codexOpen.value && <Codex />}
      {game.settingsOpen.value && <SettingsPanel />}
    </div>
  );
}
