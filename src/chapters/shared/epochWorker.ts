// The epoch Worker (M4 step 7e): loads its own copy of the catalogues once and computes the parts of the
// epoch model the main thread asks for (epochCompute.ts), so entering The Map or The Trail never freezes
// the page. The main thread shows its "measuring" state meanwhile.

import type { PartReply, PartRequest } from './epochClient';
import { computePart } from './epochCompute';
import { loadInputs, type EpochInputs } from './epochModel';

let inputs: Promise<EpochInputs> | null = null;

self.onmessage = async (e: MessageEvent<PartRequest>): Promise<void> => {
  const { id, seed, part } = e.data;
  let reply: PartReply;
  try {
    inputs ??= loadInputs();
    reply = { id, ok: true, out: computePart(await inputs, seed, part) };
  } catch (err) {
    reply = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  (self as unknown as Worker).postMessage(reply);
};
