// How the interface issues a command: the same bus the bots use. A refused command has already written its
// reason to game.error (shown in the shell's notice), so the rejection is not re-thrown here.

import { dispatch, type Command } from '../game/bus';

export function send(cmd: Command): void {
  dispatch(cmd).catch(() => undefined);
}
