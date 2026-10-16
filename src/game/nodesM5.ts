// M5's deductions (the pictures complete, and The Voices), kept beside graph.ts so the graph file stays a
// readable size; graph.ts merges them into NODES. Same rules as the graph: stable ids, plain English, no
// em dashes, questions that do not give the answer away (graph.test.ts), and no typed numbers in hints or
// glosses (the instruments show the computed ones). Every node starts `later: true` (out of play); the
// builder of its instrument and checker clears the flag as its last change, as with a chapter's `built`.

import type { NodeDef } from './graph';

export const M5_QUESTIONS: Record<string, string> = {
  'pictures.album': 'Does the disc hold more pictures than these?',
  'pictures.colour': 'Why do some pictures come three times?',
  'pictures.down': 'Which way is up?',
  'pictures.numerals': 'What are the marks beside the dots?',
  'pictures.units': 'What do the drawings of the atom define?',
  'pictures.home': 'Which of the circles is theirs?',
  'pictures.slip': 'Does every column follow the table\'s own rules?',
  'pictures.height': 'How tall are they?',
  'voices.many': 'Is it one voice, or many?',
  'voices.hearing': 'How high do their voices reach?',
  'voices.octave': 'How is their music built?',
  'voices.others': 'Are all the voices theirs?',
};

export const M5_NODES: readonly Omit<NodeDef, 'question'>[] = [
  {
    id: 'pictures.album', chapter: 'pictures', key: 'album', checkedRow: 12, requires: ['pictures.firstFrames'],
    gloss: 'Yes: the whole side, decoded with the same settings, fills an album of pictures.',
    hints: [
      'The first pictures were only the start of the side.',
      'Keep the settings and let the rest of the side play through the decoder.',
      'Develop every picture on the side with the settings that made the circle round, and count them.',
    ],
  },
  {
    id: 'pictures.colour', chapter: 'pictures', key: 'colour', checkedRow: 13, requires: ['pictures.album'],
    gloss: 'They are one picture in three colours: stacked as three primaries, the three make a single colour picture.',
    hints: [
      'Look at the three side by side: what is the same, and what is not?',
      'The same scene three times, each a little brighter in different places: stack them as three primaries.',
      'Lay the three frames over each other as three colours of light; the order is the probable one, red, green and blue.',
    ],
  },
  {
    id: 'pictures.down', chapter: 'pictures', key: 'down', checkedRow: 12, requires: ['pictures.album'],
    gloss: 'Some pictures come turned on their sides; turned so that people stand and water lies flat, they are upright.',
    hints: [
      'Not every picture is the right way round.',
      'Find a picture with people or a horizon, and turn it until it looks like the world it shows.',
      'Turn each sideways picture a quarter turn, the way that puts feet below heads and water level.',
    ],
  },
  {
    id: 'pictures.numerals', chapter: 'pictures', key: 'their numerals', checkedRow: 14, requires: ['pictures.album'],
    gloss: 'Their numerals: a digit for each count, written with a place for each power of their base, which you can now read in your own.',
    hints: [
      'One picture counts: dots, then marks you have seen before, then new marks.',
      'The marks you know are the cover\'s strokes; set each new mark beside its count of dots.',
      'Match each of their digits to the count of dots beside it, and write it in your own numerals.',
    ],
  },
  {
    id: 'pictures.units', chapter: 'pictures', key: 'their units', checkedRow: 14, requires: ['pictures.numerals'],
    gloss: 'Their units: a time, a length and a mass taken from hydrogen, and the larger units built from them.',
    hints: [
      'You have met this atom before, on the cover.',
      'The drawings name one spin flip, one wave of its light and one atom\'s mass; read what each is set equal to.',
      'Read their second as a number of spin flips with your new numerals, and turn it into your own beats.',
    ],
  },
  {
    id: 'pictures.home', chapter: 'pictures', key: 'home', checkedRow: 14, requires: ['pictures.units'],
    gloss: 'The world whose every number is one: the senders measured the others against their own.',
    hints: [
      'A table of circles, each with its numbers.',
      'They measured the others in units of one world; which world measures itself?',
      'Find the column where the mass and the day are both one: that world is home. Count its place outward from their star.',
    ],
  },
  {
    id: 'pictures.slip', chapter: 'pictures', key: 'slip', checkedRow: 14, requires: ['pictures.home'],
    gloss: 'One does not: the outermost world\'s distance breaks the table\'s own order, a slip in their table, not in your decoding.',
    hints: [
      'The circles are drawn in order outward from their star.',
      'Read every distance in the same way and check that each is larger than the one before.',
      'The last column\'s distance is smaller than its neighbours\'; it cannot be right as written.',
    ],
  },
  {
    id: 'pictures.height', chapter: 'pictures', key: 'their height', checkedRow: 14, requires: ['pictures.units'],
    gloss: 'Their heights are written beside two of them, in the units they defined; in your own reaches they are a little taller than you might guess from their size on the page.',
    hints: [
      'Two figures stand in one picture, with a number beside each.',
      'The bars beside them run their full height; read the numbers with the units you have learned.',
      'Turn each height into your own reaches.',
    ],
  },
  {
    id: 'voices.many', chapter: 'voices', key: 'many voices', checkedRow: 16, requires: ['player.firstSound'],
    gloss: 'Many: a few dozen speakers at least, one after another, high voices and low.',
    hints: [
      'Listen to the voices that come after the pictures.',
      'Each voice stops before the next begins: count the pauses, and listen to how high each voice is.',
      'Mark the pauses between voices and count them; then compare how widely their pitches spread with one speaker\'s own range.',
    ],
  },
  {
    id: 'voices.hearing', chapter: 'voices', key: 'their hearing', checkedRow: 16, requires: ['voices.many'],
    gloss: 'Their voices stand above their recording\'s hiss up to a high pitch: they make sounds at least that high.',
    hints: [
      'Every sound has its own spread of pitches.',
      'Gather the spectrum of the voices and of their silences, and see where the one fades into the other.',
      'Read where the voices\' long spectrum falls into the hiss: the senders make sounds at least that high. The disc itself may cut off higher ones.',
    ],
  },
  {
    id: 'voices.octave', chapter: 'voices', key: 'octave', checkedRow: 16, requires: ['voices.hearing'],
    gloss: 'On steps: their notes come back at a doubled frequency, and that doubling is cut into equal steps.',
    hints: [
      'Their music repeats pitches.',
      'Track the pitch of a single voice or instrument and compare the notes it uses.',
      'Fold the notes at each ratio: they gather tightest at one, and between its repeats sit small equal steps. Measure the step.',
    ],
  },
  {
    id: 'voices.others', chapter: 'voices', key: 'others', checkedRow: 16, requires: ['voices.many'],
    gloss: 'No: some voices belong to other animals of their world, calling where nobody speaks.',
    hints: [
      'Not every voice sounds like the others.',
      'Compare the pitches and the length of the calls with the speakers before them.',
      'One stretch of calls slides and holds far longer than any speaker\'s words: another animal of their world.',
    ],
  },
];
