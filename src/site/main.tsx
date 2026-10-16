import { render } from 'preact';
import { installBootErrors } from '../ui/boot';
import '../ui/theme.css';
import '../tour/tour.css';

installBootErrors();

function Landing() {
  return (
    <main class="page">
      <h1>The Finder</h1>
      <p class="landing-lead">
        You are a scientist on a world circling a small red star, about 44,000 years from now. Your telescopes
        catch a cold, tiny machine falling past: Voyager 1, carrying a golden record from a planet you have
        never heard of. Work out what it is, how old it is, how to play it, what it shows, where it came from
        and who sent it. Every answer is the real one, checked against real data.
      </p>
      <p class="links">
        <a class="button primary" href="/play/?tour=1">Start the guided tour</a>
        <a class="button" href="/play/">Free play</a>
        <a class="button quiet" href="/checked/">How it's checked</a>
      </p>
      <p class="note">
        The guided tour walks you through every step in order, and explains why. Best with headphones, a big
        screen, and someone to talk it over with.
      </p>
    </main>
  );
}

render(<Landing />, document.getElementById('app') as HTMLElement);
