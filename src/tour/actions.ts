// The guided tour's "Do it for me" (D-A33; docs/plans/tour_specs/T2-actions.md). SHOW_ME: for each do or watch
// stop, keyed by stop id (the deduction id), a function that works the instrument through the command bus and the
// instrument's own controls, the way the bots do (rule 5), and resolves once the deduction is confirmed (any staged
// moment that follows skipped with its own button). It rejects with a readable Error when a step times out or an
// answer is refused. The chapter code is loaded only when asked (src/tour/actions/<chapter>.ts), so the tour adds
// nothing heavy to the page until a button is pressed. TARGETS: CSS selectors of the control the guide spotlights
// for each stop; the spotlight rings the FIRST VISIBLE match, so a control that appears only after an earlier step
// is listed before that step's control. For a question with choices, the group of choices is ringed (not the right
// one), so the guide does not give the answer away; mechanical steps ring the control itself.

export type ShowMe = () => Promise<void>;

type Mod = Record<string, unknown>;

/** A SHOW_ME entry that loads its chapter's actions and runs one of them. */
function lazy(load: () => Promise<Mod>, name: string): ShowMe {
  return async () => {
    const mod = await load();
    const fn = mod[name];
    if (typeof fn !== 'function') throw new Error(`The tour has no action ${name}.`);
    await (fn as ShowMe)();
  };
}

const arrival = (): Promise<Mod> => import('./actions/arrival');
const key = (): Promise<Mod> => import('./actions/key');
const player = (): Promise<Mod> => import('./actions/player');
const pictures = (): Promise<Mod> => import('./actions/pictures');
const voices = (): Promise<Mod> => import('./actions/voices');
const spot = (): Promise<Mod> => import('./actions/spot');
const map = (): Promise<Mod> => import('./actions/map');
const trail = (): Promise<Mod> => import('./actions/trail');

export const SHOW_ME: Record<string, ShowMe> = {
  'arrival.purpose': lazy(arrival, 'purpose'),
  'arrival.heat': lazy(arrival, 'heat'),
  'arrival.madeNotMined': lazy(arrival, 'madeNotMined'),
  'arrival.fuelAge': lazy(arrival, 'fuelAge'),

  'key.binary': lazy(key, 'binary'),
  'key.unit': lazy(key, 'unit'),
  'key.timesNotLengths': lazy(key, 'timesNotLengths'),

  'player.speed': lazy(player, 'speed'),
  'player.start': lazy(player, 'start'),
  'player.direction': lazy(player, 'direction'),
  'player.firstSound': lazy(player, 'firstSound'),

  'pictures.lineTime': lazy(pictures, 'lineTime'),
  'pictures.sync': lazy(pictures, 'sync'),
  'pictures.interlace': lazy(pictures, 'interlace'),
  'pictures.polarity': lazy(pictures, 'polarity'),
  'pictures.aspect': lazy(pictures, 'aspect'),
  'pictures.circle': lazy(pictures, 'circle'),
  'pictures.firstFrames': lazy(pictures, 'firstFrames'),
  'pictures.album': lazy(pictures, 'albumAll'),
  'pictures.colour': lazy(pictures, 'colour'),
  'pictures.down': lazy(pictures, 'down'),
  'pictures.numerals': lazy(pictures, 'numerals'),
  'pictures.units': lazy(pictures, 'units'),
  'pictures.height': lazy(pictures, 'height'),
  'pictures.home': lazy(pictures, 'home'),
  'pictures.slip': lazy(pictures, 'slip'),

  'voices.many': lazy(voices, 'many'),
  'voices.hearing': lazy(voices, 'hearing'),
  'voices.others': lazy(voices, 'others'),
  'voices.octave': lazy(voices, 'octave'),

  'spot.find': lazy(spot, 'find'),
  'spot.age': lazy(spot, 'age'),
  'spot.purity': lazy(spot, 'purity'),

  'map.periods': lazy(map, 'periods'),
  'map.old': lazy(map, 'old'),
  'map.identify': lazy(map, 'identify'),
  'map.motion': lazy(map, 'motion'),
  'map.region': lazy(map, 'region'),

  'trail.origin': lazy(trail, 'origin'),
  'trail.age': lazy(trail, 'age'),
  'trail.neighbour': lazy(trail, 'neighbour'),
  'trail.where': lazy(trail, 'where'),
  'trail.when': lazy(trail, 'when'),
};

/** A picture work view's tab. */
const picTab = (v: string): string => `button.pic-tab[data-view="${v}"]`;

