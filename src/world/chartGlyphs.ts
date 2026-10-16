// Marks the charts draw with a shape rather than a dot (M5 step 0c, from the blind critic: "a dot for the
// craft"): a small craft glyph (a dish on its bus with a boom, the Voyager silhouette in a few strokes) and a
// reticle for the alien's own star. Both are screen-sized sprites (they keep their pixel size at every zoom),
// drawn from one set of path strings so the chart's canvas and an interface overlay show the same craft.
// Pure drawing: no data, no randomness.

import * as THREE from 'three';

/** The craft in a 24 x 24 box (SVG path syntax): the dish bowl, its feed strut, the bus, the boom and the instrument boom. */
export const CRAFT_GLYPH_PATH = 'M4 7 Q12 16 20 7 Z M12 11.5 L12 3.5 M9 13 H15 V17.5 H9 Z M15 16 L21.5 20.5 M9 15 L2.5 19';
export const CRAFT_GLYPH_BOX = 24;

/** The home star's reticle in a 24 x 24 box: a ring with four ticks. */
const HOME_MARK_RING_R = 8;
const HOME_MARK_TICKS = 'M12 0.5 V4 M12 20 V23.5 M0.5 12 H4 M20 12 H23.5';

const SCALE = 4;

function sprite(draw: (c: CanvasRenderingContext2D) => void, heightPx: number): THREE.Sprite {
  const size = CRAFT_GLYPH_BOX * SCALE;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const c = cv.getContext('2d')!;
  c.scale(SCALE, SCALE);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  draw(c);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true }));
  s.center.set(0.5, 0.5);
  s.userData.aspect = 1;
  s.userData.heightPx = heightPx;
  s.userData.glyph = true;
  s.renderOrder = 9;
  return s;
}

/** The craft glyph as a screen-sized sprite (heightPx CSS px; the chart's sizeLabels keeps it that size). */
export function makeCraftGlyph(colour = '#c8fff0', heightPx = 34): THREE.Sprite {
  return sprite((c) => {
    const p = new Path2D(CRAFT_GLYPH_PATH);
    c.shadowColor = 'rgba(0,0,0,0.95)';
    c.shadowBlur = 3;
    c.fillStyle = 'rgba(6, 22, 26, 0.92)';
    c.strokeStyle = colour;
    c.lineWidth = 1.9;
    c.fill(p);
    c.stroke(p);
  }, heightPx);
}

/** The alien's own star's reticle as a screen-sized sprite. */
export function makeHomeMark(colour = '#a8ffd0', heightPx = 26): THREE.Sprite {
  return sprite((c) => {
    c.strokeStyle = colour;
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(12, 12, HOME_MARK_RING_R, 0, Math.PI * 2);
    c.stroke(new Path2D(HOME_MARK_TICKS));
    c.stroke();
  }, heightPx);
}
