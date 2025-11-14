import type { LabyrinthRoom } from '../maps/level21_corporate_labyrinth.ts';

let terminalIdCounter = 0;

export interface JobTerminalOptions {
  room: LabyrinthRoom;
  offset?: { x: number; y: number };
}

export interface JobTerminalState {
  id: string;
  position: { x: number; y: number };
  roomId: string;
  appliedJobs: number;
  interacted: boolean;
}

export function createJobTerminal(options: JobTerminalOptions): JobTerminalState {
  const { room, offset = { x: 0, y: 0 } } = options;
  const id = `job-terminal-${terminalIdCounter++}`;
  const position = {
    x: room.center.x + offset.x,
    y: room.center.y + offset.y
  };

  return {
    id,
    position,
    roomId: room.id,
    appliedJobs: 0,
    interacted: false
  };
}

export function resetTerminalCounter() {
  terminalIdCounter = 0;
}
