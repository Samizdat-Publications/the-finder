// Small pieces The Voices' panels share: a quantity in the alien's units (SI under the human gloss), a progress
// bar for the Worker's analyses, and the frequency axis's ticks in the alien's "per beat".

import { game } from '../../game/state';
import { pluralKey } from '../../ui/message';
import { quantity, toAlien, type Dim } from '../../ui/units';

export function Q(p: { dim: Dim; si: number; digits?: number }) {
  const q = quantity(p.dim, p.si);
  const n = p.digits ? Number(toAlien(p.dim, p.si).toPrecision(p.digits)).toLocaleString('en-US', { maximumFractionDigits: 20 }) : q.number;
  return (
    <span class="q">
      <span class="num">{n}</span> <span class="unitname">{n === '1' ? q.unitKey : pluralKey(q.unitKey)}</span>
      {game.settings.value.humanGloss && <span class="si"> ({q.si})</span>}
    </span>
  );
}

export function Progress(p: { f: number; what: string }) {
  return (
    <span class="vo-progress" data-progress={p.f.toFixed(2)}>
      <span class="vo-bar"><span style={{ width: `${Math.round(p.f * 100)}%` }} /></span>
      <span class="note small">{p.what}</span>
    </span>
  );
}

/** Round ticks for a frequency axis from 0 to hiHz, labelled in the alien's per-beat units. */
export function freqTicks(hiHz: number, maxTicks = 6): { hz: number; label: string }[] {
  const hiA = toAlien('frequency', hiHz);
  const e = Math.floor(Math.log10(hiA / maxTicks));
  const step = [1, 2, 5, 10].map((k) => k * 10 ** e).find((s) => hiA / s <= maxTicks) ?? 10 ** (e + 1);
  const out: { hz: number; label: string }[] = [];
  for (let a = 0; a <= hiA + 1e-9; a += step) out.push({ hz: a / toAlien('frequency', 1), label: Math.round(a).toLocaleString('en-US') });
  return out;
}
