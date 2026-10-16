// The How it's checked page: renders docs/HOW_ITS_CHECKED.md (generated from the passing checks).
import { marked } from 'marked';
import { installBootErrors } from '../ui/boot';
import '../ui/theme.css';
import './checked.css';
import source from '../../docs/HOW_ITS_CHECKED.md?raw';

installBootErrors();

const app = document.getElementById('app') as HTMLElement;
const html = marked.parse(source, { async: false });

const doc = document.createElement('main');
doc.className = 'page checked';
doc.innerHTML = `<p class="note"><a href="/">The Finder</a></p>${html}`;
// Wrap each table so it scrolls sideways on narrow screens instead of widening the page.
for (const table of Array.from(doc.querySelectorAll('table'))) {
  const wrap = document.createElement('div');
  wrap.className = 'table-scroll';
  table.replaceWith(wrap);
  wrap.appendChild(table);
}
// Anchors: each row of the deduction table (first column "#") gets the id row-N, so the codex can link to it.
for (const table of Array.from(doc.querySelectorAll('table'))) {
  if (table.querySelector('th')?.textContent?.trim() !== '#') continue;
  for (const tr of Array.from(table.querySelectorAll('tbody tr'))) {
    const n = tr.querySelector('td')?.textContent?.trim() ?? '';
    if (/^\d+$/.test(n)) tr.id = `row-${n}`;
  }
}
app.appendChild(doc);
// The page is built after load, so the browser could not jump to a #row-N link by itself.
if (/^#row-\d+$/.test(window.location.hash)) document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'center' });
