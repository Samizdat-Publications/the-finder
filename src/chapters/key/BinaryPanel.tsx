// The stroke instrument (key.binary): the census of every string on the cover, counted from the strokes'
// geometry; the player's own table of a few strings; the selected stroke's kind; and the proposal.

import { confirmedSet } from '../../game/state';
import type { BinaryGroup } from '../shared/coverSvg';
import type { StrokeRef } from '../shared/CoverViewer';
import { census, positionalValue } from './binary';
import { LastReading, PanelHead, Propose, StrokeBars, type Choice } from './parts';

export const BINARY_CHOICES: Choice[] = [
  { id: 'across-one', label: 'A number written place by place: the stroke across the line is one, the stroke along it zero', answer: { reading: 'positional', one: 'across' } },
  { id: 'along-one', label: 'A number written place by place: the stroke along the line is one, the stroke across it zero', answer: { reading: 'positional', one: 'along' } },
  { id: 'tally', label: 'A tally: each string counts its marks', answer: { reading: 'tally' } },
  { id: 'letters', label: 'Letters of a two-stroke alphabet', answer: { reading: 'letters' } },
  { id: 'decoration', label: 'Decoration: the marks are ornament', answer: { reading: 'decoration' } },
];

/** A neutral name for a string: its number in the instrument's list and where it lies on the plate. */
export function stringName(groups: readonly BinaryGroup[], id: string, size: number): string {
  const i = groups.findIndex((g) => g.id === id);
  const g = groups[i];
  if (!g) return id;
  const v = g.centre[1] < size / 2 ? 'upper' : 'lower';
  const h = g.centre[0] < size / 2 ? 'left' : 'right';
  return `string ${i + 1}, ${v} ${h}`;
}

export function BinaryPanel(p: {
  groups: readonly BinaryGroup[];
  size: number;
  selected: StrokeRef | null;
  tallied: string[];
  onTally: (id: string) => void;
  onUntally: (id: string) => void;
}) {
  const decoded = confirmedSet.value.has('key.binary');
  const c = census(p.groups);
  const sel = p.selected ? p.groups.find((g) => g.id === p.selected?.group) : undefined;
  const bit = sel?.bits[p.selected?.index ?? -1];
  return (
    <section class={`kpanel${decoded ? ' confirmed' : ''}`} data-panel="key.binary" data-status={decoded ? 'confirmed' : 'open'} aria-label="Strokes">
      <PanelHead id="key.binary" />
      <table class="ktable census" data-census="">
        <caption>Every string on the plate, counted by the instrument</caption>
        <tbody>
          <tr><th>strings</th><td data-count="groups">{c.groups}</td><th>strokes</th><td>{c.strokes}</td></tr>
          <tr><th>across the line</th><td>{c.across}</td><th>along the line</th><td>{c.along}</td></tr>
          <tr><th>strings that begin across</th><td data-count="beginAcross">{c.beginAcross}</td><th>begin along</th><td data-count="beginAlong">{c.beginAlong}</td></tr>
        </tbody>
      </table>

      <div class="kselect" data-selected={p.selected ? `${p.selected.group}:${p.selected.index}` : ''}>
        {sel && bit ? (
          <>
            <p>
              <b>{stringName(p.groups, sel.id, p.size)}</b>, stroke {bit.index + 1} of {sel.bits.length}:{' '}
              <span class="kind">{bit.kind === 'across' ? 'across' : 'along'} its line of writing</span> ({Math.round(bit.angleDeg)} degrees from it)
              {decoded && <span class="gold">, a {bit.kind === 'across' ? 'one' : 'zero'}</span>}
            </p>
            {!p.tallied.includes(sel.id) && (
              <button type="button" class="btn small" data-tally-add={sel.id} onClick={() => p.onTally(sel.id)}>
                Add this string to the table
              </button>
            )}
          </>
        ) : (
          <p class="note">Move the lamp low to raise the marks, then pick a stroke to see its kind.</p>
        )}
      </div>

      {p.tallied.length > 0 && (
        <div class="kscroll">
          <table class="ktable tally" data-tally="">
            <thead>
              <tr><th>string</th><th>strokes</th><th>across</th><th>along</th>{decoded ? <th class="gold">reads</th> : <th>first</th>}</tr>
            </thead>
            <tbody>
              {p.tallied.map((id) => {
                const g = p.groups.find((x) => x.id === id);
                if (!g) return null;
                const across = g.bits.filter((b) => b.kind === 'across').length;
                return (
                  <tr key={id} data-tally-row={id}>
                    <td class="sname">
                      {stringName(p.groups, id, p.size)}{' '}
                      <button type="button" class="linkbtn" aria-label={`Remove ${stringName(p.groups, id, p.size)} from the table`} onClick={() => p.onUntally(id)}>
                        remove
                      </button>
                      <br />
                      <StrokeBars kinds={g.bits.map((b) => b.kind)} />
                    </td>
                    <td>{g.bits.length}</td>
                    <td>{across}</td>
                    <td>{g.bits.length - across}</td>
                    {decoded ? <td class="gold">{positionalValue(g, 'across').toLocaleString('en-US')}</td> : <td>{g.bits[0]?.kind}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Propose id="key.binary" choices={BINARY_CHOICES} legend="What are the two kinds of stroke?" />
      <LastReading id="key.binary" />
    </section>
  );
}
