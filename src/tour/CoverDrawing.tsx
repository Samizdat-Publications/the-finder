// The exact rebuilt cover drawing (public/media/cover/cover.svg) in the record's gold, for the tour's cover widget.

import svgText from '../../public/media/cover/cover.svg?raw';

// The file is our own, bundled at build time; the XML declaration is dropped so it can sit inside the page.
const COVER = svgText.replace(/^<\?xml[^>]*\?>\s*/, '');

export function CoverDrawing() {
  return <div class="story-cover" role="img" aria-label="The cover of the Golden Record, with its etched instructions" dangerouslySetInnerHTML={{ __html: COVER }} />;
}
