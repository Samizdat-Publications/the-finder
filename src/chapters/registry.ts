// Chapter instruments, by chapter id. Each chapter module registers its instrument here (one line per
// chapter in its own file under src/chapters/<id>/), and the shell's Workbench shows the registered
// instrument in place of the "being built" placeholder. Keeping one tiny registry means chapters built in
// parallel never edit the same file.
import type { ComponentType } from 'preact';
import type { ChapterId } from '../game/graph';

export interface ChapterInstrumentProps {
  chapter: ChapterId;
}

const instruments = new Map<ChapterId, ComponentType<ChapterInstrumentProps>>();

/** Register a chapter's instrument (call once, at module load of the chapter's index). */
export function registerInstrument(chapter: ChapterId, component: ComponentType<ChapterInstrumentProps>): void {
  instruments.set(chapter, component);
}

/** The instrument for a chapter, or undefined while it is still being built. */
export function instrumentFor(chapter: ChapterId): ComponentType<ChapterInstrumentProps> | undefined {
  return instruments.get(chapter);
}
