// A refused result leads with one line (M5 step 0c, from the blind critic: wrong-answer prose was a tall red
// block that crowded the controls). The line is the message's own opening, never new wording: its first
// sentence, cut at its first semicolon when that sentence runs long, with the comparison it ends on (the
// clause after its last colon, when that clause carries a number: "this is 135 times the 95% cut") kept. The
// rest of the message is returned unchanged for the fold beneath it. Pure: no DOM, and it only moves text, so
// every number the line shows is the checker's own.

/** A sentence this long or shorter is the verdict as it stands (characters, rendered). */
const SHORT = 130;

const SENTENCE_END = /(?<=[.!?])\s+(?=[A-Z0-9({])/;

const upper = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const endStop = (s: string): string => (/[.!?]$/.test(s) ? s : `${s}.`);

export interface Verdict {
  /** The one line shown first. */
  lead: string;
  /** What is folded beneath it (empty when the lead is the whole message). */
  rest: string;
}

/** Splits a rendered message into its verdict line and the rest. */
export function splitVerdict(text: string): Verdict {
  const msg = text.trim();
  const first = msg.split(SENTENCE_END)[0] ?? msg;
  if (first.length <= SHORT) return { lead: first, rest: msg.slice(first.length).trim() };
  // A long first sentence: its first clause (to the first semicolon past a few words).
  const semi = first.indexOf('; ', 30);
  const colon = first.indexOf(': ', 30);
  const cut = [semi, colon].filter((i) => i > 0).sort((a, b) => a - b)[0] ?? -1;
  if (cut > 0) {
    const head = first.slice(0, cut);
    const lastColon = first.lastIndexOf(': ');
    const tail = lastColon > cut ? first.slice(lastColon + 2) : '';
    const keepTail = tail.length > 0 && tail.length <= 100 && /\d/.test(tail) && /^(this|that|it|so|which)\b/i.test(tail);
    const lead = endStop(keepTail ? `${head}: ${tail.replace(/[.!?]$/, '')}` : head);
    const middle = upper(first.slice(cut + 2, keepTail ? lastColon : undefined).trim());
    return { lead, rest: [endStop(middle), msg.slice(first.length).trim()].filter((x) => x !== '.').join(' ').trim() };
  }
  // No clause break: cut at the last comma or space within reach, and keep the whole message beneath.
  const at = Math.max(first.lastIndexOf(', ', SHORT), 60);
  const stop = first.lastIndexOf(' ', at > SHORT ? SHORT : at);
  return { lead: `${first.slice(0, stop > 0 ? stop : SHORT).replace(/[,;:]$/, '')}...`, rest: msg };
}