export const TARGETS: Record<string, string[]> = {
  // Arrival: the scan's choices once its tab is open, else the tab.
  'arrival.purpose': ['[data-answer="arrival.purpose"] .ar-choices', '[data-scan-tab="structure"]'],
  'arrival.heat': ['[data-answer="arrival.heat"] .ar-choices', '[data-scan-tab="heat"]'],
  'arrival.madeNotMined': ['[data-answer="arrival.madeNotMined"] .ar-choices', '[data-scan-tab="isotopes"]'],
  'arrival.fuelAge': ['[data-panel="clock"] fieldset.ar-chains', '[data-scan-tab="clock"]'],

  // The Key: each panel's choices with its Propose button.
  'key.binary': ['fieldset[data-propose="key.binary"]', '[data-panel="key.binary"]'],
  'key.unit': ['fieldset[data-propose="key.unit"]', '[data-panel="key.unit"]'],
  'key.timesNotLengths': ['fieldset[data-propose="key.timesNotLengths"]', '[data-panel="key.timesNotLengths"]'],

  // The Player.
  'player.speed': ['.pctl[aria-label="Speed"]', '#pspeed'],
  // The platter while the drop point is off the lead-in band; then Drop once it is enabled; else the direction it waits for.
  'player.start': [
    'svg.platter:not([data-target-mm^="146."]):not([data-target-mm^="147."]):not([data-target-mm^="148."])',
    'button[data-drop]:not([disabled])',
    'button.pdir[data-direction="cw"]',
  ],
  'player.direction': ['[data-propose-button="player.direction"]', 'button.pdir[data-direction="cw"]'],
  // Drop while the needle is up (Lift disabled); while it plays, what the stylus hears.
  'player.firstSound': ['.prow:has(> button[data-lift][disabled]) > button[data-drop]', '[data-heard]'],

  // The Pictures: the knob each step is about.
  'pictures.lineTime': ['[data-knob="lineTime"]'],
  'pictures.sync': ['[data-knob="syncLock"]'],
  'pictures.interlace': ['[data-knob="interlace"]'],
  'pictures.polarity': ['[data-knob="polarity"]'],
  'pictures.aspect': ['[data-knob="rows"]'],
  'pictures.circle': ['[data-propose-button="pictures.circle"]'],
  // Propose once the circle and three pictures are kept (four thumbnails); until then, Play on.
  'pictures.firstFrames': ['.picinst:has(.pic-seen li:nth-child(4)) [data-propose-button="pictures.firstFrames"]', '[data-play-on]'],
  // Develop while it can be pressed (or the album while it develops), then Propose; the tab when another view is open.
  'pictures.album': [
    '[data-work="album"] [data-album-develop]:not([disabled]), [data-work="album"] .pic-album:has([data-album-stop])',
    '[data-work="album"] [data-propose-button="pictures.album"]',
    picTab('album'),
  ],
  'pictures.colour': ['[data-work="colour"] [data-propose-button="pictures.colour"]', '[data-work="colour"] .pic-album', picTab('colour')],
  'pictures.down': ['[data-work="turn"] .pic-turn-tools', '[data-work="turn"] .pic-album', picTab('turn')],
  'pictures.numerals': ['[data-work="numerals"] .pic-digit-rows', picTab('numerals')],
  'pictures.units': ['[data-work="units"] fieldset.pic-converter', picTab('units')],
  'pictures.height': ['[data-work="height"] fieldset.pic-converter', picTab('height')],
  'pictures.home': ['[data-work="planets"] [data-propose-button="pictures.home"]', '[data-work="planets"] .pic-table', picTab('planets')],
  'pictures.slip': ['[data-work="planets"] [data-propose-button="pictures.slip"]', '[data-work="planets"] .pic-table', picTab('planets')],

  // The Voices: each tool once its analysis is in, else its panel (which shows the progress).
  'voices.many': ['[data-panel="voices.many"]'],
  'voices.hearing': ['svg[data-hearing-chart]', '[data-panel="voices.hearing"]'],
  'voices.others': ['.vo-specbox', '.vo-tracks'],
  'voices.octave': ['[data-control="teeth"]', 'svg[data-octave-chart]', '[data-panel="voices.octave"]'],

  // The Spot.
  'spot.find': ['[data-propose="spot.find"]:not([disabled])', '.spotinst .coverviewer'],
  'spot.age': ['[data-panel="spot.age"]'],
  'spot.purity': ['input[data-start-input]', '[data-panel="spot.purity"]'],

  // The Map: the step's tool once its chip is on, else the chip.
  'map.periods': ['.map-linebtns', '[data-panel="map.periods"]'],
  'map.old': ['input[data-clock]', 'button.map-chip[data-step="map.old"]'],
  'map.identify': ['.mapinst[data-stage="map.identify"] .map-linebtns', 'button.map-chip[data-step="map.identify"]'],
  'map.motion': ['svg[data-sky-plot]', 'button.map-chip[data-step="map.motion"]'],
  'map.region': ['svg[data-plane]', 'button.map-chip[data-step="map.region"]'],

  // The Trail: the tool's Propose once it can be pressed, else the chart or view it works on, else its tab.
  'trail.origin': ['[data-tool-panel="trail"] [data-propose-button="trail.origin"]:not([disabled])', '.trinst[data-tool="trail"] .tr-chart', 'button.tr-tab[data-tool-tab="trail"]'],
  'trail.age': ['[data-tool-panel="runback"] input[data-run-input]', 'button.tr-tab[data-tool-tab="runback"]'],
  'trail.neighbour': ['[data-tool-panel="ruler"] [data-propose-button="trail.neighbour"]:not([disabled])', '.trinst[data-tool="ruler"] .tr-chart', 'button.tr-tab[data-tool-tab="ruler"]'],
  'trail.where': ['svg.tr-region', 'button.tr-tab[data-tool-tab="region"]'],
  'trail.when': ['svg.tr-reframe:not([data-frame="own"])', '[data-tool-panel="reframe"] select[data-frame-select]', 'button.tr-tab[data-tool-tab="reframe"]'],
};
