// The rebuilt cover for the browser: the SVG text (bundled as a string) parsed once into strokes and
// binary groups. The Key, The Player and The Pictures share this one model.

import svgText from '../../../public/media/cover/cover.svg?raw';
import { parseCoverSvg, type CoverModel } from './coverSvg';

export const coverModel: CoverModel = parseCoverSvg(svgText);
