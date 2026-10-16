// The deduction graph's data: the chapters and their nodes (the slice's, and M4's for The Map, The Spot and
// The Trail). Ids are stable; later milestones add the rest. Plain English only (no em dashes). Hints are the three tiers (nudge, method,
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
/** The pulsar lines on the cover's map that carry a number (the Galactic-centre line carries none). */
const mapLineCount = coverJson.pulsarMap.lines.length;
const sig3 = (x: number): string => Number(x.toPrecision(3)).toLocaleString('en-US', { maximumFractionDigits: 20 });

export const CHAPTERS: readonly ChapterDef[] = [
  { id: 'arrival', title: 'Arrival', gloss: 'A cold machine, falling past your star.', requires: [], built: true },
  { id: 'key', title: 'The Key', gloss: 'Reading the cover: its marks and its unit.', requires: ['arrival.purpose'], built: true },
  { id: 'map', title: 'The Map', gloss: 'Fourteen lines and their numbers.', requires: ['key.timesNotLengths'], built: true },
  { id: 'spot', title: 'The Spot', gloss: 'A speck of uranium on the cover.', requires: ['key.timesNotLengths'], built: true },
  { id: 'trail', title: 'The Trail', gloss: 'Where it came from, and how long ago.', requires: ['key.timesNotLengths'], built: true },
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
  'map.periods': `What are the ${mapLineCount} numbers along the lines?`,
  'map.old': 'Is the map new, or old?',
  'map.identify': 'Which line belongs to which star?',
  'map.motion': 'Why do the lines tell different ages?',
  'map.region': 'Where was the map drawn from?',
  'spot.find': 'Is there anything on the cover that the diagrams do not show?',
  'spot.age': 'How long ago was it laid down?',
  'spot.purity': 'Was it pure when it was laid down?',
  'trail.origin': 'Which star did it come from?',
  'trail.age': 'How long has it been travelling?',
  'trail.neighbour': 'How far is that star from your own?',
  'trail.where': 'Is that the star the map was drawn from?',
  'trail.when': 'When was the map made?',
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
  {
    id: 'map.periods', chapter: 'map', key: 'periods', checkedRow: 5, requires: ['key.timesNotLengths'],
    gloss: 'They are the spin periods of pulsars, in the cover\'s unit.',
    hints: [
      'Read the numbers through the key you found, as times.',
      'Compare each time with the stars in your catalogue that pulse.',
      'Each number is a pulsar\'s period: drag a line onto the pulsar that lies along it and ticks at nearly that rate.',
    ],
  },
  {
    id: 'map.old', chapter: 'map', key: 'old map', checkedRow: 7, requires: ['map.periods'],
    gloss: 'The map is old: nearly every pulsar now ticks slower than the map says.',
    hints: [
      'Set each matched star\'s rate beside the map\'s number.',
      'Pulsars slow down as they age. Which way do the differences go?',
      'Almost every matched pulsar ticks slower now than on the map: the map was made long ago.',
    ],
  },
  {
    id: 'map.identify', chapter: 'map', key: 'identify', checkedRow: 5, requires: ['map.old'],
    gloss: `Each of the ${mapLineCount} lines belongs to one pulsar in your catalogue: the old ones by rate and direction, the young ones by direction once the age is known.`,
    hints: [
      'Start with the lines whose stars barely change.',
      'Match the old pulsars first by rate and direction; their ages give you the map\'s age, and then the young ones can be found by direction alone.',
      'Assign every line to its best match on the chart: the match quality tells you when it fits.',
    ],
  },
  {
    id: 'map.motion', chapter: 'map', key: 'motion', checkedRow: 7, requires: ['map.identify'],
    gloss: 'Your own motion shifts every rate: the ages disagree in a pattern across the sky, and that pattern measures how fast you move relative to the map\'s makers.',
    hints: [
      'Plot each line\'s age against where its star lies in your sky.',
      'The errors are not random: one side of the sky reads too old, the other too young.',
      'Fit one velocity to the pattern: your motion relative to the map\'s frame shifts every rate by the same rule.',
    ],
  },
  {
    id: 'map.region', chapter: 'map', key: 'origin', checkedRow: 6, requires: ['map.identify'],
    gloss: 'The map was drawn from a small region of the galaxy, not a single point; your own star was among the stars inside it when the map was made.',
    hints: [
      'All the lines start from one point.',
      'Slide and turn the map until its lines point at their stars; where they cross is where it was drawn.',
      'Fit the lines\' common origin: the fit gives a region, not a point, because the map\'s angles and lengths are rough.',
    ],
  },
  {
    id: 'spot.find', chapter: 'spot', key: 'spot', checkedRow: 8, requires: ['key.timesNotLengths'],
    gloss: 'A faint radioactive spot of uranium that no diagram mentions.',
    hints: [
      'Not everything on the cover can be seen.',
      'Sweep the cover with the detector.',
      'There is a small, faintly radioactive patch: mark where the count rate rises.',
    ],
  },
  {
    id: 'spot.age', chapter: 'spot', key: 'spot age', checkedRow: 8, requires: ['spot.find'],
    gloss: 'The uranium-234 grown inside the spot gives its age, with an error bar that shrinks the longer you count.',
    hints: [
      'Count what comes off it.',
      'Count the alphas by their energy: each kind of uranium sends its own, and their ratio grows with time.',
      'Count long enough for a narrow error bar, then read the age from the ratio of uranium-234 to uranium-238.',
    ],
  },
  {
    id: 'spot.purity', chapter: 'spot', key: 'purity', checkedRow: 8, requires: ['spot.age'],
    gloss: 'It began as almost pure uranium-238, with almost none of the uranium-234 natural uranium carries: the thorium-230 agrees, and natural uranium would not.',
    hints: [
      'One clock assumes how it began. A second can check that.',
      'Count the thorium too.',
      'With thorium-230 counted, test the starting assumptions: only a start with almost no uranium-234 fits both clocks; natural uranium does not.',
    ],
  },
  {
    id: 'trail.origin', chapter: 'trail', key: 'origin star', checkedRow: 9, requires: ['key.timesNotLengths'],
    gloss: 'From the warm-white star behind it: the only star it flies straight away from.',
    hints: [
      'A thrown object flies straight away from where it was thrown.',
      'For each nearby star, compare the machine\'s motion relative to that star with the direction from that star.',
      'Pick the star for which the two directions agree within the measurement error.',
    ],
  },
  {
    id: 'trail.age', chapter: 'trail', key: 'travel time', checkedRow: 9, requires: ['trail.origin'],
    gloss: 'Distance over speed: it has been travelling for about as long as the other clocks say.',
    hints: [
      'You know how far it is from that star, and how fast it moves away.',
      'Divide one by the other.',
      'Distance over speed gives the travel time, a third clock independent of the other two.',
    ],
  },
  {
    id: 'trail.neighbour', chapter: 'trail', key: 'neighbour', checkedRow: 10, requires: ['trail.origin'],
    gloss: 'That star is your nearest neighbour, and one of the brightest in your sky.',
    hints: [
      'Measure that star\'s distance from your own.',
      'Compare it with the distances of the other stars around you.',
      'It is the closest star to yours in your whole catalogue.',
    ],
  },
  {
    id: 'trail.where', chapter: 'trail', key: 'where', checkedRow: 6, requires: ['trail.origin', 'map.region'],
    gloss: 'Yes: that star lies inside the map\'s region; the map points home.',
    hints: [
      'You have a region from the map and a star from the trail.',
      'Move the star back to when the map was made and lay it on the region.',
      'The star the machine came from lies inside the region the map was drawn from.',
    ],
  },
  {
    id: 'trail.when', chapter: 'trail', key: 'when', checkedRow: 7, requires: ['trail.where', 'map.motion'],
    gloss: 'Moved into that star\'s rest frame, the pulsar ages agree: the map was made about as long ago as the craft has been travelling.',
    hints: [
      'The map\'s ages disagreed because of your own motion.',
      'Measure the rates as that star would see them: take out your motion relative to it.',
      'In that star\'s rest frame the old pulsars agree on one age: that is when the map was made.',
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
