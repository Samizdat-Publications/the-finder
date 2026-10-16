// The Pictures, complete: the eight M5 checkers on real decodes of the 1977 tape's 96 kHz slices (the same
// decoder and the same samples the browser uses; tests/support/wav.ts), each right answer and each meaningful
// wrong one, and the teaching regions against both decodes. Truth: the record's own frame list and colour roles
// (data/frames.json, from the Ozma book and the tape), Barry's orientation table read from his code
// (tools/ref-decoder/barry.py), the research readings (docs/research/teaching-frames.md) and the hydrogen and SI
// constants (src/science/units.ts). Never the code's own earlier output.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { recordCheck } from '../../../tests/support/record';
import { decodePng } from '../../../tests/support/png';
import { loadSlice, slicesUnavailable } from '../../../tests/support/wav';
import { alienText } from '../../ui/message';
import { REACH_M } from '../../ui/units';
import { sliceInfo, type SignalProvider } from './checkers';
import {
  ALBUM_FRAMES, BARRY_TO_CW, HEIGHTS, HOME, LIKENESS_APART_MAX, LIKENESS_ONE_MIN, LIKENESS_THRESHOLD, SECOND_BEATS, SECOND_PRECISION, SLIP, TEACHING,
  TURNED_FRAMES, channelFrames, checkAlbum, checkColour, checkDown, checkHeight, checkHome, checkNumerals, checkSlip, checkUnits, frameRow,
  type DecodedPicture, type PictureProvider,
} from './checkersM5';
import { register } from '../../dsp/colour';
import framesJson from '../../../data/frames.json';
import { REFERENCE_SETTINGS, decodeWith, frameSignal, type FrameSignal } from './measure';
import type { Region } from '../../science/teaching';

const SKIP = slicesUnavailable();
if (SKIP) console.log(`SKIP pictures M5 checker tests: ${SKIP}`);

const sigs = new Map<string, FrameSignal>();
function signal(frame: string): FrameSignal {
  let s = sigs.get(frame);
  if (!s) {
    const info = sliceInfo(frame);
    s = frameSignal(info, loadSlice(frame).samples);
    sigs.set(frame, s);
  }
  return s;
}
const pics = new Map<string, DecodedPicture>();
/** The browser's album holds exactly this: the reference settings' decode of each slice (grey, levels, settings). */
const picture: PictureProvider = (frame) => {
  let p = pics.get(frame);
  if (!p) {
    const d = decodeWith(signal(frame), REFERENCE_SETTINGS);
    p = { frame, width: d.width, height: d.height, data: d.gray, gray: d.gray, levels: d.levels, settings: { ...REFERENCE_SETTINGS } };
    pics.set(frame, p);
    sigs.delete(frame); // keep memory down: the samples are not needed again (L000 to L004 are reloaded on demand)
  }
  return p;
};
const signals: SignalProvider = (f) => signal(f);
/** The solar spectrum's first frame, by the record's own title (data/frames.json, the Ozma book list). */
const ROWS_OF_SOLAR = (framesJson.frames as { frame: string; title: string; colourRole: string }[])
  .filter((f) => f.title === 'Solar spectrum' && f.colourRole === 'R').map((f) => f.frame);
const reading = (r: { result: { key: string; value: number | string }[] }, k: string) => r.result.find((x) => x.key === k)?.value;

/** Dark pixels in a region: darker than 0.72 of the region's median (tools/data/build_teaching.py INK_FRAC). */
function inkIn(gray: ArrayLike<number>, width: number, r: Region): number {
  const vals: number[] = [];
  for (let y = r[1]; y < r[3]; y++) for (let x = r[0]; x < r[2]; x++) vals.push(gray[y * width + x] as number);
  const sorted = [...vals].sort((a, b) => a - b);
  // the card's grey: the 90th percentile (a region is mostly strokes in places, so not the median)
  const t = 0.72 * (sorted[Math.floor(sorted.length * 0.9)] as number);
  return vals.filter((v) => v < t).length;
}
const area = (r: Region): number => (r[2] - r[0]) * (r[3] - r[1]);

