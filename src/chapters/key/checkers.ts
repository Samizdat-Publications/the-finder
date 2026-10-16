// The Key's three checkers, registered in the deduction graph's checker registry. Each computes its answer
// from the cover's strokes, the cover's numbers and the physics (rule 1). No DOM.

import { registerChecker, type Checker } from '../../game/deductions';
import type { BinaryGroup } from '../shared/coverSvg';
import { checkBinary } from './binary';
import { checkTimesNotLengths, checkUnit, type KeyInputs } from './readings';

export const KEY_NODE_IDS = ['key.binary', 'key.unit', 'key.timesNotLengths'] as const;

/** The checkers, over the cover's binary groups and inputs read when each check runs (the catalogue loads late). */
export function makeKeyCheckers(groups: readonly BinaryGroup[], inputs: () => KeyInputs): Record<(typeof KEY_NODE_IDS)[number], Checker> {
  return {
    'key.binary': (answer) => checkBinary(groups, answer),
    'key.unit': (answer) => checkUnit(inputs(), answer),
    'key.timesNotLengths': (answer) => checkTimesNotLengths(inputs(), answer),
  };
}

export function registerKeyCheckers(groups: readonly BinaryGroup[], inputs: () => KeyInputs): void {
  const c = makeKeyCheckers(groups, inputs);
  for (const id of KEY_NODE_IDS) registerChecker(id, c[id]);
}
