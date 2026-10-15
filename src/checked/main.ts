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
app.appendChild(doc);
