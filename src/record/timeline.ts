// The record's timeline: which item plays when on each side.
// Pure module: no DOM, no randomness. Input is the parsed data/record.json (schema in data/README.md,
// built by tools/media/build_record.py); times are seconds from the start of the side's music, in
// record order, accumulated from each item's exact `durationS` (decoded samples / 48,000).

/** One item of data/record.json (fields as documented in data/README.md, "record.json"). */
export interface RecordItem {
  id: string;
  kind: string;
  musicNumber: number | null;
  title: string;
  performer?: string | null;
  origin?: string | null;
  nasaTitle?: string | null;
  nasaLengthS?: number | null;
  /** Exact length of the shipped file, s (decoded samples / 48,000). */
  durationS: number;
  /** Path under the site root, e.g. "media/audio/11.webm". */
  file: string;
  bytes: number;
  sha256: string;
  source?: string | null;
}

export interface RecordSide {
  side: number;
  faces?: string;
  items: RecordItem[];
}

/** data/record.json as stored. */
export interface RecordData {
  meta?: Record<string, unknown>;
  sideBreak?: Record<string, unknown>;
  sides: RecordSide[];
}

/** An item placed on its side: it plays over [startS, endS) of the side's music time. */
export interface TimelineEntry {
  side: number;
  index: number;
  item: RecordItem;
  startS: number;
  endS: number;
}

export interface ItemAt {
  entry: TimelineEntry;
  /** Seconds into the item. */
  offsetS: number;
}

export class Timeline {
  private readonly bySide = new Map<number, TimelineEntry[]>();
  private readonly byId = new Map<string, TimelineEntry>();

  constructor(record: RecordData) {
    for (const s of record.sides) {
      if (this.bySide.has(s.side)) throw new Error(`record: side ${s.side} listed twice`);
      const entries: TimelineEntry[] = [];
      let t = 0;
      s.items.forEach((item, index) => {
        if (!(item.durationS > 0)) throw new Error(`record: item ${item.id} has no positive durationS`);
        if (this.byId.has(item.id)) throw new Error(`record: item id ${item.id} listed twice`);
        const entry: TimelineEntry = { side: s.side, index, item, startS: t, endS: t + item.durationS };
        t = entry.endS;
        entries.push(entry);
        this.byId.set(item.id, entry);
      });
      if (entries.length === 0) throw new Error(`record: side ${s.side} has no items`);
      this.bySide.set(s.side, entries);
    }
  }

  /** Side numbers in the order the data lists them. */
  sides(): number[] {
    return [...this.bySide.keys()];
  }

  entries(side: number): readonly TimelineEntry[] {
    const e = this.bySide.get(side);
    if (!e) throw new Error(`record: no side ${side}`);
    return e;
  }

  /** Length of the side's music, s: the sum of its items' durations. */
  sideDuration(side: number): number {
    const e = this.entries(side);
    return e[e.length - 1]!.endS;
  }

  entryById(id: string): TimelineEntry {
    const e = this.byId.get(id);
    if (!e) throw new Error(`record: no item ${id}`);
    return e;
  }

  /**
   * The item playing at side time t (s) and the offset into it. Items are half-open [start, end), so
   * at a boundary the later item starts at offset 0. Returns null before 0 (lead-in) and at or after the
   * side's end (run-out).
   */
  itemAt(side: number, t: number): ItemAt | null {
    const e = this.entries(side);
    if (!(t >= 0) || t >= e[e.length - 1]!.endS) return null;
    let lo = 0;
    let hi = e.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (e[mid]!.startS <= t) lo = mid;
      else hi = mid - 1;
    }
    const entry = e[lo]!;
    return { entry, offsetS: t - entry.startS };
  }

  /** Index of the entry covering side time t, clamped to the side (for scheduling walks). */
  indexAt(side: number, t: number): number {
    const e = this.entries(side);
    if (t < 0) return 0;
    const hit = this.itemAt(side, t);
    return hit ? hit.entry.index : e.length - 1;
  }
}
