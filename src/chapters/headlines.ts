// Every chapter's result headlines in one lookup (M4 step 7e). Each chapter owns its table.
import type { HeadlineDef } from '../ui/headline';
import { ARRIVAL_HEADLINES } from './arrival/headlines';
import { KEY_HEADLINES } from './key/headlines';
import { MAP_HEADLINES } from './map/headlines';
import { PICTURES_HEADLINES } from './pictures/headlines';
import { PLAYER_HEADLINES } from './player/headlines';
import { SPOT_HEADLINES } from './spot/headlines';
import { TRAIL_HEADLINES } from './trail/headlines';

export const HEADLINES: Readonly<Record<string, HeadlineDef>> = {
  ...ARRIVAL_HEADLINES, ...KEY_HEADLINES, ...PLAYER_HEADLINES, ...PICTURES_HEADLINES, ...MAP_HEADLINES, ...SPOT_HEADLINES, ...TRAIL_HEADLINES,
};
