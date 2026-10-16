// The deduction graph's data: the chapters and, for the vertical slice, their nodes. Ids are stable; later
// milestones add the rest. Plain English only (no em dashes). Hints are the three tiers (nudge, method,
// answer); a number inside a hint is computed from the cover's own data (data/cover.json), never typed.

import coverJson from '../../data/cover.json';
import { binaryToMetres, binaryToSeconds } from '../science/units';

export type ChapterId =
  | 'arrival'
  | 'key'
  | 'map'
  | 'spot'
  | 'trail'
  | 'player'
  | 'pictures'
  | 'voices'
  | 'portrait'
  | 'epilogue';

/** What the player is looking at: a chapter's workbench or the hub ring. */
export type ChapterView = ChapterId | 'hub';

export interface ChapterDef {
  id: ChapterId;
  /** English title, also the key of its glyph label. */
  title: string;
  gloss: string;
  /** Deductions that must be confirmed before the chapter opens (D-A06). */
  requires: string[];
  /** False for a chapter whose instruments are not built yet: it shows on the hub as "later". */
  built: boolean;
}

export type HintTiers = [nudge: string, method: string, answer: string];

export interface NodeDef {
  id: string;
  chapter: ChapterId;
  /** English key for the glyph label. */
  key: string;
  /** What the alien is trying to find out, as a question that does not give the answer. Shown while the node is open or locked. */
  question: string;
  /** Plain English statement of the conclusion. Shown only once the node is confirmed, and in the codex. */
  gloss: string;
  requires: string[];
  /** The row of the deduction table in How it's checked (docs/HOW_ITS_CHECKED.md). */
  checkedRow: number;
  hints: HintTiers;
}

const rotationS = binaryToSeconds(coverJson.record.rotationPeriod.binary);
const rotationAsKm = binaryToMetres(coverJson.record.rotationPeriod.binary) / 1000;
const lineMs = binaryToSeconds(coverJson.picture.lineTime.binary) * 1000;

/** Round to three significant figures for a hint. */
const sig3 = (x: number): string => Number(x.toPrecision(3)).toLocaleString('en-US', { maximumFractionDigits: 20 });

export const CHAPTERS: readonly ChapterDef[] = [
  { id: 'arrival', title: 'Arrival', gloss: 'A cold machine, falling past your star.', requires: [], built: true },
  { id: 'key', title: 'The Key', gloss: 'Reading the cover: its marks and its unit.', requires: ['arrival.purpose'], built: true },
  { id: 'map', title: 'The Map', gloss: 'Fourteen lines and their numbers.', requires: ['key.timesNotLengths'], built: false },
  { id: 'spot', title: 'The Spot', gloss: 'A speck of uranium on the cover.', requires: ['key.timesNotLengths'], built: false },
  { id: 'trail', title: 'The Trail', gloss: 'Where it came from, and how long ago.', requires: ['key.timesNotLengths'], built: false },
  { id: 'player', title: 'The Player', gloss: 'How the disc is meant to be played.', requires: ['key.timesNotLengths'], built: true },
  { id: 'pictures', title: 'The Pictures', gloss: 'Turning the signal into images.', requires: ['key.timesNotLengths'], built: true },
  { id: 'voices', title: 'The Voices', gloss: 'What the disc says.', requires: ['player.firstSound'], built: false },
  { id: 'portrait', title: 'Portrait', gloss: 'Who sent it.', requires: ['pictures.firstFrames'], built: false },
  { id: 'epilogue', title: 'Our Frame', gloss: 'Where the machines are now.', requires: ['pictures.firstFrames'], built: false },
];

const QUESTIONS: Record<string, string> = {
  'arrival.purpose': 'What is this machine for?',
  'arrival.heat': 'What warms the three cylinders?',
  'arrival.madeNotMined': 'Was this fuel mined, or made?',
  'arrival.fuelAge': 'How old is the heat source?',
  'key.binary': 'What do the two kinds of stroke mean?',
  'key.unit': 'What is the unit?',
  'key.timesNotLengths': "Are the cover's numbers times, or lengths?",
  'player.speed': 'How fast does the disc turn?',
  'player.start': 'Where does the needle start?',
  'player.direction': 'Which way does it turn?',
  'player.firstSound': 'What does it sound like?',
  'pictures.lineTime': 'How long is one line of the picture?',
  'pictures.sync': 'Where does each line begin?',
  'pictures.interlace': 'Why do the edges look jagged?',
  'pictures.polarity': 'Is the picture the right way round in brightness?',
  'pictures.aspect': 'What shape is the picture?',
  'pictures.circle': 'Does the calibration figure come out true?',
  'pictures.firstFrames': 'Do the same settings read the next pictures?',
};

