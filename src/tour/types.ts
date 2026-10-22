// The guided tour (Stewart's 2026-10-16 note): an on-rails walk through the experience for a parent and a
// child. Each stop is one screen of narration in the guide panel; a stop with a `node` is finished when that
// deduction is confirmed, by the player's own hands on the instrument or by "Do it for me" (src/tour/actions.ts,
// the same command bus the interface uses: rule 5). Plain text only; a blank line starts a new paragraph and
// **double stars** mark bold. No em dashes.

import type { ChapterView } from '../game/graph';

export type PartId =
  | 'prologue'
  | 'arrival'
  | 'key'
  | 'player'
  | 'pictures'
  | 'voices'
  | 'numbers'
  | 'spot'
  | 'map'
  | 'trail'
  | 'portrait'
  | 'finale';

export interface PartDef {
  id: PartId;
  /** Short title for the progress bar, e.g. "Playing the record". */
  title: string;
}

/**
 * story: read, then Next (no deduction).
 * do: the player works the instrument; Next unlocks when `node` is confirmed. "Do it for me" is offered.
 * watch: a step too fiddly to ask of a newcomer; the guide's main button runs it ("Show me") and explains.
 */
export type StopKind = 'story' | 'do' | 'watch';

export interface Stop {
  /** Unique. For do and watch stops, the deduction id; for story stops, '<part>.<name>'. */
  id: string;
  part: PartId;
  kind: StopKind;
  /** Where the stage must be for this stop: a chapter's workbench, or 'hub' for a full-screen story card. */
  chapter: ChapterView;
  /** The deduction this stop finishes (do and watch stops). */
  node?: string;
  title: string;
  /** What we are looking at, and what the alien is thinking. Shown first. */
  look: string;
  /** Your turn: the one thing to do, in plain words (do stops), or what the guide will do (watch stops). */
  todo?: string;
  /** What we just learned. Shown once the node is confirmed (or straight away on a story stop). */
  why?: string;
  /** The real story: the human side, for the parent to read out. Shown with `why`. */
  human?: string;
  /** Talk about it: a question for the child. Shown with `why`. */
  ask?: string;
  /** A picture or live panel shown with the stop on the story stage: the cover drawing, or where the Voyagers are now (VoyagerNow.tsx). */
  widget?: 'cover' | 'voyagerNow';
  /** Our Frame: the section of the chapter this stop talks about; the guide turns the chapter to it. */
  section?: 'turn' | 'now' | 'listening' | 'future' | 'map' | 'line';
}
