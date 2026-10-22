// M6's deductions (Portrait), kept beside graph.ts so the graph file stays a readable size; graph.ts merges them
// into NODES. Same rules as the graph: stable ids, plain English, no em dashes, questions that do not give the
// answer away (graph.test.ts), and no typed numbers in hints or glosses (the instrument shows the computed ones).
// A node starts `later: true` (out of play) and its builder clears the flag as the last change.

import type { NodeDef } from './graph';

export const M6_QUESTIONS: Record<string, string> = {
  'portrait.together': 'Four clocks dated this machine. Do they tell one story?',
};

/** The deductions Portrait's plate reads: each panel's line and the four clocks of the centre band. */
export const PORTRAIT_READS = [
  'arrival.purpose', 'arrival.fuelAge', 'player.speed', 'spot.age',
  'trail.origin', 'trail.age', 'trail.neighbour', 'trail.when',
  'pictures.colour', 'pictures.numerals', 'pictures.units', 'pictures.home', 'pictures.height',
  'voices.many', 'voices.octave', 'voices.others',
] as const;

export const M6_NODES: readonly Omit<NodeDef, 'question'>[] = [
  {
    id: 'portrait.together', chapter: 'portrait', key: 'One story', checkedRow: 17, requires: [...PORTRAIT_READS],
    gloss: 'The fuel, the spot, the map read from the warm-white star and the journey all date the machine to one time: it was sent from the warm-white star, that long ago.',
    hints: [
      'Each clock drew its own bar of when. Look where the bars overlap.',
      'Weigh each clock by how narrow its bar is: the narrow ones say most. Where the weighted clocks meet is when it left.',
      'Drag the marker "When it left" into the bright band where the clocks agree, or step it there with the arrow keys, then press Propose.',
    ],
  },
];
