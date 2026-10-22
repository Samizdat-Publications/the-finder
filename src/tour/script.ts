// The guided tour's script (written by the lead; plain words for a parent and a child, scientific all the
// same). The order is the rails: every deduction appears once, after everything it requires. Facts in `human`
// are the well-known public record of the Voyager mission and the Golden Record; numbers the player sees on
// the instruments still come from data/ and src/science/ (rule 1), never from here.

import coverJson from '../../data/cover.json';
import { binaryToMetres, binaryToSeconds } from '../science/units';
import { REASONABLE } from '../chapters/voices/data';
import { BEAT_S } from '../ui/units';
import type { PartDef, Stop } from './types';

// Numbers that answer a deduction are computed from the cover's own data (rule 1), as the hints do in graph.ts.
const rotationS = binaryToSeconds(coverJson.record.rotationPeriod.binary);
const rotationKm = binaryToMetres(coverJson.record.rotationPeriod.binary) / 1000;
const lineMs = binaryToSeconds(coverJson.picture.lineTime.binary) * 1000;
const rpm = 60 / rotationS;
const rotationBeats = rotationS / BEAT_S;
const lineBeats = lineMs / 1000 / BEAT_S;
/** Five significant figures, as the instruments show beats. */
const sig5 = (x: number): string => String(Number(x.toPrecision(5)));
/** Three significant figures, with thousands separators. */
const sig3 = (x: number): string => Number(x.toPrecision(3)).toLocaleString('en-US', { maximumFractionDigits: 20 });

export const PARTS: readonly PartDef[] = [
  { id: 'prologue', title: 'Before we start' },
  { id: 'arrival', title: 'Something in the dark' },
  { id: 'key', title: 'The secret code' },
  { id: 'player', title: 'Playing the record' },
  { id: 'pictures', title: 'The pictures' },
  { id: 'voices', title: 'The voices' },
  { id: 'numbers', title: 'Their numbers' },
  { id: 'spot', title: 'The uranium clock' },
  { id: 'map', title: 'The pulsar map' },
  { id: 'trail', title: 'Where it came from' },
  { id: 'portrait', title: 'Our portrait of them' },
  { id: 'finale', title: 'Back to our time' },
];

