// The answers the Arrival instruments offer, one list per deduction (data, not interface code). Each id is
// what the panel proposes on the command bus; the checker (checkers.ts) decides and explains.

export interface Choice {
  id: string;
  label: string;
}

export const CHOICES: Readonly<Record<string, readonly Choice[]>> = {
  'arrival.purpose': [
    { id: 'eye', label: 'It gathers light, like an eye' },
    { id: 'radio', label: 'It sends and receives radio across distance' },
    { id: 'sail', label: 'It is a sail, pushed by light' },
    { id: 'radiator', label: 'It is a radiator, shedding heat' },
  ],
  'arrival.heat': [
    { id: 'sunlight', label: 'Sunlight falling on them' },
    { id: 'leftover', label: 'Heat left over from when they were made' },
    { id: 'chemical', label: 'A chemical reaction inside' },
    { id: 'decay', label: 'Radioactive decay inside' },
  ],
  'arrival.madeNotMined': [
    { id: 'mined', label: 'Mined: natural uranium ore' },
    { id: 'made', label: 'Made: born from a heavier element someone made' },
  ],
  'arrival.fuelAge': [
    { id: 'pu238', label: 'Plutonium-238 to uranium-234 to thorium-230' },
    { id: 'naturalUranium', label: "Uranium-238's natural series, from purified uranium" },
    { id: 'u234Start', label: 'The uranium-234 was there from the start' },
    { id: 'oldOre', label: 'Old ore, its series long in balance' },
  ],
};

