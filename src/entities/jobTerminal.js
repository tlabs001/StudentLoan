let terminalIdCounter = 0;

export function createJobTerminal(options) {
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
