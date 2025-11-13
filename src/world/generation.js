/**
 * Procedural generation helpers for Level 19's endless-backrooms inspired map.
 *
 * The implementation focuses on producing data structures that describe a very
 * large lattice of beige office corridors.  Rendering, navigation meshes and
 * gameplay logic are handled elsewhere; this module simply creates the layout
 * that other systems can consume.
 */

const DEFAULT_LEVEL19_CONFIG = {
  /** Width/height of the square corridor grid in cells. */
  mapSize: 200,
  /** Length of a corridor cell in world units. */
  corridorSegmentLength: 20,
  /** Minimum number of cells that a straight corridor run should last. */
  minSegmentLength: 4,
  /** Maximum number of cells that a straight corridor run should last. */
  maxSegmentLength: 18,
  /** Likelihood of branching into an orthogonal corridor while carving. */
  branchProbability: 0.22,
  /** Chance that a carving segment will turn mid-run to form a corner. */
  turnProbability: 0.18,
  /**
   * When the frontier dries up we occasionally pick an existing corridor and
   * extend it further.  This value biases the pick towards deeper cells.
   */
  revisitDepthBias: 0.65,
  /** Probability that any wall section gets a door carved into it. */
  doorProbability: 0.15,
  /** Probability that a door opens into a large cubicle room. */
  cubicleRoomProbability: 0.005,
  /** Dimensions of normal side rooms (in world units). */
  sideRoomWidth: 12,
  sideRoomDepth: 14,
  /** Dimensions of cubicle rooms (in world units). */
  cubicleRoomWidth: 40,
  cubicleRoomDepth: 36,
  /** Desk placement tuning for cubicle rooms. */
  deskSpacing: 3.5,
  cubicleRows: [4, 8],
  cubicleCols: [6, 12]
};

const CARDINALS = [
  { id: 'north', dx: 0, dy: -1 },
  { id: 'south', dx: 0, dy: 1 },
  { id: 'west', dx: -1, dy: 0 },
  { id: 'east', dx: 1, dy: 0 }
];

const OPPOSITE = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east'
};

/**
 * Convert an arbitrary seed input into a 32-bit value suitable for mulberry32.
 */
function normaliseSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return seed >>> 0;
  }
  if (typeof seed === 'string') {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash |= 0;
    }
    return hash >>> 0;
  }
  return (Date.now() & 0xffffffff) >>> 0;
}

