import { render } from 'preact';
import { installBootErrors } from '../ui/boot';
import '../ui/theme.css';

installBootErrors();

function Landing() {
  return (
    <main class="page">
      <h1>The Finder</h1>
      <p>
        Put on headphones and, for an hour and a half or two, you are not human. You are a scientist from a
        small red star, about 44,000 years from now. Your sentinels catch a cold, tiny machine falling past
        your star: Voyager 1. You start with nothing but the object, and work out what it is, how old it is,
        how to play the gold disc it carries, where it came from, when it left, and who sent it. Every
        deduction is the real one, checked against real data.
      </p>
      <p class="links">
        <a class="button" href="/play/">Play</a>
        <a class="button quiet" href="/checked/">How it's checked</a>
      </p>
      <p class="note">Early build: the experience is not playable yet.</p>
    </main>
  );
}

render(<Landing />, document.getElementById('app') as HTMLElement);
