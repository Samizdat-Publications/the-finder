import { render } from 'preact';
import { installBootErrors } from '../ui/boot';
import '../ui/theme.css';

installBootErrors();

function Placeholder() {
  return (
    <main class="page">
      <p class="note">
        <a href="/">The Finder</a>
      </p>
      <section class="panel">
        <h1>The instrument loads here (M2)</h1>
        <p class="note">Nothing to play yet. This page is a placeholder for the record player and the picture decoder.</p>
      </section>
    </main>
  );
}

render(<Placeholder />, document.getElementById('app') as HTMLElement);
