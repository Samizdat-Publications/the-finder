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
import { REACH_M } from '../../ui/units';
import { sliceInfo, type SignalProvider } from './checkers';
import {
  ALBUM_FRAMES, BARRY_TO_CW, HEIGHTS, HOME, SECOND_BEATS, SECOND_PRECISION, SLIP, TEACHING, TURNED_FRAMES, channelFrames, checkAlbum,
  checkColour, checkDown, checkHeight, checkHome, checkNumerals, checkSlip, checkUnits, frameRow, stackOf, type DecodedPicture, type PictureProvider,
} from './checkersM5';
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

  it('pictures.colour: each of the 20 triples is one scene, more alike than with its neighbours; other picks are refused', { timeout: 300_000 }, () => {
    const triples: string[][] = [];
    for (const ch of ['L', 'R']) {
      const fs = channelFrames(ch);
      for (let i = 0; i + 2 < fs.length; i++) {
        const r = fs.slice(i, i + 3).map(frameRow);
        if (r[0]!.colourRole === 'R' && r[1]!.colourRole === 'G' && r[2]!.colourRole === 'B') triples.push(fs.slice(i, i + 3));
      }
    }
    const lines: string[] = [];
    let worst = Infinity;
    let allOk = true;
    for (const t of triples) {
      const r = checkColour(picture, { frames: t });
      const a = reading(r, 'likeness of the three') as number;
      const b = reading(r, 'likeness to the neighbours') as number;
      worst = Math.min(worst, a / b);
      allOk &&= r.ok;
      lines.push(`${t[0]} ${a.toFixed(2)}/${b.toFixed(2)}${r.ok ? '' : ' REFUSED'}`);
    }
    // meaningful wrong picks: a near-duplicate pair with a third (Anatomy 3, 4 and 5), and a triple read one
    // frame late (the Earth's G and B with the next scene's R)
    const dup = checkColour(picture, { frames: ['L024', 'L025', 'L026'] });
    const late = checkColour(picture, { frames: ['L014', 'L015', 'L016'] });
    const st = stackOf(picture, ['L014', 'L015', 'L016']);
    expect(() => checkColour(picture, { frames: ['L013', 'L015', 'L014'] })).toThrow(/follow each other/);
    console.log(`pictures.colour: ${lines.join('; ')}; worst ratio ${worst.toFixed(2)}; L024-26 ${dup.ok} (${dup.message.slice(0, 80)}); L014-16 ${late.ok} inner ${st.inner.map((x) => x.toFixed(2))}`);
    const pass = triples.length === 20 && allOk && !dup.ok && !late.ok && worst > 1;
    recordCheck({
      id: 'pictures.colour',
      claim: 'Every one of the record\'s 20 colour pictures is three consecutive frames of one scene: the three line up edge for edge far better than with the frames round them, and stacked as three primaries they make one colour picture. Picks that are not a triple are refused.',
      measured: `20 of 20 accepted; edge likeness of the three over that with their neighbours, worst ${worst.toFixed(2)} (the solar spectrum, nearly featureless); ${lines.join('; ')}`,
      expected: 'The 20 triples of data/frames.json (colourRole R, G, B; Ozma book and the tape); neighbours that are not part of the triple',
      tolerance: 'Accepted when the triple\'s smaller inner likeness exceeds the larger likeness with its outside neighbours (a ratio above 1); the likeness is the colour registration\'s own correlation peak (src/dsp/colour.ts)',
      pass,
      notes: 'The order of the three is shown as probable (D-A08): red, green, blue, as every other reader of the tape uses; the record does not state it.',
    });
    expect(pass).toBe(true);
  });

  it('pictures.down: the turn that matches Barry\'s table, and only that', () => {
    const ok = checkDown({ frame: 'L039', quarterTurns: 1 });
    const heads = checkDown({ frame: 'L039', quarterTurns: 3 });
    const flip = checkDown({ frame: 'L039', quarterTurns: 2 });
    const upright = checkDown({ frame: 'L002', quarterTurns: 0 });
    const anti = checkDown({ frame: 'L012', quarterTurns: -1 });
    // every turned frame accepts exactly one of the four turns
    const unique = TURNED_FRAMES.every((f) => [0, 1, 2, 3].filter((t) => checkDown({ frame: f, quarterTurns: t }).ok).length === 1);
    const pass = ok.ok && !heads.ok && /heads/.test(heads.message) && !flip.ok && /sides/.test(flip.message) && !upright.ok && anti.ok && unique && BARRY_TO_CW[1] === 1 && BARRY_TO_CW[2] === 3;
    recordCheck({
      id: 'pictures.down',
      claim: 'Turned a quarter turn clockwise, the diagram of the two figures stands upright, as Barry\'s table says; every other turn is refused with what it would show, and pictures that came upright are not counted.',
      measured: `L039: 1 quarter turn accepted, 3 (${heads.message.slice(0, 40)}...) and 2 refused; L012 anticlockwise accepted; ${TURNED_FRAMES.length} turned frames each accept exactly one turn`,
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
    expect(ok.ok && reading(ok, 'their base') === 10).toBe(true);
    expect(swapped.ok).toBe(false);
    expect(swapped.message).toMatch(/row of 7, set as 6/);
    expect(part.ok).toBe(false);
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
    const pass =
      home.ok && reading(home, 'place outward') === 3 && !venus.ok && !sun.ok && /star/.test(sun.message) &&
      slip.ok && /4,498|4498|more than/.test(slip.message) && /not in your decoding/.test(slip.message) && !fits.ok && !otherRow.ok;
    recordCheck({
      id: 'pictures.home',
      claim: 'Of the ten columns, the one whose mass and day are both one is the third world out from the star: home. One cell, the outermost distance, breaks the rising order of distances, and the order alone says it must be more than Neptune\'s.',
      measured: `home: column 3, place ${reading(home, 'place outward')}; Venus and the Sun refused; slip: column 9 distance accepted (${slip.message.slice(0, 90)}...); Neptune's distance and Pluto's day refused`,
      expected: 'teaching-frames.md: "Earth\'s column is the column of ones: the third world is home"; "Pluto\'s column breaks the table\'s own pattern"',
      tolerance: 'exact',
      pass,
    });
    expect(pass).toBe(true);
  });

  it('pictures.height: 160 of their centimetres in reaches, within half a centimetre', () => {
    const taller = HEIGHTS.find((h) => h.cm === 160)!;
    const shorter = HEIGHTS.find((h) => h.cm === 155)!;
    const r160 = taller.metres / REACH_M;
    const ok = checkHeight({ reaches: r160 });
    const both = checkHeight({ reaches: [shorter.metres / REACH_M, r160] });
    const metres = checkHeight({ reaches: 160 / REACH_M }); // read as metres
    const swapped = checkHeight({ reaches: shorter.metres / REACH_M }); // the shorter figure's number
    // independent truth: 160 x (21.106114054 cm / 21) over 1.37 m per reach (D-A22) = 1.1738
    const truth = (160 * 0.21106114054) / 21 / 1.37;
    const pass = ok.ok && both.ok && !metres.ok && !swapped.ok && Math.abs(r160 / truth - 1) < 1e-9 && /reaches/.test(String(reading(ok, 'their heights')));
    recordCheck({
      id: 'pictures.height',
      claim: 'The taller figure is 160 of their centimetres, 1.174 of the alien\'s reaches (the shorter 155, 1.137); a reading within half a centimetre is accepted, a misread unit or the other bar is refused.',
      measured: `taller ${r160.toFixed(4)} reaches, shorter ${(shorter.metres / REACH_M).toFixed(4)}; ${String(reading(ok, 'their heights'))}; 160 read as metres refused; the shorter bar alone refused`,
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