describe.skipIf(SKIP !== null)('The Pictures complete: the eight checkers on the real tape', () => {
  it('pictures.album: every frame of the side, with the settings that made the circle round', { timeout: 300_000 }, () => {
    const t0 = Date.now();
    const all = [...ALBUM_FRAMES];
    for (const f of all) picture(f);
    const ms = Date.now() - t0;
    const ok = checkAlbum(signals, picture, { developed: all, settings: REFERENCE_SETTINGS as never });
    const short = checkAlbum(signals, picture, { developed: all.slice(1), settings: REFERENCE_SETTINGS as never });
    const wrong = checkAlbum(signals, picture, { developed: all, settings: { ...REFERENCE_SETTINGS, rows: 512 } as never });
    console.log(`pictures.album: ${all.length} frames decoded in ${(ms / 1000).toFixed(1)} s (${(ms / all.length).toFixed(0)} ms each); ${ok.message}`);
    const pass = ok.ok && reading(ok, 'frames developed') === 156 && !short.ok && reading(short, 'frames developed') === 155 && !wrong.ok;
    recordCheck({
      id: 'pictures.album',
      claim: 'The settings that make the calibration circle round develop every picture on the side: all 156 frames, 78 on each track of the tape.',
      measured: `${reading(ok, 'frames developed')} of ${ALBUM_FRAMES.length} developed and accepted; one short (155) refused; 512 rows refused (${wrong.message.slice(0, 60)}...)`,
      expected: '156 frames: 78 per channel (data/frames.json, from the tape\'s frame starts checked against Barry\'s table, decoder.ref.frameStarts)',
      tolerance: 'exact count; settings as pictures.circle',
      pass,
    });
    expect(pass).toBe(true);
  });

  it('pictures.colour: one scene is told by an absolute likeness measured over every window; the rest are refused', { timeout: 300_000 }, () => {
    // Every consecutive three of each track (152 windows): the smaller of the two inner registration peaks, with
    // the record's frame list (data/frames.json colourRole, Ozma book) as the independent truth of which are one picture.
    const solar = new Set(ROWS_OF_SOLAR);
    const apart: { w: string; a: number }[] = [];
    const one: { w: string; a: number }[] = [];
    let solarA = NaN;
    let oldRulePassedApart = 0;
    const wrong: string[] = [];
    let listedMsg = '';
    for (const ch of ['L', 'R']) {
      const fs = channelFrames(ch);
      const pair = fs.slice(0, -1).map((f, i) => register(picture(f)!, picture(fs[i + 1]!)!).peak);
      for (let i = 0; i + 2 < fs.length; i++) {
        const w = fs.slice(i, i + 3);
        const roles = w.map(frameRow);
        const triple = roles[0]!.colourRole === 'R' && roles[1]!.colourRole === 'G' && roles[2]!.colourRole === 'B' && roles.every((r) => r.image === roles[0]!.image);
        const a = Math.min(pair[i]!, pair[i + 1]!);
        const outer = [...(i > 0 ? [pair[i - 1]!] : []), ...(i + 3 < fs.length ? [pair[i + 2]!] : [])];
        const r = checkColour(picture, { frames: w });
        // the checker's own reading must be this measurement (the same registration)
        if (Math.abs((reading(r, 'likeness of the three') as number) - a) > 5e-4) wrong.push(`${w[0]} reading`);
        if (r.ok !== triple) wrong.push(`${w[0]} ${r.ok ? 'accepted' : 'refused'}`);
        if (triple && solar.has(w[0]!)) {
          solarA = a;
          listedMsg = r.message;
        } else (triple ? one : apart).push({ w: w[0]!, a });
        if (!triple && a > Math.max(...outer, 0)) oldRulePassedApart++;
      }
    }
    const maxApart = apart.reduce((m, x) => (x.a > m.a ? x : m));
    const minOne = one.reduce((m, x) => (x.a < m.a ? x : m));
    // for comparison only: the equal-error point of Gaussians fitted to the two groups
    const fit = (xs: number[]) => {
      const m = xs.reduce((s, x) => s + x, 0) / xs.length;
      return { m, sd: Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)) };
    };
    const g0 = fit(apart.map((x) => x.a));
    const g1 = fit(one.map((x) => x.a));
    const equalError = (g0.m * g1.sd + g1.m * g0.sd) / (g0.sd + g1.sd);
    // meaningful wrong picks: a near-duplicate pair with a third (Anatomy 3, 4 and 5), and a triple read one
    // frame late (the Earth's G and B with the next scene's R)
    const dup = checkColour(picture, { frames: ['L024', 'L025', 'L026'] });
    const late = checkColour(picture, { frames: ['L014', 'L015', 'L016'] });
    expect(() => checkColour(picture, { frames: ['L013', 'L015', 'L014'] })).toThrow(/follow each other/);
    const good = checkColour(picture, { frames: ['L013', 'L014', 'L015'] });
    // the constants are this measurement written to three decimals: 5e-4 is their rounding
    const constantsOk = Math.abs(maxApart.a - LIKENESS_APART_MAX) <= 5e-4 && Math.abs(minOne.a - LIKENESS_ONE_MIN) <= 5e-4;
    const summary = `${apart.length} windows that are not one picture: at most ${maxApart.a.toFixed(3)} (${maxApart.w}); ${one.length} colour pictures with a scene: at least ${minOne.a.toFixed(3)} (${minOne.w}); the solar spectrum ${solarA.toFixed(3)}; threshold ${LIKENESS_THRESHOLD.toFixed(3)} (the gap's midpoint; Gaussian equal-error point ${equalError.toFixed(3)}, for comparison); the former relative rule let ${oldRulePassedApart} non-pictures through`;
    console.log(`pictures.colour: ${summary}; wrong ${wrong.join(', ') || 'none'}`);
    const pass =
      wrong.length === 0 && apart.length === 132 && one.length === 19 && Number.isFinite(solarA) && solarA < LIKENESS_THRESHOLD && constantsOk &&
      /too faint/.test(listedMsg) && /line up edge for edge/.test(good.message) && /most readers/.test(good.message) && !dup.ok && !late.ok;
    recordCheck({
      id: 'pictures.colour',
      claim: 'Three consecutive frames are one colour picture when their edges line up better than any three frames that are not one picture ever do: the measurement finds 19 of the record\'s 20 colour pictures and refuses every other pick; the 20th, the nearly featureless solar spectrum, is accepted because the record\'s frame list says so, and the message says the measurement cannot confirm it.',
      measured: summary,
      expected: 'The 20 triples of data/frames.json (colourRole R, G, B; Ozma book and the tape) against the 132 other windows of three consecutive frames on one track',
      tolerance: `Accepted at a likeness of ${LIKENESS_THRESHOLD.toFixed(3)} or more: the midpoint of the measured gap (${LIKENESS_APART_MAX} to ${LIKENESS_ONE_MIN}), the line farthest from both groups; the likeness is the registration's correlation peak (src/dsp/colour.ts)`,
      pass,
      notes: 'The threshold is set from the same 152 windows it is tested on (the record holds no others), so this shows the gap exists, with 0.176 of margin either side, not a held-out error rate. The order of the three is shown as probable (D-A08): red, green, blue, as most readers assemble them (Barry, gourneau); amazing-rando\'s README says blue, green, red (teaching-frames.md "Colour order").',
    });
    expect(wrong).toEqual([]);
    expect(pass).toBe(true);
  });

  it('pictures.down: the turn that matches Barry\'s table, and only that', () => {
    const ok = checkDown({ frame: 'L039', quarterTurns: 1 });
    const heads = checkDown({ frame: 'L039', quarterTurns: 3 });
    const flip = checkDown({ frame: 'L039', quarterTurns: 2 });
    const upright = checkDown({ frame: 'L002', quarterTurns: 0 });
    const anti = checkDown({ frame: 'L012', quarterTurns: -1 });
    const jupiterHeads = checkDown({ frame: 'L012', quarterTurns: 1 });
    // people are spoken of only where the record's title names them (L039 a diagram of male and female; L012 Jupiter)
    const wording = /people/.test(ok.message) && !/people/.test(anti.message) && !/people/.test(jupiterHeads.message) && /its head/.test(jupiterHeads.message);
    // every turned frame accepts exactly one of the four turns
    const unique = TURNED_FRAMES.every((f) => [0, 1, 2, 3].filter((t) => checkDown({ frame: f, quarterTurns: t }).ok).length === 1);
    const pass = ok.ok && !heads.ok && /heads/.test(heads.message) && !flip.ok && /sides/.test(flip.message) && !upright.ok && anti.ok && unique && wording && BARRY_TO_CW[1] === 1 && BARRY_TO_CW[2] === 3;
    recordCheck({
      id: 'pictures.down',
      claim: 'Turned a quarter turn clockwise, the diagram of the two figures stands upright, as Barry\'s table says; every other turn is refused with what it would show, and pictures that came upright are not counted.',
      measured: `L039: 1 quarter turn accepted, 3 (${heads.message.slice(0, 40)}...) and 2 refused; L012 (Jupiter) anticlockwise accepted without a word of people (${anti.message.slice(0, 60)}...); ${TURNED_FRAMES.length} turned frames each accept exactly one turn`,
      expected: 'Barry\'s orientation table, read from his code (tools/ref-decoder/barry.py: 1 is the native frame turned 90 degrees clockwise, 2 anticlockwise); teaching-frames.md: for L039 the clockwise turn puts "20 y" upright',
      tolerance: 'exact',
      pass,
    });
    expect(pass).toBe(true);
  });

  it('the teaching regions hold ink on the reference decode and on the browser\'s decode of the same frame', { timeout: 120_000 }, () => {
    const regions: [string, Region, number][] = [];
    const t = TEACHING;
    for (const d of t.L002.digits) regions.push(['L002', d.region, d.ink]);
    for (const d of [...t.L002.dots, ...t.L002.binary, ...t.L002.sums, ...t.L002.larger]) regions.push(['L002', d.region, d.ink]);
    for (const l of t.L003.lines) regions.push(['L003', l.region, l.ink]);
    for (const c of t.table.columns) for (const cell of Object.values(c.cells)) regions.push([c.frame, cell!.region, cell!.ink]);
    for (const h of t.L039.heights) regions.push(['L039', h.region, h.ink]);
    let weakest = Infinity;
    let thinnest = Infinity;
    let refOk = true;
    let failures = 0;
    for (const [f, r, ink] of regions) {
      const p = picture(f)!;
      const n = inkIn(p.gray, p.width, r);
      weakest = Math.min(weakest, n / ink);
      thinnest = Math.min(thinnest, n / area(r));
      // half the builder's ink: the 96 kHz decode differs a little from the 384 kHz one (SSIM 0.970 to 0.99,
      // tools/ref-decoder/README.md "Browser slices"), and this count uses the region's own card level; and at
      // least 3% of the region dark, three times what blank card holds (1%, the control below; the thinnest region, a line drawing, is about 6%)
      if (n < 0.5 * ink || n < 0.03 * area(r)) failures++;
      const path = `build/ref/frames/${f}.png`;
      if (existsSync(path)) {
        const png = decodePng(readFileSync(path));
        const m = inkIn(png.data, png.width, r);
        refOk &&= m >= 0.5 * ink && m >= 0.03 * area(r);
      }
    }
    const blankBox: Region = [440, 300, 520, 340];
    const blank = inkIn(picture('L002')!.gray, 536, blankBox) / area(blankBox);
    // the planet table parses as the research reads it (Pluto's distance included: it is the slip)
    const parse = TEACHING.table.columns.map((c) => c.cells.distance?.text ?? '-').join(', ');
    const pass = failures === 0 && refOk && blank < 0.02 && HOME === 3 && SLIP?.column === 9 && SLIP?.read === 591e6 && parse === '-, 58 x 10^6, 108, 150, 228, 778 x 10^6, 1428, 2872, 4498, 591';
    console.log(`teaching.regions: ${regions.length} regions; weakest ink ratio on the browser decode ${weakest.toFixed(2)}, thinnest ${(thinnest * 100).toFixed(1)}% dark; reference ${refOk}; blank card ${(blank * 100).toFixed(1)}% dark; distances ${parse}`);
    recordCheck({
      id: 'teaching.regions',
      claim: 'Every symbol, number and table cell the player reads is a region measured by ink on our decode of the tape, and it holds that ink on the browser\'s own decode of the same frame; the planet table parses as the research reads it, Pluto\'s 591 included.',
      measured: `${regions.length} regions; on the 96 kHz browser decode each holds at least ${(weakest * 100).toFixed(0)}% of the ink measured on the 384 kHz reference and is at least ${(thinnest * 100).toFixed(1)}% dark; the reference passes the same test; blank card ${(blank * 100).toFixed(1)}% dark; distances ${parse}`,
      expected: 'docs/research/teaching-frames.md (the readings of L002, L003, L004, L005, L039); data/teaching.json built by tools/data/build_teaching.py',
      tolerance: 'at least half the builder ink count and 3% of the region dark, on both decodes (they agree to SSIM 0.97 to 0.99); blank card under 2%',
      pass,
    });
    expect(pass).toBe(true);
  });
});

