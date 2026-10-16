// The Key's inputs in the browser: the cover's numbers (data/cover.json), the disc and craft sizes from the
// model's manifest (public/media/models/voyager.json), and the alien's pulsar catalogue (data/pulsars.json,
// 1.8 MB, loaded on demand into its own chunk; only its period range is kept).

import { signal } from '@preact/signals';
import coverJson from '../../../data/cover.json';
import voyagerJson from '../../../public/media/models/voyager.json';
import type { CoverData, PulsarCatalogue } from '../../science/types';
import { pulsarRange, type KeyInputs, type PulsarRange } from './readings';

export const cover = coverJson as unknown as CoverData;

/** Radius of the disc the alien holds, m (voyager.json recordDisc, 0.157 m). */
export const RECORD_RADIUS_M: number = voyagerJson.recordDisc.radius;

/** The craft's largest extent along any axis, m (voyager.json extents: the magnetometer boom's 16.9 m span). */
export const CRAFT_SPAN_M: number = Math.max(...voyagerJson.extents.max.map((v, i) => v - (voyagerJson.extents.min[i] as number)));

/** The catalogue's period range, once loaded. */
export const pulsarSpan = signal<PulsarRange | null>(null);
export const pulsarError = signal<string | null>(null);

let loading: Promise<void> | null = null;

/** Start (once) loading the pulsar catalogue. */
export function ensurePulsars(): Promise<void> {
  if (!loading) {
    loading = import('../../../data/pulsars.json')
      .then((m) => {
        pulsarSpan.value = pulsarRange(m.default as unknown as PulsarCatalogue);
      })
      .catch((e: unknown) => {
        pulsarError.value = e instanceof Error ? e.message : String(e);
        loading = null;
      });
  }
  return loading;
}

export function keyInputs(): KeyInputs {
  if (!pulsarSpan.value) void ensurePulsars();
  return { cover, recordRadiusM: RECORD_RADIUS_M, craftSpanM: CRAFT_SPAN_M, pulsars: pulsarSpan.value };
}
