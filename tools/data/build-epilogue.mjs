// node tools/data/build-epilogue.mjs   (writes data/epilogue.json)
//
// The facts Our Frame (chapter 9, the epilogue) states in our own voice: which instruments still run on each
// Voyager, the power loss, NASA's own time for the one-light-day mark, the published Gliese 445 numbers, the
// epoch of the pulsar map's periods, the line etched in the record's run-out groove and the credits roll.
//
// There is nothing to download: every fact below is entered by hand from a page named in docs/research/epilogue.md
// (researched 2026-10-16), with the URL it came from and the date it was read. The interface shows these words and
// numbers and computes everything else (the Voyagers' positions, our own light-day time, our own Gliese 445 pass,
// the per-pulsar map epochs) from data/ephemeris.json, data/scenario.json, data/stars.json and the pulsar tables.
// src/chapters/epilogue/epilogueData.test.ts holds this file to the research note's numbers.
//
// Writing rule: no dashes except the plain hyphen. The inscription is NASA's "To the makers of music - all
// worlds, all times" (NASA and JPL print a spaced en dash; this project writes a spaced hyphen).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const READ = '2026-10-16';

const sources = {
  'nasa-instruments': { url: 'https://science.nasa.gov/mission/voyager/instruments/', read: READ, pageUpdated: '2026-04-17', title: 'NASA Voyager: instruments' },
  'nasa-blog-2026-08-04': {
    url: 'https://science.nasa.gov/blogs/voyager/2026/08/04/nasa-engineers-help-prolong-voyager-2s-science-mission/',
    read: READ,
    pageUpdated: '2026-08-04',
    title: 'NASA engineers help prolong Voyager 2\'s science mission',
  },
  'jpl-lecp-off': {
    url: 'https://www.jpl.nasa.gov/news/nasa-shuts-off-instrument-on-voyager-1-to-keep-spacecraft-operating/',
    read: READ,
    pageUpdated: null,
    title: 'NASA shuts off instrument on Voyager 1 to keep spacecraft operating',
  },
  'nasa-where-now': {
    url: 'https://science.nasa.gov/mission/voyager/where-are-voyager-1-and-voyager-2-now/',
    read: READ,
    pageUpdated: '2026-10-15',
    title: 'Where are Voyager 1 and Voyager 2 now?',
  },
  'nasa-making-of': { url: 'https://science.nasa.gov/mission/voyager/making-of-the-golden-record/', read: READ, pageUpdated: '2025-04-07', title: 'Making of the Golden Record' },
  'jpl-inscription': {
    url: 'https://jpl.nasa.gov/blog/2015/10/voyager-golden-record-inscription-1977',
    read: READ,
    pageUpdated: '2015-10-29',
    title: 'Voyager Golden Record inscription (JPL, Slice of History)',
  },
  'bailer-jones-2019': { url: 'https://arxiv.org/abs/1912.03503', read: READ, pageUpdated: null, title: 'Bailer-Jones and Farnocchia 2019, RNAAS 3, 59' },
  'ssd72': { url: 'https://doi.org/10.1126/science.175.4024.881', read: READ, pageUpdated: null, title: 'Sagan, Salzman Sagan and Drake 1972, Science 175, 881, Table 1' },
};

/** The ten instruments, in NASA's order. */
const NAMES = {
  ISS: 'cameras (imaging science)',
  CRS: 'cosmic ray subsystem',
  LECP: 'low-energy charged particle instrument',
  MAG: 'magnetometer',
  PLS: 'plasma science',
  PWS: 'plasma wave subsystem',
  IRIS: 'infrared interferometer spectrometer',
  PPS: 'photopolarimeter',
  PRA: 'planetary radio astronomy',
  UVS: 'ultraviolet spectrometer',
};
const ORDER = ['ISS', 'CRS', 'LECP', 'MAG', 'PLS', 'PWS', 'IRIS', 'PPS', 'PRA', 'UVS'];

/** [code, state, off date(s), reason, note]. State 'on' has no date. */
const V1 = [
  ['ISS', 'off', ['1990-02-14'], 'power'],
  ['CRS', 'off', ['2025-02-25'], 'power'],
  ['LECP', 'off', ['2026-04-17'], 'power', 'A 0.5 W scan motor was left on so that a restart stays possible.'],
  ['MAG', 'on'],
  ['PLS', 'off', ['2007-02-01'], 'degraded'],
  ['PWS', 'on'],
  ['IRIS', 'off', ['1998-06-03'], 'power'],
  ['PPS', 'off', ['1980-01-29'], 'degraded'],
  ['PRA', 'off', ['2008-01-15'], 'power'],
  ['UVS', 'off', ['2016-04-19'], 'power'],
];
const V2 = [
  ['ISS', 'off', ['1989-10-10', '1989-12-05'], 'power'],
  ['CRS', 'on'],
  ['LECP', 'off', ['2025-03-24'], 'power'],
  ['MAG', 'on'],
  ['PLS', 'off', ['2024-09-26'], 'power'],
  ['PWS', 'on'],
  ['IRIS', 'off', ['2007-02-01'], 'power'],
  ['PPS', 'off', ['1991-04-03'], 'degraded'],
  ['PRA', 'off', ['2008-02-21'], 'power'],
  ['UVS', 'off', ['1998-11-12'], 'power'],
];

