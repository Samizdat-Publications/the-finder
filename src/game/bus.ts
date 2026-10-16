// The one command bus (CLAUDE.md rule 5). The interface, the harness and any bot change the bench only by
// dispatching these commands; there is no other way into the state. dispatch() resolves when the command has
// finished (a load or a decode waits for its data); it rejects with the reason when the command cannot run,
// after the reason has also been written to the state's error field for the interface to show.

import type { Direction } from '../record/groove';
import type { BenchParams } from './model';
import * as decoderService from './decoderService';
import * as turntableService from './turntableService';

type ParamCommand = { [K in keyof BenchParams]: { type: 'decoder.setParam'; name: K; value: BenchParams[K] } }[keyof BenchParams];

export type Command =
  | { type: 'turntable.load'; side: number }
  | { type: 'turntable.drop'; radiusMm: number }
  | { type: 'turntable.setSpeed'; secondsPerTurn: number }
  | { type: 'turntable.setDirection'; direction: Direction }
  | { type: 'turntable.setVolume'; value: number }
  | { type: 'turntable.lift' }
  | { type: 'decoder.select'; frame: string }
  | ParamCommand
  | { type: 'decoder.reset' }
  | { type: 'decoder.run'; speed: 'record' | 'fast' }
  | { type: 'decoder.composeColour'; image: number };

export async function dispatch(cmd: Command): Promise<void> {
  switch (cmd.type) {
    case 'turntable.load':
      return turntableService.loadSide(cmd.side);
    case 'turntable.drop':
      return turntableService.dropNeedle(cmd.radiusMm);
    case 'turntable.setSpeed':
      return turntableService.setSpeed(cmd.secondsPerTurn);
    case 'turntable.setDirection':
      return turntableService.setDirection(cmd.direction);
    case 'turntable.setVolume':
      return turntableService.setVolume(cmd.value);
    case 'turntable.lift':
      return turntableService.lift();
    case 'decoder.select':
      return decoderService.select(cmd.frame);
    case 'decoder.setParam':
      // The union is per knob, so name and value always agree; the generic call cannot see that.
      return decoderService.setParam(cmd.name as keyof BenchParams, cmd.value as never);
    case 'decoder.reset':
      return decoderService.reset();
    case 'decoder.run':
      return decoderService.run(cmd.speed);
    case 'decoder.composeColour':
      return decoderService.composeColour(cmd.image);
    default: {
      const never: never = cmd;
      throw new Error(`unknown command ${JSON.stringify(never)}`);
    }
  }
}