const RAW_NODES: readonly Omit<NodeDef, 'question'>[] = [
  // ---- arrival ----
  {
    id: 'arrival.purpose', chapter: 'arrival', key: 'purpose', checkedRow: 1, requires: [],
    gloss: 'It was built to send across distance, and to sense.',
    hints: [
      'Look at the shapes before the heat. What is a dish for, and what is a boom for?',
      'A large dish is pointed at something far away, to send or to listen. A boom holds an instrument away from the body, to sense.',
      'The dish and the booms say it: this machine was built to send across distance, and to sense.',
    ],
  },
  {
    id: 'arrival.heat', chapter: 'arrival', key: 'heat', checkedRow: 1, requires: ['arrival.purpose'],
    gloss: 'Three cylinders are warm, from a source that has run for a very long time.',
    hints: [
      'Something aboard is warmer than the cold around it. Scan for it.',
      'Run the heat scan and count the warm bodies, then compare their warmth with what the rest of the machine gives off.',
      'Three cylinders are faintly warm. A steady heat source is aboard, and it has run for a very long time.',
    ],
  },
  {
    id: 'arrival.madeNotMined', chapter: 'arrival', key: 'made not mined', checkedRow: 2, requires: ['arrival.heat'],
    gloss: 'Uranium-234 with almost no uranium-238 means the fuel was made, not mined.',
    hints: [
      'Read the isotopes in the warm material. Which uranium is there, and which is missing?',
      'Natural uranium carries thousands of uranium-238 atoms for every uranium-234 atom. Compare that ratio with the one you measure.',
      'There is uranium-234 and almost no uranium-238. Mined uranium would carry far more. The fuel was made, not mined.',
    ],
  },
  {
    id: 'arrival.fuelAge', chapter: 'arrival', key: 'fuel age', checkedRow: 1, requires: ['arrival.madeNotMined'],
    gloss: 'The thorium-230 to uranium-234 ratio dates the heat source.',
    hints: [
      'The thorium-230 grows from the uranium-234 at a steady rate. What does its amount tell you?',
      'Choose the decay chain that made the uranium-234, predict the thorium-to-uranium ratio against time, and find where your measurement meets the prediction.',
      'The age is where the predicted thorium-230 to uranium-234 ratio meets your measured one. Quote it with its interval.',
    ],
  },
  // ---- the key ----
  {
    id: 'key.binary', chapter: 'key', key: 'binary', checkedRow: 3, requires: [],
    gloss: 'The two kinds of stroke are binary digits.',
    hints: [
      'Two kinds of stroke keep appearing in the cover\'s strings. Count the kinds.',
      'A bar across the line of writing and a dash along it: two symbols are enough to write a number place by place.',
      'The two strokes are binary digits: the bar across the line is one, the dash along it is zero.',
    ],
  },
  {
    id: 'key.unit', chapter: 'key', key: 'unit', checkedRow: 3, requires: ['key.binary'],
    gloss: 'The unit is the spin-flip of hydrogen.',
    hints: [
      'The cover draws hydrogen in two states, with a transition between them marked with a one.',
      'A change between two states of the same atom is a natural unit. Try the one the cover shows and see whether the cover\'s other numbers become sensible.',
      'The unit is the period of hydrogen\'s spin-flip transition, the cover\'s "1".',
    ],
  },
  {
    id: 'key.timesNotLengths', chapter: 'key', key: 'times not lengths', checkedRow: 4, requires: ['key.unit'],
    gloss: 'The cover\'s numbers are times, not lengths.',
    hints: [
      'Try the cover\'s numbers as lengths, then as times. Which reading is sensible?',
      'Convert the number around the record both ways. A record that is absurdly large around makes no sense.',
      `The number around the record, read as a length, is about ${sig3(rotationAsKm)} km. Read as a time it is ${sig3(rotationS)} s. The numbers are times.`,
    ],
  },
  // ---- the player ----
  {
    id: 'player.speed', chapter: 'player', key: 'speed', checkedRow: 11, requires: [],
    gloss: 'The record turns once in the time written round its edge.',
    hints: [
      'The cover gives the record\'s turning as a time. Use it.',
      'The number around the record, read in hydrogen periods, is the time of one turn. Set the turntable to that.',
      `One turn takes ${sig3(rotationS)} seconds.`,
    ],
  },
  {
    id: 'player.start', chapter: 'player', key: 'start', checkedRow: 11, requires: ['player.speed'],
    gloss: 'The needle starts at the outer edge and plays inward.',
    hints: [
      'Where on the disc does the sound begin?',
      'The groove is one spiral. Look at the groove under the microscope and find which end is the start.',
      'Start the needle at the outer edge of the groove and let it play inward.',
    ],
  },
  {
    id: 'player.direction', chapter: 'player', key: 'direction', checkedRow: 11, requires: ['player.speed'],
    gloss: 'The disc turns the way the groove carries the needle inward.',
    hints: [
      'Look at the groove under the microscope. Which way does it wind?',
      'The spiral shows which way the stylus is carried. Try both ways: the wrong one sounds backward.',
      'Turn the disc the way that carries the needle in along the spiral. The other way plays backward.',
    ],
  },
  {
    id: 'player.firstSound', chapter: 'player', key: 'first sound', checkedRow: 11, requires: ['player.start', 'player.direction'],
    gloss: 'The first sound is a picture, sent line by line.',
    hints: [
      'Drop the needle where the groove begins and listen.',
      'With the speed, the start and the direction all right, the disc plays. A wrong one gives pitch and tempo shifts, silence or backward sound.',
      'Drop the needle at the start of the groove, at the right speed and direction. The first sound is your confirmation.',
    ],
  },
  // ---- the pictures ----
  {
    id: 'pictures.lineTime', chapter: 'pictures', key: 'line time', checkedRow: 12, requires: ['player.speed'],
    gloss: 'One picture line lasts the time the cover gives.',
    hints: [
      'The cover draws a picture as vertical lines, and gives the time of one.',
      'Read the line time off the cover with the key, then free-run the decoder at it and watch whether the image holds still.',
      `One picture line lasts ${sig3(lineMs)} ms, the cover\'s number.`,
    ],
  },
  {
    id: 'pictures.sync', chapter: 'pictures', key: 'sync', checkedRow: 12, requires: ['pictures.lineTime'],
    gloss: 'Each line starts at its own sync pulse.',
    hints: [
      'The signal repeats a mark at the start of every line.',
      'Find the sync pulses in the signal and start each line at one, instead of trusting a fixed line time all the way down.',
      'Lock every line to its own sync pulse, so small timing errors do not add up.',
    ],
  },
  {
    id: 'pictures.interlace', chapter: 'pictures', key: 'interlace', checkedRow: 12, requires: ['pictures.sync'],
    gloss: 'The lines are staggered, and the stagger can be undone.',
    hints: [
      'Straight edges look jagged. Neighbouring lines seem offset from each other.',
      'The cover shows the lines staggered. Shift the lines that follow the long sync and the short sync until the edges line up.',
      'Undo the stagger between the two kinds of line and the vertical edges straighten.',
    ],
  },
  {
    id: 'pictures.polarity', chapter: 'pictures', key: 'polarity', checkedRow: 12, requires: ['pictures.sync'],
    gloss: 'More signal is darker: the picture is read as a negative.',
    hints: [
      'Does the picture look like a negative?',
      'The cover\'s drawing shows which way brightness goes. Try both: with one reading, more signal means darker.',
      'Read more signal as darker, the way a negative is read.',
    ],
  },
  {
    id: 'pictures.aspect', chapter: 'pictures', key: 'aspect', checkedRow: 12, requires: ['pictures.interlace'],
    gloss: 'The number of lines sets the shape of the picture.',
    hints: [
      'Compare the picture\'s width with its height.',
      'The cover gives the number of lines. The calibration circle must come out round, so adjust the rows until it does.',
      'Set the rows so that the calibration circle is round: that fixes the picture\'s shape.',
    ],
  },
  {
    id: 'pictures.circle', chapter: 'pictures', key: 'circle', checkedRow: 12, requires: ['pictures.aspect', 'pictures.polarity'],
    gloss: 'The calibration circle comes out round.',
    hints: [
      'The first picture on the record is a circle.',
      'Measure its two axes. When they agree to about one part in a hundred, the settings are right.',
      'With line time, sync, interlace, polarity and rows all right, the calibration circle comes out round.',
    ],
  },
  {
    id: 'pictures.firstFrames', chapter: 'pictures', key: 'first frames', checkedRow: 12, requires: ['pictures.circle'],
    gloss: 'The same settings develop the following pictures.',
    hints: [
      'With the circle round, play on.',
      'Keep the same settings and decode the next frames at record speed.',
      'The settings that made the circle round develop the pictures that follow it, line by line.',
    ],
  },
];

export const NODES: readonly NodeDef[] = RAW_NODES.map((n) => ({ ...n, question: QUESTIONS[n.id] ?? '' }));

const nodeById = new Map(NODES.map((n) => [n.id, n]));
const chapterById = new Map(CHAPTERS.map((c) => [c.id, c]));

export function nodeDef(id: string): NodeDef | undefined {
  return nodeById.get(id);
}

export function chapterDef(id: string): ChapterDef | undefined {
  return chapterById.get(id as ChapterId);
}

export function nodesOf(chapter: ChapterId): NodeDef[] {
  return NODES.filter((n) => n.chapter === chapter);
}

/** `#arrival` and the like. Returns null for anything that is not a chapter or the hub. */
export function parseChapterHash(hash: string): ChapterView | null {
  const h = hash.replace(/^#\/?/, '');
  if (h === 'hub') return 'hub';
  return chapterById.has(h as ChapterId) ? (h as ChapterId) : null;
}