function mulberry32(a) {
  return function rng() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickRandom(rng, list) {
  if (!Array.isArray(list) || !list.length) return undefined;
  return list[Math.floor(rng() * list.length)];
}

function randomRange(rng, min, max) {
  if (max <= min) return min;
  return min + Math.floor(rng() * (max - min + 1));
}

function manhattan(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function makeDoorId(index) {
  return `door-${index}`;
}

function makeRoomId(doorId) {
  return `room-${doorId}`;
}

function isWithinBounds(x, y, radius) {
  return x >= -radius && x <= radius && y >= -radius && y <= radius;
}

function linkCorridors(a, b, direction) {
  if (!a || !b) return;
  if (!a.connections.some((conn) => conn.target === b.id)) {
    a.connections.push({ direction, target: b.id });
  }
  const opposite = OPPOSITE[direction];
  if (opposite && !b.connections.some((conn) => conn.target === a.id)) {
    b.connections.push({ direction: opposite, target: a.id });
  }
}

/**
 * Create the Level 19 corridor layout along with door and room metadata.
 */
export function generateLevel19Layout(seed, overrides = {}) {
  const config = { ...DEFAULT_LEVEL19_CONFIG, ...overrides };
  const seedValue = normaliseSeed(seed);
  const rng = mulberry32(seedValue);

  const radius = Math.floor(config.mapSize / 2);
  const maxCells = config.mapSize * config.mapSize;

  const corridors = [];
  const corridorLookup = new Map();
  const doors = [];
  const rooms = [];
  const cubicleRooms = [];
  const desks = [];

  function ensureCorridor(x, y) {
    if (!isWithinBounds(x, y, radius)) return null;
    const key = `${x},${y}`;
    let corridor = corridorLookup.get(key);
    if (!corridor) {
      corridor = {
        id: corridors.length,
        grid: { x, y },
        world: {
          x: x * config.corridorSegmentLength,
          y: y * config.corridorSegmentLength
        },
        connections: [],
        doors: [],
        depth: manhattan(x, y, 0, 0)
      };
      corridors.push(corridor);
      corridorLookup.set(key, corridor);
    }
    return corridor;
  }

  const spawnCorridor = ensureCorridor(0, 0);
  const frontier = [];
  if (spawnCorridor) {
    frontier.push({ corridor: spawnCorridor, direction: pickRandom(rng, CARDINALS) || CARDINALS[0] });
  }

  let attempts = 0;
  const maxAttempts = maxCells * 6;

  while (corridors.length < maxCells && attempts < maxAttempts) {
    attempts += 1;
    let currentBranch = frontier.pop();

    if (!currentBranch) {
      const candidate = pickRandom(rng, corridors);
      if (!candidate) break;
      const directionBias = CARDINALS.slice().sort((a, b) => {
        const depthA = manhattan(candidate.grid.x + a.dx, candidate.grid.y + a.dy, 0, 0);
        const depthB = manhattan(candidate.grid.x + b.dx, candidate.grid.y + b.dy, 0, 0);
        const scoreA = depthA * (1 + config.revisitDepthBias * rng());
        const scoreB = depthB * (1 + config.revisitDepthBias * rng());
        return scoreB - scoreA;
      });
      currentBranch = { corridor: candidate, direction: directionBias[0] };
    }

    let { corridor: current, direction } = currentBranch;
    if (!current || !direction) continue;

    const segmentLength = randomRange(rng, config.minSegmentLength, config.maxSegmentLength);
    for (let step = 0; step < segmentLength; step += 1) {
      const nextX = current.grid.x + direction.dx;
      const nextY = current.grid.y + direction.dy;
      if (!isWithinBounds(nextX, nextY, radius)) break;

      const nextCorridor = ensureCorridor(nextX, nextY);
      if (!nextCorridor) break;

      linkCorridors(current, nextCorridor, direction.id);
      current = nextCorridor;

      if (rng() < config.turnProbability) {
        const options = CARDINALS.filter((c) => c.id !== direction.id && c.id !== OPPOSITE[direction.id]);
        const newDirection = pickRandom(rng, options);
        if (newDirection) {
          direction = newDirection;
        }
      }

      if (rng() < config.branchProbability) {
        const branchOptions = CARDINALS.filter((c) => c.id !== direction.id && c.id !== OPPOSITE[direction.id]);
        const branchDir = pickRandom(rng, branchOptions);
        if (branchDir) {
          frontier.push({ corridor: current, direction: branchDir });
        }
      }
    }

    if (rng() < config.branchProbability) {
      const options = CARDINALS.filter((c) => c.id !== OPPOSITE[direction.id]);
      const nextDir = pickRandom(rng, options);
      if (nextDir) {
        frontier.push({ corridor: current, direction: nextDir });
      }
    }
  }

  const grid = Array.from({ length: config.mapSize }, () => Array(config.mapSize).fill(null));
  for (const corridor of corridors) {
    const gx = corridor.grid.x + radius;
    const gy = corridor.grid.y + radius;
    if (gy >= 0 && gy < config.mapSize && gx >= 0 && gx < config.mapSize) {
      grid[gy][gx] = corridor.id;
    }
  }

  for (const corridor of corridors) {
    for (const direction of CARDINALS) {
      const neighbour = corridorLookup.get(`${corridor.grid.x + direction.dx},${corridor.grid.y + direction.dy}`);
      if (neighbour) continue;
      if (rng() > config.doorProbability) continue;

      const doorId = makeDoorId(doors.length);
      const door = {
        id: doorId,
        corridorId: corridor.id,
        direction: direction.id,
        position: {
          x: corridor.world.x + direction.dx * (config.corridorSegmentLength / 2),
          y: corridor.world.y + direction.dy * (config.corridorSegmentLength / 2),
          z: 0
        },
        roomId: null
      };
      doors.push(door);
      corridor.doors.push(door.id);

      const roomSeed = `${seedValue}:${door.id}`;
      const isCubicle = rng() < config.cubicleRoomProbability;
      const roomDefinition = isCubicle
        ? createCubicleRoom(roomSeed, config)
        : createSideRoom(roomSeed, config);

      const offset = (config.corridorSegmentLength / 2) + (roomDefinition.size.depth / 2);
      const roomCentre = {
        x: corridor.world.x + direction.dx * offset,
        y: corridor.world.y + direction.dy * offset,
        z: 0
      };

      const roomId = makeRoomId(door.id);
      const room = {
        id: roomId,
        doorId: door.id,
        type: roomDefinition.type,
        world: roomCentre,
        size: roomDefinition.size,
        desks: [],
        metadata: roomDefinition.metadata || {}
      };

      door.roomId = roomId;
      door.roomType = room.type;

      if (roomDefinition.desks && roomDefinition.desks.length) {
        const roomDesks = roomDefinition.desks.map((desk, index) => {
          const deskId = `${roomId}-desk-${index}`;
          const deskWorld = {
            x: roomCentre.x + desk.offset.x,
            y: roomCentre.y + desk.offset.y,
            z: 0
          };
          return {
            id: deskId,
            roomId,
            position: deskWorld
          };
        });
        room.desks = roomDesks.map((desk) => desk.id);
        desks.push(...roomDesks);
      }

      rooms.push(room);
      if (room.type === 'cubicle') {
        cubicleRooms.push(room.id);
      }
    }
  }

  const deskLookup = new Map(desks.map((desk) => [desk.id, desk]));

  let elevatorCorridor = spawnCorridor;
  let highestScore = -Infinity;
  for (const corridor of corridors) {
    const score = corridor.depth + rng() * 3;
    if (score > highestScore) {
      highestScore = score;
      elevatorCorridor = corridor;
    }
  }

  const elevator = elevatorCorridor
    ? {
        corridorId: elevatorCorridor.id,
        position: {
          x: elevatorCorridor.world.x,
          y: elevatorCorridor.world.y,
          z: 0
        },
        locked: true
      }
    : null;

  return {
    config,
    spawn: {
      corridorId: spawnCorridor?.id ?? 0,
      position: {
        x: (spawnCorridor?.world.x ?? 0),
        y: (spawnCorridor?.world.y ?? 0),
        z: 0
      }
    },
    grid,
    corridors,
    doors,
    rooms,
    cubicleRooms,
    desks,
    deskLookup,
    collectibles: [],
    elevator,
    meta: {
      description: 'Level 19 backrooms layout',
      seed: seedValue
    }
  };
}

/**
 * Create metadata for a normal side room.  These rooms are intentionally
 * simple: a rectangular footprint with no additional props.
 */
export function createSideRoom(seed, config = DEFAULT_LEVEL19_CONFIG) {
  const rng = mulberry32(normaliseSeed(seed));
  const width = config.sideRoomWidth;
  const depth = config.sideRoomDepth;
  const wobble = (rng() - 0.5) * 2;
  return {
    type: 'side',
    size: {
      width: clamp(width + wobble, width * 0.9, width * 1.1),
      depth: depth
    },
    desks: [],
    metadata: {
      flavour: 'storage'
    }
  };
}

/**
 * Create metadata for a cubicle mega-room.  The desk positions are returned as
 * offsets relative to the centre of the room so that the caller can translate
 * them into world space.
 */
export function createCubicleRoom(seed, config = DEFAULT_LEVEL19_CONFIG) {
  const rng = mulberry32(normaliseSeed(seed));
  const rows = randomRange(rng, config.cubicleRows[0], config.cubicleRows[1]);
  const cols = randomRange(rng, config.cubicleCols[0], config.cubicleCols[1]);
  const deskSpacing = config.deskSpacing;
  const desks = [];

  const width = Math.max(config.cubicleRoomWidth, (cols - 1) * deskSpacing + deskSpacing * 2);
  const depth = Math.max(config.cubicleRoomDepth, (rows - 1) * deskSpacing + deskSpacing * 2);

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const offsetX = (c - (cols - 1) / 2) * deskSpacing;
      const offsetY = (r - (rows - 1) / 2) * deskSpacing;
      desks.push({
        offset: { x: offsetX, y: offsetY }
      });
    }
  }

  return {
    type: 'cubicle',
    size: { width, depth },
    desks,
    metadata: {
      rows,
      cols
    }
  };
}

export const __level19Defaults = Object.freeze({ ...DEFAULT_LEVEL19_CONFIG });

