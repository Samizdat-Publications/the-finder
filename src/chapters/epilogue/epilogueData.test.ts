import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { recordCheck } from '../../../tests/support/record';
import { epilogue } from './epilogueData';

const norm = (s: string): string => s.replace(/\s+/g, ' ');
const credits = norm(readFileSync(resolve(process.cwd(), 'docs', 'CREDITS.md'), 'utf8'));
const DASH = String.fromCharCode(0x2014);

describe("data/epilogue.json holds the research note's facts (docs/research/epilogue.md)", () => {
  const [v1, v2] = epilogue.instruments.craft;
  const onCodes = (c: typeof v1): string[] => c!.instruments.filter((i) => i.on).map((i) => i.code);

  it('Voyager 1 runs two of its ten instruments (MAG and PWS), Voyager 2 three (CRS, MAG and PWS)', () => {
    expect(v1!.instruments).toHaveLength(10);
    expect(v2!.instruments).toHaveLength(10);
    expect(onCodes(v1)).toEqual(['MAG', 'PWS']);
    expect(onCodes(v2)).toEqual(['CRS', 'MAG', 'PWS']);
    recordCheck({
      id: 'epilogue.instruments',
      claim: "As of NASA's status of 4 August 2026, Voyager 1 still runs two of its ten instruments and Voyager 2 three.",
      measured: `V1 ${onCodes(v1).length} of ${v1!.instruments.length} (${onCodes(v1).join(', ')}); V2 ${onCodes(v2).length} of ${v2!.instruments.length} (${onCodes(v2).join(', ')})`,
      expected: 'docs/research/epilogue.md section 1 (NASA instruments page updated 2026-04-17, Voyager blog 2026-08-04): V1 MAG and PWS; V2 CRS, MAG and PWS',
      tolerance: 'exact',
      pass: true,
    });
  });

  it('has the off dates and reasons of the research note', () => {
    const find = (c: typeof v1, code: string) => c!.instruments.find((i) => i.code === code)!;
    expect(find(v1, 'CRS')).toMatchObject({ offDates: ['2025-02-25'], reason: 'power' });
    expect(find(v1, 'LECP')).toMatchObject({ offDates: ['2026-04-17'], reason: 'power' });
    expect(find(v1, 'PLS')).toMatchObject({ offDates: ['2007-02-01'], reason: 'degraded' });
    expect(find(v1, 'ISS').offDates).toEqual(['1990-02-14']);
    expect(find(v1, 'IRIS').offDates).toEqual(['1998-06-03']);
    expect(find(v1, 'PPS')).toMatchObject({ offDates: ['1980-01-29'], reason: 'degraded' });
    expect(find(v1, 'PRA').offDates).toEqual(['2008-01-15']);
    expect(find(v1, 'UVS').offDates).toEqual(['2016-04-19']);
    expect(find(v2, 'LECP').offDates).toEqual(['2025-03-24']);
    expect(find(v2, 'PLS').offDates).toEqual(['2024-09-26']);
    expect(find(v2, 'ISS').offDates).toEqual(['1989-10-10', '1989-12-05']);
    expect(find(v2, 'IRIS').offDates).toEqual(['2007-02-01']);
    expect(find(v2, 'PPS')).toMatchObject({ offDates: ['1991-04-03'], reason: 'degraded' });
    expect(find(v2, 'PRA').offDates).toEqual(['2008-02-21']);
    expect(find(v2, 'UVS').offDates).toEqual(['1998-11-12']);
    // Every off row has a date and a reason; every on row has neither.
    for (const c of [v1!, v2!]) {
      for (const i of c.instruments) {
        if (i.on) expect(i.offDates === undefined && i.reason === undefined, i.code).toBe(true);
        else expect((i.offDates?.length ?? 0) > 0 && !!i.reason, i.code).toBe(true);
      }
    }
  });

  it('has the power loss, the light-day time, the published Gliese 445 numbers and the map epoch', () => {
    expect(epilogue.instruments.powerLossWattsPerYear).toBe(4);
    expect(epilogue.instruments.asOf).toBe('2026-08-04');
    expect(epilogue.lightDay.nasaUtc).toBe('2026-11-18T10:16:07Z');
    expect(epilogue.lightDay.nasaKm).toBeCloseTo(25.902e9, -6);
    const bj = epilogue.gliese445.published[0]!;
    expect(bj).toMatchObject({ years: 44000, pc: 0.575, lightYears: 1.88, kmS: 116.0 });
    // NASA's image article "It's Reaching for the Stars" (2013-09-11; docs/research/epilogue.md section 4).
    expect(epilogue.gliese445.nasaPopular).toMatchObject({ lightYears: 1.7, years: 40000 });
    expect(bj).toMatchObject({ fromYear: 2019, yearsLow: 44000, yearsHigh: 44100, pcLow: 0.574, pcHigh: 0.576 });
    expect(epilogue.map.periodsEpoch.years).toEqual([1970, 1971]);
    expect(epilogue.map.launchYear).toBe(1977);
  });

  it('writes the inscription with a spaced hyphen and gives the Ferris line and the place, as the research note does', () => {
    expect(epilogue.inscription.text).toBe('To the makers of music - all worlds, all times');
    expect(epilogue.inscription.etched).toBe('Etched by hand between the label and the grooves.');
    expect(epilogue.inscription.ferris).toBe('Timothy Ferris asked for one line made by a human hand.');
    expect(epilogue.inscription.where).toContain('between the photoengraved label and the record grooves');
  });

  it('gives every source its URL and the date it was read', () => {
    for (const [id, s] of Object.entries(epilogue.sources)) {
      expect(s.url, id).toMatch(/^https:\/\//);
      // The research date (docs/research/epilogue.md), or 2026-10-22 for NASA's Gliese 445 wording (M6 audit, finding 6).
      expect(s.read, id).toBe(id === 'nasa-reaching-stars' ? '2026-10-22' : '2026-10-16');
    }
  });

  it('has no em dash anywhere and credits only what docs/CREDITS.md credits', () => {
    expect(JSON.stringify(epilogue)).not.toContain(DASH);
    for (const p of epilogue.credits.people) expect(credits, p.name).toContain(norm(p.check));
    for (const s of epilogue.credits.sources) expect(credits, s.name).toContain(norm(s.check));
  });
});
