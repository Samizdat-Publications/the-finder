// The five staged moments' content (M4 step 7e): for each, its backdrop (the instrument's own visual, full
// screen), the one large number with its glyph label (from the confirmed attempt or the epoch model, never
// typed), and one sentence (no numbers, except ranks read from the confirmed result). src/ui/Moment.tsx
// shows them; src/ui/momentState.ts decides when.

import type { FunctionComponent } from 'preact';
import type { Attempt } from '../game/deductions';
import { game } from '../game/state';
import { PARSEC_KM } from '../science/units';
import { alienText, messageTokens, type MsgDim } from '../ui/message';
import type { MomentId } from '../ui/momentState';
import { RegionBackdrop } from './map/RegionMoment';
import type { EpochModel, HeavyPart } from './shared/epochModel';
import { SpotBackdrop } from './spot/AgeMoment';
import { OriginBackdrop, SkyBackdrop, WhenBackdrop } from './trail/moments';
import { originRow, starName } from './trail/physics';

export interface MomentQuantity {
  dim: MsgDim;
  si: number;
  digits?: number;
}

/** One line of a moment's comparison, in the alien's own units: what it compares, and the reading. */
export interface MomentCompare {
  label: string;
  text: string;
}

export interface MomentDef {
  /** The glyph label over the number. */
  label: string;
  sentence: (a: Attempt, m: EpochModel | null) => string;
  /** The number, or null until what it needs is in (the model for some). */
  quantity: (a: Attempt, m: EpochModel | null) => MomentQuantity | null;
  /**
   * With the human gloss off, a comparison under the number where the checkers' own readings already hold one
   * (never new science: only readings and message quantities of confirmed results, in the alien's units).
   */
  compare?: (a: Attempt) => MomentCompare[];
  /** The heavy parts of the epoch model the moment reads (none: it needs no model). */
  parts: readonly HeavyPart[] | null;
  Backdrop: FunctionComponent<{ m: EpochModel | null; reducedMotion: boolean }>;
}

const reading = (a: Attempt, key: string): number | string | undefined => a.result.find((r) => r.key === key)?.value;
const ordinal = (n: number, word: string, first: string): string => (n === 1 ? first : `${n}${n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}-${word}`);
const M_PER_PC = PARSEC_KM * 1000;
const lastOk = (id: string): Attempt | undefined => [...(game.records.value[id]?.attempts ?? [])].reverse().find((x) => x.ok);

export const MOMENTS: Readonly<Record<MomentId, MomentDef>> = {
  'map.region': {
    label: 'from your star then',
    sentence: () => 'Run back to when the map was drawn, its lines meet this close to your own star.',
    quantity: (_a, m) => (m ? { dim: 'length', si: Math.hypot(...m.region().centerPc) * M_PER_PC, digits: 2 } : null),
    compare: (a) => {
      const [len, wid] = messageTokens(a.message).filter((t) => t.dim === 'length');
      return len && wid ? [{ label: "the origin region's size", text: `${alienText(len.dim, len.si, len.digits)} by ${alienText(wid.dim, wid.si, wid.digits)}` }] : [];
    },
    parts: ['region'],
    Backdrop: RegionBackdrop,
  },
  'spot.age': {
    label: 'spot age',
    sentence: () => 'The uranium on the cover was laid down this long ago.',
    quantity: (a) => {
      const r = a.result.find((x) => x.key === 'age');
      return r && typeof r.value === 'number' && r.dim ? { dim: r.dim, si: r.value } : null;
    },
    compare: () => {
      const fuel = lastOk('arrival.fuelAge')?.result.find((r) => r.key === 'age');
      return fuel && typeof fuel.value === 'number' && fuel.dim ? [{ label: "the fuel's age, from Arrival", text: alienText(fuel.dim, fuel.value) }] : [];
    },
    parts: null,
    Backdrop: SpotBackdrop,
  },
  'trail.origin': {
    label: 'distance behind it',
    sentence: (_a, m) => (m ? `It came from ${starName(originRow(m).star)}, this far behind it.` : 'It came from the star behind it.'),
    quantity: (_a, m) => (m ? { dim: 'length', si: originRow(m).distPc * M_PER_PC, digits: 3 } : null),
    compare: (a) => {
      const angle = reading(a, 'measured angle from straight away');
      const cut = reading(a, '95% cut for a star it flew from');
      return typeof angle === 'string' && typeof cut === 'string' ? [{ label: 'its angle off straight away', text: `${angle}, against a cut of ${cut}` }] : [];
    },
    parts: ['trail'],
    Backdrop: OriginBackdrop,
  },
  'trail.neighbour': {
    label: 'from your star',
    sentence: (a) => {
      const near = reading(a, 'rank by distance');
      const bright = reading(a, 'rank by brightness');
      const n = typeof near === 'number' ? ordinal(near, 'nearest', 'nearest') : null;
      const b = typeof bright === 'number' ? ordinal(bright, 'brightest', 'brightest') : null;
      return n && b ? `The star it came from is your ${n} star, and the ${b} in your sky.` : 'The star it came from is your neighbour.';
    },
    quantity: (a) => messageTokens(a.message)[0] ?? null,
    parts: ['trail'],
    Backdrop: SkyBackdrop,
  },
  'trail.when': {
    label: "map's age",
    sentence: () => 'Read in the frame of the star it came from, every old line tells the same age.',
    quantity: (a) => messageTokens(a.message)[0] ?? null,
    compare: (a) => {
      // The confirmed message gives the map's age (estimate, 95% low, high), then the machine's travel time.
      const travel = messageTokens(a.message)[3];
      return travel?.dim === 'time' ? [{ label: 'the machine has travelled for', text: alienText(travel.dim, travel.si, travel.digits) }] : [];
    },
    parts: ['trail', 'region'],
    Backdrop: WhenBackdrop,
  },
};