function craft(id, name, rows) {
  const codes = rows.map((r) => r[0]);
  if (JSON.stringify([...codes].sort()) !== JSON.stringify([...ORDER].sort())) throw new Error(`${name}: not the ten instruments`);
  return {
    id,
    name,
    instruments: ORDER.map((code) => {
      const r = rows.find((x) => x[0] === code);
      const out = { code, name: NAMES[code], on: r[1] === 'on' };
      if (!out.on) {
        out.offDates = r[2];
        out.reason = r[3];
        if (r[4]) out.note = r[4];
      }
      return out;
    }),
  };
}

const data = {
  meta: {
    built: new Date().toISOString().slice(0, 10),
    about: 'Facts for Our Frame (chapter 9), entered by hand from the pages in `sources`; see docs/research/epilogue.md.',
    researched: READ,
    note: 'Nothing here is computed. The interface computes the positions, the light-day time, the Gliese 445 pass and the map epochs from the tables.',
  },
  sources,
  instruments: {
    asOf: '2026-08-04',
    asOfText: "NASA's status of 4 August 2026",
    source: ['nasa-instruments', 'nasa-blog-2026-08-04', 'jpl-lecp-off'],
    craft: [craft('-31', 'Voyager 1', V1), craft('-32', 'Voyager 2', V2)],
    powerLossWattsPerYear: 4,
    powerLossSource: ['nasa-blog-2026-08-04'],
    bigBang: {
      name: 'Big Bang',
      date: '2026-08-04',
      text: 'A power rearrangement nicknamed "Big Bang" worked on Voyager 2 on 4 August 2026. Without it another instrument would have gone off before the end of 2026; with it the three run "at least an extra year". The same change on Voyager 1 is due "in the coming months".',
    },
  },
  lightDay: {
    craft: '-31',
    nasaUtc: '2026-11-18T10:16:07Z',
    nasaLocal: '2:16:07 a.m. PST',
    nasaMiles: 16.094e9,
    nasaKm: 25.902e9,
    fromBody: 'Earth',
    source: ['nasa-where-now'],
  },
  gliese445: {
    published: [
      {
        id: 'bailer-jones-2019',
        who: 'Bailer-Jones and Farnocchia 2019 (Gaia DR2)',
        years: 44000,
        pc: 0.575,
        lightYears: 1.88,
        kmS: 116.0,
        source: ['bailer-jones-2019'],
      },
    ],
    nasaPopular: {
      text: 'NASA gives about 1.6 to 1.7 light-years in about 40,000 years.',
      lightYearsLow: 1.6,
      lightYearsHigh: 1.7,
      years: 40000,
      source: ['nasa-where-now'],
    },
  },
  map: {
    periodsEpoch: { text: '1970/1971 epoch', years: [1970, 1971], source: ['ssd72'] },
    launchYear: 1977,
    note: 'Launch year here is the calendar year only, for the "about six years" in the research note; the interface computes the launch date from data/scenario.json.',
  },
  inscription: {
    text: 'To the makers of music - all worlds, all times',
    etched: 'Etched by hand between the label and the grooves.',
    ferris: 'Timothy Ferris asked for one line made by a human hand.',
    where: 'between the photoengraved label and the record grooves',
    source: ['nasa-making-of', 'jpl-inscription'],
  },
  // The credits roll. `check` is a phrase that must appear in docs/CREDITS.md (epilogueData.test.ts).
  credits: {
    people: [
      { name: 'Carl Sagan', role: 'chaired the committee that made the record', check: 'chaired by Carl Sagan' },
      { name: 'Frank Drake', role: 'committee', check: 'Frank Drake' },
      { name: 'Ann Druyan', role: 'committee', check: 'Ann Druyan' },
      { name: 'Timothy Ferris', role: 'committee, and the producer who asked for the hand-etched line', check: 'Timothy Ferris' },
      { name: 'Jon Lomberg', role: 'committee', check: 'Jon Lomberg' },
      { name: 'Linda Salzman Sagan', role: 'committee', check: 'Linda Salzman Sagan' },
    ],
    sources: [
      { name: 'Ozma Records', what: 'the 2016 transfer of the image tape and the 2017 remaster of the record audio', check: 'Ozma Records' },
      { name: 'NASA and JPL', what: 'the Voyager model, the cover diagram and photo, the instruments and the music table', check: 'NASA' },
      { name: 'JPL Horizons', what: 'where the Voyagers and Earth are, any day this century', check: 'JPL Horizons' },
      { name: 'ESA Gaia', what: 'the positions and motions of the stars, and the sky picture', check: 'Gaia DR3' },
      { name: 'ATNF Pulsar Catalogue', what: 'the fourteen pulsars of the map', check: 'ATNF Pulsar Catalogue' },
      { name: 'Jodrell Bank', what: 'the glitch catalogue and the Crab ephemeris', check: 'Jodrell Bank' },
      { name: 'Bailer-Jones and Farnocchia', what: 'the flybys and the Voyagers\' departure directions', check: 'Bailer-Jones' },
      { name: 'Sagan, Salzman Sagan and Drake', what: 'the 1972 table that names the map\'s pulsars', check: 'Salzman Sagan' },
      { name: 'HYG Stellar Database', what: 'the nearby stars', check: 'HYG Stellar Database' },
    ],
  },
};

const out = join(ROOT, 'data', 'epilogue.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(data, null, 1) + '\n');
console.log(`wrote ${out}`);