describe('The Pictures complete: the teaching checkers', () => {
  it('pictures.numerals: every digit to its count; a wrong or missing digit is refused', () => {
    const right = Object.fromEntries(TEACHING.L002.digits.map((d) => [String(d.glyph), d.value]));
    const ok = checkNumerals({ table: right });
    const swapped = checkNumerals({ table: { ...right, '6': 6, '5': 7 } });
    const part = checkNumerals({ table: { '0': 1, '1': 2 } });
    // independent truth, the research's reading of L002 (teaching-frames.md): beside the rows of one to nine dots
    // their own digit for that count, and ten written with two digits, one (the mark of the first row) and none
    // (the one new mark, listed on the row of ten)
    const nine = TEACHING.L002.digits.filter((d) => d.row <= 9);
    const ten = TEACHING.L002.digits.filter((d) => d.row === 10).map((d) => d.value);
    const truthOk = nine.length === 9 && nine.every((d) => d.value === d.row) && JSON.stringify(ten) === '[0]';
    const pass = truthOk && ok.ok && reading(ok, 'their base') === 10 && !swapped.ok && /row of 7, set as 6/.test(swapped.message) && !part.ok;
    recordCheck({
      id: 'pictures.numerals',
      claim: 'Matching each of their ten digits to the count of dots beside it is accepted only when all ten are right; ten is written with two of them, one and none, so they count by place in tens. A swapped or missing digit is refused.',
      measured: `${reading(ok, 'digits matched')} matched, base ${reading(ok, 'their base')}; two digits swapped refused (${swapped.message.slice(0, 60)}...); two of ten set refused`,
      expected: 'teaching-frames.md L002: dots one to six with binary and "= decimal", the digits 0 to 9 beside the counts, ten as "1 0"',
      tolerance: 'exact',
      pass,
    });
    expect(pass).toBe(true);
  });

  it('pictures.units: their second in beats within the three figures they wrote', () => {
    const exact = checkUnits({ secondInBeats: SECOND_BEATS });
    const edge = checkUnits({ secondInBeats: SECOND_BEATS * (1 + 0.9 * SECOND_PRECISION) });
    const past = checkUnits({ secondInBeats: SECOND_BEATS * (1 + 1.1 * SECOND_PRECISION) });
    const power = checkUnits({ secondInBeats: SECOND_BEATS / 10 }); // 10^8 read for 10^9
    // independent truth: 1.42e9 hydrogen periods (units.ts) over the beat (0.871 s, D-A22): 1.1478 beats
    const truth = (1.42e9 / 1_420_405_751.768) / 0.871;
    const pass = exact.ok && edge.ok && !past.ok && !power.ok && Math.abs(SECOND_BEATS / truth - 1) < 1e-12 && /times less/.test(power.message);
    recordCheck({
      id: 'pictures.units',
      claim: 'Their second, read off the unit picture as 1 42/100 x 10^9 spin flips, is 1.148 of the alien\'s beats; a reading within the precision of those three figures is accepted, a power of ten off is refused with what it would mean.',
      measured: `their second ${SECOND_BEATS.toFixed(5)} beats; accepted within ${(SECOND_PRECISION * 100).toFixed(2)}%; 10^8 refused (${power.message.slice(0, 50)}...)`,
      expected: '1.42e9 / 1,420,405,751.768 Hz = 0.99971 s (units.ts, clocks.md section 5) over 0.871 s per beat (D-A22) = 1.14778 beats',
      tolerance: 'half a unit in the last written figure of 1 42/100 (0.35%)',
      pass,
    });
    expect(pass).toBe(true);
  });

  it('pictures.home and pictures.slip: the column of ones, and the one distance out of order', () => {
    const home = checkHome({ column: 3 });
    const venus = checkHome({ column: 2 });
    const sun = checkHome({ column: 0 });
    const slip = checkSlip({ column: 9, row: 'distance' });
    const fits = checkSlip({ column: 8, row: 'distance' });
    const otherRow = checkSlip({ column: 9, row: 'day' });
    const homePass = home.ok && reading(home, 'place outward') === 3 && !venus.ok && !sun.ok && /star/.test(sun.message);
    const slipPass = slip.ok && /4,498|4498|more than/.test(slip.message) && /not in your decoding/.test(slip.message) && !fits.ok && !otherRow.ok;
    recordCheck({
      id: 'pictures.home',
      claim: 'Of the ten columns, the one whose mass and day are both one is the third world out from the star: home.',
      measured: `home: column 3, place ${reading(home, 'place outward')}; Venus and the Sun refused`,
      expected: 'teaching-frames.md: "Earth\'s column is the column of ones: the third world is home"',
      tolerance: 'exact',
      pass: homePass,
    });
    recordCheck({
      id: 'pictures.slip',
      claim: 'One cell, the outermost distance, breaks the rising order of distances; the order alone says it must be more than Neptune\'s, and it is a slip in their table, not in the decoding.',
      measured: `column 9's distance accepted (${slip.message.slice(0, 90)}...); Neptune's distance (which fits the order) and Pluto's day (no rule for it) refused`,
      expected: 'teaching-frames.md: "Pluto\'s column breaks the table\'s own pattern"; its 591 read whole on the 536-line decode (decoder.ref.rightEdge)',
      tolerance: 'exact',
      pass: slipPass,
    });
    expect(homePass && slipPass).toBe(true);
  });

  it('pictures.height: 160 of their centimetres in reaches, within half a centimetre', () => {
    const taller = HEIGHTS.find((h) => h.cm === 160)!;
    const shorter = HEIGHTS.find((h) => h.cm === 155)!;
    const r160 = taller.metres / REACH_M;
    const ok = checkHeight({ reaches: r160 });
    const both = checkHeight({ reaches: [shorter.metres / REACH_M, r160] });
    const metres = checkHeight({ reaches: 160 / REACH_M }); // read as metres
    const swapped = checkHeight({ reaches: shorter.metres / REACH_M }); // the shorter figure's number
    const near = checkHeight({ reaches: (159 * taller.metres) / 160 / REACH_M }); // 159 read for 160: refused
    // the refusal must show the two readings with enough figures to differ (M5 science audit, wording)
    const shown = [...near.message.matchAll(/\{\{q\|length\|([^|}]+)\|(\d+)\}\}/g)].map((m) => alienText('length', Number(m[1]), Number(m[2])));
    const apart = !near.ok && shown.length === 2 && shown[0] !== shown[1];
    // independent truth: 160 x (21.106114054 cm / 21) over 1.37 m per reach (D-A22) = 1.1738
    const truth = (160 * 0.21106114054) / 21 / 1.37;
    const pass = ok.ok && both.ok && !metres.ok && !swapped.ok && apart && Math.abs(r160 / truth - 1) < 1e-9 && /reaches/.test(String(reading(ok, 'their heights')));
    recordCheck({
      id: 'pictures.height',
      claim: 'The taller figure is 160 of their centimetres, 1.174 of the alien\'s reaches (the shorter 155, 1.137); a reading within half a centimetre is accepted, a misread unit or the other bar is refused.',
      measured: `taller ${r160.toFixed(4)} reaches, shorter ${(shorter.metres / REACH_M).toFixed(4)}; ${String(reading(ok, 'their heights'))}; 160 read as metres refused; the shorter bar alone refused; 159 refused, shown as ${shown.join(' against ')}`,
      expected: 'teaching-frames.md L039: 155 cm and 160 cm; their cm = 1/21 of the hydrogen wavelength (units.ts); 1.37 m per reach (D-A22)',
      tolerance: 'half a centimetre in 160 (0.31%)',
      pass,
    });
    expect(pass).toBe(true);
  });
});

