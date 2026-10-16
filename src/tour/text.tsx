// The tour's tiny text formatter: paragraphs on a blank line, **bold**, nothing else. Text is rendered as
// text nodes, never as HTML, so nothing in a script string can inject markup.

import { parseText } from './progress';

export function Text(p: { text: string; class?: string }) {
  return (
    <div class={p.class ?? 'g-text'}>
      {parseText(p.text).map((runs, i) => (
        <p key={i}>
          {runs.map((r, j) => (r.bold ? <strong key={j}>{r.text}</strong> : r.text))}
        </p>
      ))}
    </div>
  );
}