export const STOPS: readonly Stop[] = [
  // ------------------------------------------------------------------ prologue
  {
    id: 'prologue.voyager', part: 'prologue', kind: 'story', chapter: 'hub', widget: 'cover',
    title: 'A message in a bottle',
    look:
      'In 1977 NASA launched two small spacecraft, **Voyager 1** and **Voyager 2**, to fly past Jupiter and Saturn. When the job was done they kept going. They have left the planets behind, and they will drift between the stars for millions of years.\n\n' +
      'Bolted to the side of each one is a **gold-plated copper record**: a message from Earth, for anyone who might one day find it.',
    human:
      'The record was put together in a few weeks by a small team led by the astronomer **Carl Sagan**, with Frank Drake, Ann Druyan, Jon Lomberg, Linda Salzman Sagan and Timothy Ferris. It holds greetings in 55 languages, the sounds of Earth, about 90 minutes of music, and more than a hundred pictures.',
  },
  {
    id: 'prologue.aliens', part: 'prologue', kind: 'story', chapter: 'hub',
    title: 'Tonight, we are the aliens',
    look:
      'In about 40,000 years, Voyager 1 will pass a couple of light-years from a small red star called **Gliese 445**. Our story is set then, about 44,000 years from now.\n\n' +
      'A scientist on a world circling that star spots a tiny, cold machine falling past. They have never heard of Earth. They have never seen a record. They do not speak any of our languages. All they have is the object.\n\n' +
      'We are going to be that scientist, and work out the whole message from scratch: what it is, how old it is, how to play it, what it shows, where it came from, and who sent it.',
    why:
      'Every answer in here is the real one. The pictures are decoded live from the actual 1977 recording of the record, and every age and distance is computed from real measurements of real stars.',
    ask: 'If you found a strange machine floating in space, what is the first thing you would want to know about it?',
  },
  {
    id: 'prologue.disc', part: 'prologue', kind: 'story', chapter: 'hub', widget: 'cover',
    title: 'Hold up your disc',
    look:
      'If you have your printed disc, hold it up now. The record itself is protected by a metal cover, and the drawings etched on that cover are the **instructions**: how to play the record, how to turn its sound into pictures, and where it came from.\n\n' +
      'The people who drew them had a hard problem. How do you write instructions for someone who shares no language with you? Their answer: use only things that are the same everywhere in the universe, like counting, atoms and stars.',
    ask: 'Before we start: look at the drawings. Which ones can you guess already?',
  },

  // ------------------------------------------------------------------ arrival
  {
    id: 'arrival.intro', part: 'arrival', kind: 'story', chapter: 'arrival',
    title: 'Something in the dark',
    look:
      'Our telescopes have caught a machine falling past our star, colder than ice. It is not from here.\n\n' +
      'A good scientist looks before touching. On the left is the machine, with the real stars of our sky behind it. Above it are four scanners: **Structure**, **Heat**, **Isotopes** and **Decay clock**. We will use them in that order.',
    why:
      'One more thing. The alien has its own units: it counts time in **beats** (a beat is a little under one of our seconds) and length in **reaches** (about one and a third metres). We have switched on the human translation, so our units appear in brackets.',
  },
  {
    id: 'arrival.purpose', part: 'arrival', kind: 'do', chapter: 'arrival', node: 'arrival.purpose',
    title: 'What is it for?',
    look:
      'The **Structure** scan lists the machine\'s parts: a great curved dish, long thin booms, three cylinders, and a disc fixed to the body.\n\n' +
      'You can tell a lot about a machine from its shape, even an alien one. Nobody builds a big curved dish by accident.',
    todo: 'Read the Structure scan, then answer **What is the great dish for?** by clicking the answer you think is right. Clicking an answer proposes it, and the scan tells you if it holds. Hint: what does a curved dish do with waves?',
    why:
      'A curved dish gathers waves from one direction, or sends them out in one direction, like a satellite dish on a house. And the long booms hold instruments away from the body, so they can measure things without the machine getting in the way.\n\n' +
      'So this machine was built to **talk across huge distances**, and to **sense** things.',
    human:
      'Voyager\'s dish is 3.7 metres across. Its radio transmitter runs on about 23 watts, roughly a fridge light bulb, and it still sends science home today from more than 24 billion kilometres away. The signal that reaches Earth is unbelievably faint, and NASA catches it with dishes 70 metres wide.',
    ask: 'Why would a machine that is going somewhere no one can follow still need a radio?',
  },
  {
    id: 'arrival.heat', part: 'arrival', kind: 'do', chapter: 'arrival', node: 'arrival.heat',
    title: 'Why is it warm?',
    look:
      'Out here, between the stars, a dead machine should be as cold as space itself. The **Heat** scan shows something strange: three cylinders on one boom are still faintly warm.\n\n' +
      'Something inside them is still making heat. But what could keep going that long?',
    todo: 'Click the **Heat** tab, see which parts glow, then click what you think keeps the cylinders warm.',
    why:
      'Sunlight is far too weak out here, and leftover heat would have leaked away long ago. A chemical fire burns out. But **radioactive atoms** give off heat as they break down, slowly and steadily, for a very long time.\n\n' +
      'The three warm cylinders are a nuclear battery.',
    human:
      'They are Voyager\'s three RTGs (radioisotope thermoelectric generators). They were filled with plutonium-238, and the heat of its decay was turned into electricity: about 470 watts at launch in 1977. They make a little less every year. NASA has been switching instruments off one by one to save power.',
  },
  {
    id: 'arrival.madeNotMined', part: 'arrival', kind: 'do', chapter: 'arrival', node: 'arrival.madeNotMined',
    title: 'Made, or dug up?',
    look:
      'The **Isotopes** scan weighs the atoms inside the warm cylinders. Atoms of one element can come in different weights, called **isotopes**: uranium-238 is a little heavier than uranium-234.\n\n' +
      'Uranium dug out of rock is almost all uranium-238. Look at what is in these cylinders.',
    todo: 'Click the **Isotopes** tab and compare the uranium-234 peak with the uranium-238 peak. Then click: was this fuel mined, or made?',
    why:
      'Natural uranium has about eighteen thousand atoms of uranium-238 for every atom of uranium-234. Here it is the other way round: lots of uranium-234 and almost no uranium-238.\n\n' +
      'Nobody dug this out of the ground. It was **made**, from a heavier element that does not exist in nature. Whoever built this machine could make new elements in a reactor.',
    human:
      'Plutonium-238 is made in nuclear reactors. Every plutonium-238 atom eventually turns into a uranium-234 atom. Half of it is gone after 88 years, so by the time the alien finds Voyager, the plutonium has all become uranium.',
  },
  {
    id: 'arrival.fuelAge', part: 'arrival', kind: 'do', chapter: 'arrival', node: 'arrival.fuelAge',
    title: 'How old is it?',
    look:
      'Radioactive decay is a **clock**. Uranium-234 slowly turns into thorium-230 at a rate nature fixes, so the more thorium has built up, the longer the fuel has been sitting there.\n\n' +
      'The **Decay clock** compares the thorium we measured with what each possible story predicts, and gives the age each one implies.',
    todo: 'Click the **Decay clock** tab. Pick the chain of decays that would have made this uranium-234 (think: what decays into it?), see where its curve meets our measurement, then press **Date the heat source with this chain**.',
    why:
      'The fuel was made, then decayed from plutonium to uranium to thorium. The thorium says the heat source is **tens of thousands of years old**: the clock shows the age, about 44,000 years, with its error bar. That is our first clock, and our first big answer: this machine has been falling through space for a very, very long time.',
    human:
      '44,000 years ago on Earth it was the Ice Age. People were hunting mammoths and painting some of the very first cave paintings. In our story that is how far in the future the alien finds Voyager.',
    ask: 'Radioactive clocks are how scientists date old rocks and bones on Earth too. What else could you date this way?',
  },

  // ------------------------------------------------------------------ the key
  {
    id: 'key.intro', part: 'key', kind: 'story', chapter: 'key',
    title: 'The secret code',
    look:
      'Now we pick up the disc itself. On the left is its cover, under our lamp. The drawings are etched very shallow, so they are hard to see straight on.\n\n' +
      'Lower the lamp with the dial under the plate (or its **-** button) until the light skims across the surface, like low sunlight across footprints in snow. The marks pop out.',
    ask: 'Find the same drawings on your printed disc. Which ones look like writing?',
  },
  {
    id: 'key.binary', part: 'key', kind: 'do', chapter: 'key', node: 'key.binary',
    title: 'Two kinds of mark',
    look:
      'All over the cover there are little strings of short strokes. Look closely and there are only **two kinds**: a stroke **across** the line of the string, and a dash **along** it.\n\n' +
      'The table counts every string and every stroke on the plate. Move your mouse over the plate to see the strings.',
    todo: 'Click the answer you think explains the two kinds of stroke, then press **Propose**. (You can also click strokes on the plate to look at them close up.)',
    why:
      'Two symbols, used again and again in strings of different lengths: that is how you write **numbers with only two digits**. A stroke across is 1, a dash along is 0, and each place in the string is worth twice the one after it.\n\n' +
      'This is **binary**, the same counting computers use.',
    human:
      'The designers used binary because anyone clever enough to catch a spacecraft can count, and two kinds of mark is the simplest possible way to write a number. You do not need to know anyone\'s alphabet.',
    ask: 'Can you count to five in binary? (1, 10, 11, 100, 101.) What is 1000?',
  },
  {
    id: 'key.unit', part: 'key', kind: 'do', chapter: 'key', node: 'key.unit',
    title: 'A ruler made of hydrogen',
    look:
      'Now we can read the numbers, but a number needs a **unit**. Is "5" five seconds? Five steps? Five miles?\n\n' +
      'Bottom right of the cover is a tiny drawing: two circles joined by a line, with a **1** written beside it. It is **hydrogen**, the simplest and most common atom in the universe, drawn in two states. Every scientist in the galaxy knows hydrogen.',
    todo: 'In the **atlas of hydrogen**, click each row in turn: each one shows what the cover\'s star-map numbers would mean with that unit, and how many of them then match real pulsars. When one row makes the numbers fit, choose that transition below and press **Propose**.',
    why:
      'A hydrogen atom can flip from one state to the other, and when it does it gives off a radio wave that ticks at exactly the same rate everywhere in the universe. The cover says: **our unit is one tick of hydrogen**.\n\n' +
      'It is a ruler that every civilisation already owns.',
    human:
      'This hydrogen signal is the famous "21 centimetre line" that radio astronomers use to map the gas in our galaxy. The same drawing was first used in 1972 on the Pioneer plaques, the metal greeting cards carried by Pioneer 10 and 11.',
  },
  {
    id: 'key.timesNotLengths', part: 'key', kind: 'do', chapter: 'key', node: 'key.timesNotLengths',
    title: 'Times, or lengths?',
    look:
      'Hydrogen\'s tick can be read two ways: as a **time** (how long one tick lasts) or as a **length** (how long one wave is). Which does the cover mean?\n\n' +
      'Try the big number written around the record drawing both ways and see which one makes sense.',
    todo: 'Look at the table: each cover number worked out as a time and as a length. Choose **Times** or **Lengths**, then press **Propose**.',
    why: `Read as a length, the number around the record would make it about ${sig3(rotationKm)} km around, which is silly. Read as a time it is about ${sig3(rotationS)} seconds: a sensible time for **one turn of a record**.\n\nSo the cover's numbers are **times**, measured in ticks of hydrogen. That is the key to everything else on the cover.`,
    ask: 'If you had to tell an alien how long a second is, without using any words, how would you do it?',
  },

  // ------------------------------------------------------------------ the player
  {
    id: 'player.intro', part: 'player', kind: 'story', chapter: 'player',
    title: 'Playing the record',
    look:
      'Top left of the cover is a drawing of the disc with a needle resting on it, and a long number written around it. Below it, the disc drawn edge-on with another number.\n\n' +
      'We have built a record player to the cover\'s drawing: the platter in the middle, and a microscope view of the groove on the right. To play the disc we need three things: **how fast** it turns, **where** the needle goes down, and **which way** it turns. Then we listen.',
  },
  {
    id: 'player.speed', part: 'player', kind: 'do', chapter: 'player', node: 'player.speed',
    title: 'How fast?',
    look:
      'The number around the record drawing is the time of **one turn**, in ticks of hydrogen. Our key has already turned it into beats: it is written under the cover on the left ("one turn takes ...").',
    todo: `Set **Time for one turn** to the cover's number, ${sig5(rotationBeats)} beats: type it in the **Beats per turn** box (or drag the slider), then press **This is the time of one turn**.`,
    why: `One turn every ${sig3(rotationS)} seconds is ${sig3(rpm)} turns a minute. That is slow for a record: half the speed of a long-playing album. Slower means more fits on the disc.`,
    human:
      'Each side of the Golden Record plays for about an hour. The cover tells the finder how long, too: that is the number beside the edge-on drawing.',
  },
  {
    id: 'player.direction', part: 'player', kind: 'do', chapter: 'player', node: 'player.direction',
    title: 'Which way does it turn?',
    look:
      'Look at the groove under the microscope. As the platter turns one way, the spiral carries the needle **inward**. Turned the other way it would carry it outward, and play everything backwards.',
    todo: 'Click the direction that carries the needle inward, then press **This is the way it turns**.',
    why: 'Turned this way, the spiral walks the needle in from the rim, and the side plays forwards.',
  },
  {
    id: 'player.start', part: 'player', kind: 'do', chapter: 'player', node: 'player.start',
    title: 'Where does the needle go?',
    look:
      'The groove is one long spiral. Which end is the beginning? The cover drawing shows the needle resting at the **outer rim** of the disc.',
    todo: 'Click on the platter near its outer edge until the label above **Drop the needle** says **the outermost groove**. Then press **Drop the needle**: where you drop it is your answer.',
    why: 'The sound starts at the outside and the needle travels inward, toward the centre, as the disc turns.',
    human: 'That is how every vinyl record of the time worked, too.',
  },
  {
    id: 'player.firstSound', part: 'player', kind: 'do', chapter: 'player', node: 'player.firstSound',
    title: 'Listen',
    look: 'The disc is turning at the right speed, the right way, and the needle is in the groove. Turn your sound up and listen.',
    todo: 'The needle is down. Just listen: after a few seconds of quiet lead-in, the first real sound arrives (it can take up to 20 seconds).',
    why:
      'It is not music and it is not a voice. It is a **buzz**, one short shape repeating over and over, hundreds of times a second.\n\n' +
      'That repeating shape is a **picture, sent as sound**, one line at a time, like an old fax machine. Each repeat of the buzz is one line of a picture.',
    human:
      'In 1977 there was no way to put digital image files on a spacecraft record, so the team recorded the pictures as an analogue video signal, as sound in the groove. On this disc the pictures come first.',
    ask: 'What do you think the first picture will be?',
  },

  // ------------------------------------------------------------------ the pictures
  {
    id: 'pictures.intro', part: 'pictures', kind: 'story', chapter: 'pictures',
    title: 'The pictures',
    look:
      'The top right of the cover explains how to turn the buzz into pictures. A little wave: the signal. A zig-zag: the picture is drawn line by line, each line top to bottom, and the lines go left to right. A rectangle with a circle in it: **the first picture should be a circle**.\n\n' +
      'That circle is a test. If our circle comes out perfectly round, our settings are right. On the left is our decoder: it draws the sound as a picture, one line at a time. Right now its settings are wrong, so it is just a mess.',
    ask: 'Why do you think they chose a circle for the test picture, and not a square?',
  },
  {
    id: 'pictures.lineTime', part: 'pictures', kind: 'do', chapter: 'pictures', node: 'pictures.lineTime',
    title: 'How long is one line?',
    look: 'The cover gives the time of one picture line, in ticks of hydrogen, as a number beside the little wave. Our key reads it for us.',
    todo: `Type the cover's line time, ${sig5(lineBeats)} beats, into the **Line time** box and press Enter. Watch the picture straighten up, then press **Propose this line time**.`,
    why: `One line lasts about ${sig3(lineMs)} thousandths of a second. With the right line time, the slanted mess starts to stand up straight.`,
  },
  {
    id: 'pictures.sync', part: 'pictures', kind: 'do', chapter: 'pictures', node: 'pictures.sync',
    title: 'Where does each line begin?',
    look:
      'The trace under the picture shows the signal. Every line starts with a sharp dip: a **sync pulse**, a "start here" mark. If we just trust the clock, tiny wobbles in speed add up and the picture leans.',
    todo: 'Under **Line start**, click **Lock to each pulse**, then press **Propose this line start**.',
    why: 'Now every line starts at its own pulse, so small timing errors can never add up.',
    human: 'Old televisions did exactly this: every line of the picture began with a sync pulse.',
  },
  {
    id: 'pictures.interlace', part: 'pictures', kind: 'do', chapter: 'pictures', node: 'pictures.interlace',
    title: 'Why are the edges jagged?',
    look:
      'Look at the straight edges in the picture: they are jagged, like teeth. Neighbouring lines are slightly offset. The cover\'s zig-zag drawing shows the lines are **staggered**.',
    todo: 'Under **Stagger between lines**, click **Undo the stagger**, then press **Propose this stagger**.',
    why: 'The picture was drawn in two passes, every other line, then the lines in between. Line them back up and the edges straighten.',
    human: 'This trick is called interlacing. Televisions used it for decades.',
  },
  {
    id: 'pictures.polarity', part: 'pictures', kind: 'do', chapter: 'pictures', node: 'pictures.polarity',
    title: 'Light or dark?',
    look: 'Does the picture look like a photo negative? We do not know yet whether a strong signal means light or dark.',
    todo: 'Under **More signal reads**, try **Lighter** and then **Darker**. Keep the one that reads more signal as darker, then press **Propose this reading**.',
    why: 'More signal means darker: the picture is stored like a photographic negative.',
  },
  {
    id: 'pictures.aspect', part: 'pictures', kind: 'do', chapter: 'pictures', node: 'pictures.aspect',
    title: 'Make the circle round',
    look: 'The circle is there now, but squashed. How many rows tall is each line? That sets the shape of the picture.',
    todo: 'Use the buttons under **Rows per picture** (**«** jumps by ten, **‹** by one) to bring the number down until the circle is perfectly round, not an oval. Then press **Propose these rows**.',
    why: 'When the circle is round, the picture has its true shape. Every other picture on the disc will now come out with the right proportions.',
  },
  {
    id: 'pictures.circle', part: 'pictures', kind: 'do', chapter: 'pictures', node: 'pictures.circle',
    title: 'The circle comes out true',
    look: 'Line time, sync, stagger, brightness and shape are all set. Is the test circle round?',
    todo: 'If the circle looks round, press **Propose: the circle is true**: the decoder checks all five settings together.',
    why:
      'A perfect circle, decoded from sound. The senders\' instructions worked.\n\n' +
      'And think about what this means: they sent us **pictures**. The senders **see**. They have eyes, or something like them, and they guessed that we would too.',
    human:
      'This is the real calibration circle from the Golden Record, decoded right now in your browser from the 1977 recording. Nobody cleaned it up. The tiny specks are real.',
  },
  {
    id: 'pictures.firstFrames', part: 'pictures', kind: 'do', chapter: 'pictures', node: 'pictures.firstFrames',
    title: 'The next pictures',
    look: 'If the settings are right, they should work for every picture on the disc, not just the circle.',
    todo: 'Press **Play on** and watch the next pictures develop at the record\'s own speed. When it says **Watched: 3 of 3 needed**, press **Propose: the settings read them**.',
    why: 'Same settings, new pictures. Each one appears line by line, exactly as the record plays it.',
    human: 'The pictures right after the circle repeat the star map from the cover, and then start to teach: how the senders count, and what their units are.',
  },
  {
    id: 'pictures.album', part: 'pictures', kind: 'watch', chapter: 'pictures', node: 'pictures.album',
    title: 'The whole album',
    look: 'Let\'s decode the whole picture section of the disc with the same settings, and lay every picture out in an album.',
    todo: 'Press **Show me**. The decoder develops every picture on this side of the disc (this takes a minute or two).',
    why: 'Well over a hundred pictures, from one side of one record. Some look like diagrams, some like photographs.',
    human: 'The team chose more than a hundred pictures to show what Earth and its people are like: our planet, our bodies, our food, our homes, our cities, our science.',
    ask: 'If you could add one picture to the record, what would it be?',
  },
  {
    id: 'pictures.colour', part: 'pictures', kind: 'do', chapter: 'pictures', node: 'pictures.colour',
    title: 'Why do some come three times?',
    look: 'Some pictures appear three times in a row: the same scene, but each a slightly different grey.',
    todo: 'Open the **Mixer** tab, then click a picture in the album that comes three times in a row (the Earth is one). The mixer stacks it with the two after it as red, green and blue. When it blooms into colour, press **Propose: these three are one picture**.',
    why: 'Three pictures, each taken through a different coloured filter, make **one colour picture** when you stack them. The senders see in colour.',
    human: 'Your phone screen works the same way: every colour you see on it is made by mixing tiny red, green and blue lights.',
  },
  {
    id: 'pictures.down', part: 'pictures', kind: 'do', chapter: 'pictures', node: 'pictures.down',
    title: 'Which way is up?',
    look: 'Some pictures came out lying on their side. How can an alien know which way is up?',
    todo: 'Open the **Turn** tab, click the sideways drawing of a man and a woman in the album, press **Turn clockwise** until they stand up, then press **Propose: this way is up**.',
    why: 'Water always lies flat and people stand on their feet. That is enough to find "down" on a world you have never seen.',
  },

  // ------------------------------------------------------------------ the voices
  {
    id: 'voices.intro', part: 'voices', kind: 'story', chapter: 'voices',
    title: 'The voices',
    look:
      'After the pictures, the record keeps going: real sound this time. The display shows sound as a picture: time runs left to right, low notes at the bottom, high notes at the top.\n\n' +
      'The alien cannot understand a single word. But there is still a lot to learn just from the shape of the sound.',
  },
  {
    id: 'voices.many', part: 'voices', kind: 'do', chapter: 'voices', node: 'voices.many',
    title: 'One voice, or many?',
    look: 'Listen to the greetings. Each speaker talks, then stops. If we count the silences between voices, we can count the speakers.',
    todo: `1. Drag **Quiet below** to anywhere from ${REASONABLE.thresholdDb[0]} to ${REASONABLE.thresholdDb[1]}: the line then sits just above the hiss between speakers. 2. Set **Pause at least** to between ${REASONABLE.gapS[0]} and ${REASONABLE.gapS[1]} seconds (the number in brackets), so each break between speakers counts. 3. The dots below are the speakers' pitches, and the ruler box is one speaker's range: press **+** under **Voices' worth of pitch** once for each box-width the dots spread over (two or more). Then press **Propose**.`,
    why: 'Many voices: dozens of speakers, one after another, high and low. This is not one creature talking. It is a crowd.',
    human:
      'The record greets the universe in **55 languages**, from ancient Akkadian, spoken in Mesopotamia 4,000 years ago, to Chinese dialects spoken today. In English, Carl Sagan\'s six-year-old son Nick says "Hello from the children of planet Earth."',
    ask: 'If you could say one sentence to an alien, what would you say?',
  },
  {
    id: 'voices.hearing', part: 'voices', kind: 'do', chapter: 'voices', node: 'voices.hearing',
    title: 'How high do their sounds go?',
    look: 'Their voices and music fill a band of pitches, from low to high. Above some pitch, there is only the hiss of the recording. Where does their sound stop?',
    todo: 'On the chart, click where the voices\' curve sinks down into the hiss on the right. Then press **Propose**.',
    why: 'Their voices and music stand above the hiss of the recording up to about this pitch. The senders make sounds at least this high, and chose to record them. (Whether they can hear all of it, the record alone cannot say.)',
    human: 'Young humans hear up to about 20,000 vibrations a second. Most adults hear a bit less. Bats and dolphins hear far higher.',
  },
  {
    id: 'voices.others', part: 'voices', kind: 'do', chapter: 'voices', node: 'voices.others',
    title: 'Are all the voices theirs?',
    look: 'Near the end of one track there are long, sliding calls, very different from the greetings. Look at their shape in the sound picture.',
    todo: 'Click **voices 3** in the track list. Near the end of its sound picture are long, high, sliding calls. Drag across them to mark them, then press **Propose**. (Press play to hear them.)',
    why: 'These calls do not belong to the senders. **Other animals** on their world sing too, and the senders thought they deserved a place on the record.',
    human: 'They are **humpback whales**. The record mixes greetings from United Nations delegates with whale song, a greeting from another kind of Earthling.',
  },
  {
    id: 'voices.octave', part: 'voices', kind: 'watch', chapter: 'voices', node: 'voices.octave',
    title: 'How is their music built?',
    look:
      'In music, two notes where one vibrates exactly twice as fast as the other sound "the same", only higher. That doubling is called an **octave**. Does the senders\' music use it? And how do they divide it up?',
    todo: 'Press **Show me**: we click the peak where the pattern of notes comes back, then set the comb to the number of equal steps that fits best.',
    why: 'Their notes repeat at a doubling of pitch, and the doubling is cut into **12 equal steps**. The senders build music the way we do.',
    human: 'Those 12 steps are the keys of a piano, white and black, from one C to the next. Almost every musical culture on Earth treats the octave as special.',
    ask: 'Can you sing a note, and then the same note an octave higher?',
  },

  // ------------------------------------------------------------------ their numbers
  {
    id: 'numbers.intro', part: 'numbers', kind: 'story', chapter: 'pictures',
    title: 'Their numbers',
    look:
      'Back to the pictures. Some of them are not photos at all: they are **lessons**. Dots next to symbols, drawings of atoms, tables of planets. The senders are teaching us to read their numbers.',
  },
  {
    id: 'pictures.numerals', part: 'numbers', kind: 'do', chapter: 'pictures', node: 'pictures.numerals',
    title: 'Counting with dots',
    look: 'One picture puts groups of dots next to symbols: one dot, two dots, three dots. Each symbol must be a number.',
    todo: 'Open the **Counting** tab. For each of their symbols, click the number of dots it stands for. When the sums underneath all say **holds**, press **Propose this table**.',
    why: 'These are their **numerals**, the digits they count with. And look how they write bigger numbers: a place for each power of ten. They count in tens.',
    human: 'We count in tens almost certainly because we have ten fingers.',
    ask: 'An alien with eight fingers might count in eights. How would it write the number we call ten?',
  },
  {
    id: 'pictures.units', part: 'numbers', kind: 'do', chapter: 'pictures', node: 'pictures.units',
    title: 'Their units',
    look: 'Another lesson shows the hydrogen atom again, and builds units from it: a time, a length, a mass.',
    todo: 'Open the **Units** tab. Copy the numbers from their lesson into the converter (the whole number, the fraction and the power of ten) and see how many of our beats their unit of time is. Then press **Propose: their s is this many beats**.',
    why: 'The senders\' second, their metre and their kilogram, all defined from hydrogen. Now every number on every picture can be turned into our own units.',
  },
  {
    id: 'pictures.height', part: 'numbers', kind: 'do', chapter: 'pictures', node: 'pictures.height',
    title: 'How tall are they?',
    look: 'One picture shows two of the senders, with numbers written beside them. Now that we know their units, we can read those numbers.',
    todo: 'Open the **Figures** tab and type the taller figure\'s number (in their units) into the converter. Then press **Propose: the taller one is this tall**.',
    why: 'Now we know how big the senders are, a little taller than one of our reaches.',
  },
  {
    id: 'pictures.home', part: 'numbers', kind: 'do', chapter: 'pictures', node: 'pictures.home',
    title: 'Which world is home?',
    look: 'A table lists the worlds around their star: their sizes, masses and distances. In one column, every number is exactly 1.',
    todo: 'Open the **Circles** tab. Find the world whose column is all ones, click its circle, then press **Propose: this world is theirs**.',
    why: 'If you measure everything compared to your own home, your home comes out as exactly 1. That world is **where they live**: the third world from their star.',
    human: 'Astronomers still do this: distances in the solar system are often measured in "astronomical units", where Earth\'s distance from the Sun is 1.',
  },
  {
    id: 'pictures.slip', part: 'numbers', kind: 'watch', chapter: 'pictures', node: 'pictures.slip',
    title: 'A mistake in the table',
    look: 'Every column of the planets table follows the table\'s own rules, except one number, for the outermost world.',
    todo: 'Press **Show me**: we check every number in the table against the table\'s own pattern and mark the one that breaks it.',
    why: 'The outermost world\'s distance breaks the table\'s own pattern. It is a slip in **their** table, not in our decoding. Even careful senders make mistakes.',
    human: 'That outermost world is Pluto. Our decoding found a real slip in the Golden Record\'s planets table.',
  },

  // ------------------------------------------------------------------ the uranium spot
  {
    id: 'spot.intro', part: 'spot', kind: 'story', chapter: 'spot',
    title: 'The uranium clock',
    look:
      'We have one clock already, from the fuel. Can we check it with another? Something on the cover cannot be seen with eyes at all. We need a detector that counts radioactive particles.',
  },
  {
    id: 'spot.find', part: 'spot', kind: 'do', chapter: 'spot', node: 'spot.find',
    title: 'Find the hidden spot',
    look: 'Our detector counts the particles that fly off radioactive atoms. Sweep it across the cover and watch the count.',
    todo: 'Move the detector slowly over the cover and watch the count rate. Somewhere, clear of the drawings, it jumps. Click there to mark it, then press **Something is here**.',
    why: 'A small patch of **uranium**, invisible to the eye, that no drawing mentions. Something placed there on purpose.',
    human: 'NASA electroplated a tiny patch of ultra-pure uranium-238, about 2 centimetres across, onto the cover, exactly so that a finder could use it as a clock.',
  },
  {
    id: 'spot.age', part: 'spot', kind: 'do', chapter: 'spot', node: 'spot.age',
    title: 'Read the clock',
    look:
      'Uranium-238 slowly decays, and on its way it makes uranium-234. If the spot started as pure uranium-238, the uranium-234 has been building up ever since. Count the particles from each kind of uranium: their ratio is a clock.',
    todo: 'Press **+10⁵** to count for a long while (about a day of counting). Then slide the **age marker** until its dot sits on the measured line, and press **The spot is this old**.',
    why: 'The spot gives an age too, and it **agrees with the fuel clock**. Two completely different clocks, the same answer.',
    human: 'Uranium-238 has a half-life of 4.5 billion years, about the age of the Earth. That is why it makes such a good long-lasting clock.',
  },
  {
    id: 'spot.purity', part: 'spot', kind: 'do', chapter: 'spot', node: 'spot.purity',
    title: 'Was it pure?',
    look: 'The clock only works if the spot started as pure uranium-238. Natural uranium would already contain uranium-234 and give a wrong age. A second kind of atom, thorium-230, lets us check.',
    todo: 'Turn the **start** dial. 1 means it started like natural uranium; 0 means pure uranium-238. Find the start where both clocks agree (the meter says they fit), then press **It began like this**.',
    why: 'Only a pure start fits both clocks. Natural uranium does not. The senders purified it on purpose: it was **made to be a clock**.',
  },

  // ------------------------------------------------------------------ the pulsar map
  {
    id: 'map.intro', part: 'map', kind: 'story', chapter: 'map',
    title: 'The pulsar map',
    look:
      'Bottom left of the cover is a starburst: 14 lines spreading from one point, each with a long binary number along it, and one long line with no number.\n\n' +
      'Our key says the numbers are **times**. What in space keeps time? **Pulsars**: dead stars that spin, flashing like lighthouses, so regular you could set a clock by them.',
    human:
      'Pulsars were discovered in 1967 by Jocelyn Bell Burnell, a student who noticed a strange regular blip in her radio telescope data. The pulsar map was invented by Frank Drake and Carl Sagan for the Pioneer plaques.',
  },
  {
    id: 'map.periods', part: 'map', kind: 'do', chapter: 'map', node: 'map.periods',
    title: 'Lines and lighthouses',
    look: 'The long line without a number points to the centre of the galaxy. Each other line points to a pulsar, and its number is how fast that pulsar spins.',
    todo: '1. Turn the dial until **long line to the centre** reads 0. 2. Click a line number on the cover map (the gold starburst in the middle). 3. On the galaxy chart on the left, click the pulsar that lies along that line and ticks at nearly its rate. The line panel shows the match odds: pick a line where **one pulsar clearly wins**, and if it says the pulsar is too young to judge yet, try another line. 4. Press **Propose: this line is this pulsar**.',
    why: 'The numbers are **spin periods of pulsars**. The map is a set of cosmic lighthouses, each with its own unmistakable flash rate.',
  },
  {
    id: 'map.old', part: 'map', kind: 'do', chapter: 'map', node: 'map.old',
    title: 'An old map',
    look: 'Pulsars slowly slow down as they age, a tiny bit every year. Compare each matched pulsar\'s spin today with the number on the map.',
    todo: 'Drag the **spin-down clock** slider back in time until a pulsar\'s curve crosses the gold "map\'s number" line and lights up. Then press **Propose: the map is from this time**.',
    why: 'Nearly every pulsar spins **slower now** than the map says. The map was made a long time ago: another clock.',
  },
  {
    id: 'map.identify', part: 'map', kind: 'watch', chapter: 'map', node: 'map.identify',
    title: 'All fourteen lines',
    look: 'Now match every line to its pulsar. The old, steady pulsars are easy. The young ones have slowed so much we can only find them by direction.',
    todo: 'Press **Show me**: we match the remaining lines to their pulsars, old ones first.',
    why: 'Every line has its pulsar. We can now read the whole map.',
  },
  {
    id: 'map.motion', part: 'map', kind: 'watch', chapter: 'map', node: 'map.motion',
    title: 'Why the ages disagree',
    look: 'Each pulsar gives an age for the map, and they disagree in a pattern: one side of the sky reads too old, the other too young. Something is shifting every tick rate.',
    todo: 'Press **Show me**: we drag the axis of motion until the ages line up inside their error bars.',
    why: 'Our own motion squeezes or stretches every tick, like the pitch of a passing siren. The pattern measures **how fast we move** compared with the map\'s makers.',
    human: 'That pitch change is the Doppler effect: an ambulance siren sounds higher coming toward you and lower going away.',
  },
  {
    id: 'map.region', part: 'map', kind: 'watch', chapter: 'map', node: 'map.region',
    title: 'Where was it drawn?',
    look: 'All the lines start at one point: the place the map was drawn from. Slide the map\'s centre around the galaxy until its lines point best at their pulsars.',
    todo: 'Press **Show me**: we slide the map\'s starting point around until its lines point best at their pulsars.',
    why: 'The map was drawn from a small patch of the galaxy, and **our own star is inside it**. The senders lived close by.',
  },

  // ------------------------------------------------------------------ the trail
  {
    id: 'trail.intro', part: 'trail', kind: 'story', chapter: 'trail',
    title: 'Where it came from',
    look: 'Here is our neighbourhood of stars. The machine is still moving. A thrown object flies straight away from where it was thrown. So which star is behind it?',
  },
  {
    id: 'trail.origin', part: 'trail', kind: 'do', chapter: 'trail', node: 'trail.origin',
    title: 'Which star did it come from?',
    look: 'For each star, compare the direction the machine is moving away from it with the direction from that star to the machine. Only one star lines up.',
    todo: 'On the **Trail** tab, click stars on the chart and read their numbers. Find the one the machine flies straight away from (inside its 95% cut): the **warm-white star**. Then press **Propose: it came from this star**.',
    why: 'The machine came from the **warm-white star**. It is the only star it flies straight away from.',
    human: 'The warm-white star is our Sun.',
  },
  {
    id: 'trail.age', part: 'trail', kind: 'do', chapter: 'trail', node: 'trail.age',
    title: 'How long has it travelled?',
    look: 'We know how far the machine is from that star, and how fast it is moving away. Distance divided by speed gives the travel time.',
    todo: 'Open **Run back** and drag the slider until the machine and the warm-white star meet (the separation is smallest). Then press **Propose: they met this long ago**.',
    why: 'A **third clock**, and it agrees with the other two. Fuel, uranium spot and trail all say the same thing.',
  },
  {
    id: 'trail.neighbour', part: 'trail', kind: 'do', chapter: 'trail', node: 'trail.neighbour',
    title: 'How far away is it?',
    look: 'Measure the distance from our own star to the warm-white star.',
    todo: 'Open the **Ruler**. Click our own star, then the warm-white star, then press **Propose this distance**.',
    why: 'The warm-white star is our **nearest neighbour**, and one of the brightest stars in our sky. The senders live next door.',
    human: 'In our story the Sun really is Gliese 445\'s nearest star at that time, a twist the real star motions produce.',
  },
  {
    id: 'trail.where', part: 'trail', kind: 'watch', chapter: 'trail', node: 'trail.where',
    title: 'Does the map point home?',
    look: 'The pulsar map gave us a region. The trail gave us a star. Do they agree?',
    todo: 'Press **Show me**: we pick the warm-white star inside the map\'s region.',
    why: 'Yes: the warm-white star is inside the region the map was drawn from. **The map points home.**',
  },
  {
    id: 'trail.when', part: 'trail', kind: 'watch', chapter: 'trail', node: 'trail.when',
    title: 'When was the map made?',
    look: 'Seen from the warm-white star instead of from our moving star, do the pulsar ages finally agree?',
    todo: 'Press **Show me**: we re-read every pulsar\'s age as the warm-white star would see it, and mark where they bunch together.',
    why: 'They agree. The map was made **as long ago as the machine has been travelling**. Four clocks, one answer.',
  },

  // ------------------------------------------------------------------ portrait
  {
    id: 'portrait.plate', part: 'portrait', kind: 'story', chapter: 'portrait',
    title: 'Everything we know about them',
    look:
      `This plate is the Finder's portrait of the senders, and every line on it is something **we worked out ourselves**: their star, how they look, their world, their numbers, their voices and their machine. Nothing new is added here. Each little tick opens the page that shows how that step was checked.\n\n` +
      `Take a moment to read it together. A few hours ago we had a cold machine and a gold disc. Now we know who made them.`,
    ask: 'Which thing on the plate surprised you most?',
  },
  {
    id: 'portrait.together', part: 'portrait', kind: 'do', chapter: 'portrait', node: 'portrait.together',
    title: 'Do the clocks agree?',
    look: `Four separate clocks dated this machine: the **fuel** (plutonium turning into other atoms), the **uranium spot** on the cover, the **pulsar map** read from the warm-white star, and the **journey** (distance divided by speed). Each bar shows one clock's answer and how sure it is. Notice how short the pulsar map's bar is: many spinning stars together keep much sharper time than counting atoms, so that clock counts most. The **bright band** is lit on that short bar: every time inside it fits all four clocks together.`,
    todo: `Drag the **round marker** under the clock bars (or click it and use the arrow keys) into the **bright band** on the short pulsar-map bar, then press **Propose: it left this long ago**.`,
    why: `Four completely different kinds of physics, nuclear decay, spinning dead stars and the machine's own motion, give **one answer**: it left about 44,000 years ago. When clocks that share almost nothing agree, scientists trust the answer.`,
    human: `Real scientists do exactly this. The age of the Earth: meteorites give 4.5 billion years, and the oldest crystals and Moon rocks agree. Different clocks, one story.`,
    ask: 'If one clock had disagreed with the other three, what might that have told us?',
  },
  {
    id: 'portrait.sky', part: 'portrait', kind: 'story', chapter: 'portrait',
    title: 'They live there',
    look:
      `Across the top of the plate is the Finder's own night sky. The ringed star is the **warm-white star**: the senders' star, our nearest neighbour and one of the brightest stars in our sky.\n\n` +
      `Somewhere around it is a small third world full of voices, music and whales. They sent us a record of themselves, and they wanted to be found.`,
    human: `The warm-white star is our Sun, and the third world is Earth. Their name for themselves, which the Finder will never know, is "humans".`,
    ask: 'If you were the Finder, would you answer them? What would you send back?',
  },

  // ------------------------------------------------------------------ finale (Our Frame)
  {
    id: 'finale.turn', part: 'finale', kind: 'story', chapter: 'epilogue', section: 'turn',
    title: 'Now, our side of the story',
    look:
      `We have been the Finder, a scientist about 44,000 years from now. Now step back into **our own time**, today, while the machine is still flying and the Finder's star is still far ahead of it.\n\n` +
      `From here on everything is in our own units: kilometres, hours and years. Listen: the record is playing, the last piece of music on it.`,
  },
  {
    id: 'finale.now', part: 'finale', kind: 'story', chapter: 'epilogue', section: 'now',
    title: 'Where it is right now',
    look:
      `Back to the real world. Voyager 1 is still out there, still sending faint signals home, the most distant thing humans have ever made. NASA's own tables of its path say exactly where it is tonight. Watch the numbers: it moves about 17 kilometres further from the Sun every second.`,
    why: 'Look up. It is out there, past the planets, carrying the record we just decoded.',
    ask: 'A radio message takes about a day to reach it. What would you say in a message that slow?',
  },
  {
    id: 'finale.listening', part: 'finale', kind: 'story', chapter: 'epilogue', section: 'listening',
    title: 'Still listening',
    look: `Voyager 1 still runs **two** of its ten instruments, and Voyager 2 runs **three**. Every year their power supply gives about 4 watts less, partly because the plutonium decays and partly because the generators' thermocouples (the parts that turn its heat into electricity) wear out, so NASA switches instruments off one by one to keep the rest alive.`,
    human: `The decay part is the same decay we used as a clock in Arrival. By the Finder's time the plutonium-238 has all decayed away. Today it is still warm, and it is the power supply keeping both Voyagers alive.`,
    ask: 'If you could keep only one instrument running, which would you choose, and why?',
  },
  {
    id: 'finale.future', part: 'finale', kind: 'story', chapter: 'epilogue', section: 'future',
    title: 'The slow future',
    look: `The Finder's star is real. It is called **Gliese 445**, a small red star. Voyager 1 really will pass it, about 44,000 years from now, at nearly two light-years. That is where this story was set.`,
    human: `Even then it will not come close: nearly two light-years is about 120,000 times as far as the Earth is from the Sun. Space is very empty.`,
  },
  {
    id: 'finale.map', part: 'finale', kind: 'story', chapter: 'epilogue', section: 'map',
    title: 'The map is older than the machine',
    look: `The pulsar periods on the cover were published as the **1970/1971** values. Dated from today's pulsar timing, the periods themselves were true between 1966 and 1971, on average about 8 years before Voyager launched in 1977. The makers reused the map they had drawn for the Pioneer plaque.`,
    why: 'So the map clock in Portrait started counting several years before the machine left. That head start is real, but far too small to see beside clocks each uncertain by a century or more.',
  },
  {
    id: 'finale.line', part: 'finale', kind: 'story', chapter: 'epilogue', section: 'line',
    title: 'One line by hand',
    look: `Everything on the record was made by machines, except one line. Between the label and the grooves, someone scratched by hand: **"To the makers of music - all worlds, all times."**`,
    human: 'Timothy Ferris, who produced the record, wanted one thing on it made directly by a human hand.',
    ask: 'Who do you think "the makers of music" are, in all worlds?',
  },
  {
    id: 'finale.carter', part: 'finale', kind: 'story', chapter: 'epilogue', section: 'line',
    title: 'A present from a small, distant world',
    look:
      `The record also carries a printed message from US President Jimmy Carter. It begins: "This is a present from a small, distant world."\n\n` +
      `Nobody who made the record expected it to be found soon, or maybe ever. Space is so empty that Voyager will most likely drift between the stars for billions of years without coming near anything. It is a message in a bottle thrown into the biggest ocean there is.`,
    ask: 'Why do you think people spent so much effort on a message that will probably never be found?',
  },
];