describe('The Pictures complete: headlines and the Finder\'s numerals', () => {
  it('every confirmed teaching result leads with a headline from its own reading, with no number in the sentence', async () => {
    const { HEADLINES } = await import('../headlines');
    const { headlineOf } = await import('../../ui/headline');
    const right = Object.fromEntries(TEACHING.L002.digits.map((d) => [String(d.glyph), d.value]));
    const results = {
      'pictures.down': checkDown({ frame: 'L039', quarterTurns: 1 }),
      'pictures.numerals': checkNumerals({ table: right }),
      'pictures.units': checkUnits({ secondInBeats: SECOND_BEATS }),
      'pictures.home': checkHome({ column: HOME }),
      'pictures.slip': checkSlip({ column: SLIP!.column, row: SLIP!.row }),
      'pictures.height': checkHeight({ reaches: HEIGHTS.find((h) => h.cm === 160)!.metres / REACH_M }),
    };
    for (const [id, r] of Object.entries(results)) {
      expect(r.ok, id).toBe(true);
      const h = headlineOf(HEADLINES[id], r);
      expect(h, id).not.toBeNull();
      expect(h!.sentence, id).not.toMatch(/\d/);
      expect(h!.quantity ?? h!.value, id).toBeDefined();
    }
    for (const id of ['pictures.album', 'pictures.colour']) expect(HEADLINES[id], id).toBeDefined();
  });

  it('the ten numerals are distinct, deterministic and inside their box', async () => {
    const { numeralGlyph, GLYPH_W, GLYPH_H } = await import('../../ui/glyphs');
    const sigs = new Set<string>();
    for (let n = 0; n <= 9; n++) {
      const g = numeralGlyph(n);
      expect(numeralGlyph(n)).toEqual(g);
      sigs.add(JSON.stringify(g));
      const nums = g.strokes.join(' ').match(/-?\d+(\.\d+)?/g)!.map(Number);
      for (let i = 0; i < nums.length; i += 2) {
        expect(nums[i]!).toBeGreaterThanOrEqual(-6);
        expect(nums[i]!).toBeLessThanOrEqual(GLYPH_W + 6);
        expect(nums[i + 1]!).toBeGreaterThanOrEqual(-6);
        expect(nums[i + 1]!).toBeLessThanOrEqual(GLYPH_H + 6);
      }
    }
    expect(sigs.size).toBe(10);
    expect(() => numeralGlyph(10)).toThrow();
  });
});
