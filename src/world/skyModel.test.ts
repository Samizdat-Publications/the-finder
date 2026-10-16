// The computed sky against independent numbers (never against this module's own earlier output).
import { describe, expect, it } from 'vitest';
import { angleBetweenDeg, norm } from '../science/astro';
import { SUN_ABS_MAG_V, apparentMagnitude, discoveryState } from '../science/epoch';
import { loadScenario, loadStars } from '../../tests/support/data';
import { bvToSrgb, bvToTemperatureK, computeSky, magToSprite, planckianXy } from './skyModel';

describe('star colours', () => {
  it('B-V 0.65 (the Sun) gives the solar effective temperature', () => {
    // IAU 2015 Resolution B3 nominal solar Teff 5,772 K; Ballesteros 2012 built the formula to match
    // black bodies, so 1% is the size of its stated agreement for main-sequence stars.
    expect(Math.abs(bvToTemperatureK(0.65) / 5772 - 1)).toBeLessThan(0.01);
  });
  it('the Planckian fit matches the CIE tabulated locus', () => {
    // CIE 15:2004 Planckian locus (2 deg observer): 3000 K (0.4369, 0.4041), 6500 K (0.3135, 0.3236).
    // Kim et al. 2002 quote their fit to about 1e-3 in xy; 0.002 allows the table's rounding.
    const a = planckianXy(3000);
    const b = planckianXy(6500);
    expect(Math.abs(a.x - 0.4369)).toBeLessThan(0.002);
    expect(Math.abs(a.y - 0.4041)).toBeLessThan(0.002);
    expect(Math.abs(b.x - 0.3135)).toBeLessThan(0.002);
    expect(Math.abs(b.y - 0.3236)).toBeLessThan(0.002);
  });
  it('hot stars are bluer than cool stars (red over blue rises with B-V)', () => {
    const ratio = (bv: number): number => {
      const c = bvToSrgb(bv, 1);
      return c[0] / c[2];
    };
    const bvs = [-0.3, 0, 0.3, 0.65, 1.0, 1.5, 2.0];
    for (let i = 1; i < bvs.length; i++) expect(ratio(bvs[i]!)).toBeGreaterThan(ratio(bvs[i - 1]!));
  });
});

describe('magnitude to sprite', () => {
  it('is monotonic: brighter is never smaller or fainter, and its light strictly grows', () => {
    let prev = magToSprite(7);
    for (let m = 6.9; m >= -2; m -= 0.1) {
      const s = magToSprite(m);
      expect(s.radiusPx).toBeGreaterThanOrEqual(prev.radiusPx);
      expect(s.alpha).toBeGreaterThanOrEqual(prev.alpha);
      expect(s.alpha * s.radiusPx ** 2).toBeGreaterThan(prev.alpha * prev.radiusPx ** 2);
      prev = s;
    }
  });
  it('mag 6.5 is faint but visible', () => {
    const s = magToSprite(6.5);
    expect(s.alpha).toBeGreaterThan(0.25);
    expect(s.radiusPx).toBeGreaterThanOrEqual(1);
  });
});

describe('the sky from the craft at the discovery epoch', () => {
  const scenario = loadScenario();
  const cat = loadStars();
  const sky = computeSky(scenario, cat);
  const disc = discoveryState(scenario, cat);

  it('puts the Sun where the craft position says, at the distance-modulus magnitude', () => {
    const d = norm(disc.craft.posPc);
    // Independent: the craft-to-Sun direction is minus the craft's position (Sun at the origin, epoch.ts).
    const toSun = [-disc.craft.posPc[0] / d, -disc.craft.posPc[1] / d, -disc.craft.posPc[2] / d] as const;
    expect(angleBetweenDeg(sky.sun.dir, toSun)).toBeLessThan(1e-6);
    expect(Math.abs(sky.sun.appMag - apparentMagnitude(SUN_ABS_MAG_V, d))).toBeLessThan(1e-9);
    // PLAN.md chapter 0 and M3.md: the Sun is a star of about magnitude -0.8 from there.
    expect(Math.abs(sky.sun.appMag - -0.8)).toBeLessThan(0.15);
  });
  it('counts every catalogue star and shows the naked-eye ones', () => {
    expect(sky.counts.near).toBe(cat.near.length);
    expect(sky.counts.sky).toBe(cat.sky.length);
    // data/README.md: sky.json holds the naked-eye stars beyond 30 pc, so from 0.75 pc away the
    // shown sky is still thousands of stars (the Sun's own naked-eye sky is about 9,000 in HYG).
    expect(sky.counts.shown).toBeGreaterThan(7000);
    expect(sky.counts.shown).toBeLessThan(10000);
    expect(sky.dirs.length).toBe(3 * sky.counts.shown);
  });
  it('leaves far stars where they are (Deneb moves by far less than a pixel)', () => {
    const deneb = cat.sky.find((s) => s.name === 'Deneb');
    const shown = sky.stars.find((s) => s.id === deneb?.id);
    expect(deneb && shown).toBeTruthy();
    // Deneb is about 430 pc away (HYG); 0.75 pc of parallax is at most 0.1 deg.
    const raDec = [Math.cos((deneb!.decDeg * Math.PI) / 180) * Math.cos((deneb!.raDeg * Math.PI) / 180), Math.cos((deneb!.decDeg * Math.PI) / 180) * Math.sin((deneb!.raDeg * Math.PI) / 180), Math.sin((deneb!.decDeg * Math.PI) / 180)] as const;
    expect(angleBetweenDeg(shown!.dir, raDec)).toBeLessThan(0.15);
  });
});
