/**
 * Procedural generation helpers for office-style labyrinth levels.
 *
 * The goal of this module is to provide a deterministic generator that can
 * create the intentionally confusing office maze used by Level 19.  The code
 * focuses on data production rather than direct rendering so that the rest of
 * the game can decide how to visualise the corridors, rooms and props.
 */

const DEFAULT_LEVEL19_CONFIG = {
  /**
   * Size of a single corridor segment in world units. Increasing this value
   * makes hallways feel longer and sparser.
   */
  corridorSegmentLength: 36,
  /** Number of tiles to extend the grid from the origin in each direction. */
  gridRadius: 28,
  /**
   * Average number of door opportunities per corridor segment.  The actual
   * amount is randomly varied per segment.
   */
  doorsPerCorridor: 3,
  /** Maximum additional randomised doors applied to a corridor. */
  doorsPerCorridorVariance: 2,
  /** Likelihood that a given door opportunity will be realised. */
  roomFrequency: 0.78,
  /** Probability that a generated door becomes a cubicle mega-room. */
  cubicleRoomProbability: 0.005,
  /** Probability that a door leads to a murder-room vignette. */
  murderRoomProbability: 0.018,
  /** Probability that a normal side room contains a deed collectible. */
  deedProbability: 0.24,
  /**
   * Target manhattan distance (in corridor segments) from the spawn point to
   * the elevator.  Used to bias elevator placement deep into the maze.
   */
  averageElevatorDistance: 64,
  /**
   * Minimum number of cubicle rooms that should exist to guarantee a key
   * hiding spot even if the random chance is extremely unlucky.
   */
  minimumCubicleRooms: 3,
  /** Range of cubicle desk rows. */
  cubicleDeskRows: [4, 8],
  /** Range of cubicle desk columns. */
  cubicleDeskCols: [6, 10],
  /** Spacing between desks inside cubicle rooms in world units. */
  deskSpacing: 4,
  /** Room depth (distance from corridor) for generated side rooms. */
  roomDepth: 16,
  /** Width of small side rooms. */
  sideRoomWidth: 18,
  /** Width of large cubicle rooms. */
  cubicleRoomWidth: 46,
  /** Depth of cubicle rooms. */
  cubicleRoomDepth: 42
};

const CARDINALS = [
  { id: 'north', dx: 0, dy: -1 },
  { id: 'south', dx: 0, dy: 1 },
  { id: 'west', dx: -1, dy: 0 },
  { id: 'east', dx: 1, dy: 0 }
];

/**
 * Convert a seed input into a number usable by the deterministic RNG.
 * The game can pass strings, numbers or undefined.  Strings are hashed to a
 * 32-bit integer to keep results stable across refreshes.
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
  // Fallback to a semi-random seed based on current time to avoid constant 0
  // seeds during development sessions.
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

function shuffleInPlace(rng, list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function manhattan(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

/**
 * Generate corridor metadata for the Level 19 office labyrinth.
 * The world is modelled as a large orthogonal grid of corridor cells. Each
 * cell contains the information required to render the hallway tile plus door
 * information and decorative props.
 */
export function generateLevel19Layout(seed, overrides = {}) {
  const config = { ...DEFAULT_LEVEL19_CONFIG, ...overrides };
  const rng = mulberry32(normaliseSeed(seed));

  const corridors = [];
  const corridorLookup = new Map();
  const doors = [];
  const rooms = [];
  const cubicleRooms = [];
  const murderRooms = [];
  const collectibles = [];

  const { gridRadius, corridorSegmentLength } = config;
  const spawnCoord = { x: 0, y: 0 };

  // Precompute grid coordinates for corridor cells.  The grid is intentionally
  // large, giving the sense of an infinite office.  Connections are pruned
  // randomly to avoid a perfectly regular lattice.
  for (let gy = -gridRadius; gy <= gridRadius; gy += 1) {
    for (let gx = -gridRadius; gx <= gridRadius; gx += 1) {
      const id = corridors.length;
      const key = `${gx},${gy}`;
      const corridor = {
        id,
        grid: { x: gx, y: gy },
        world: {
          x: gx * corridorSegmentLength,
          y: gy * corridorSegmentLength
        },
        connections: [],
        doors: [],
        depth: manhattan(gx, gy, spawnCoord.x, spawnCoord.y)
      };
      corridors.push(corridor);
      corridorLookup.set(key, corridor);
    }
  }

  // Establish connections.  Each corridor links to neighbouring cells to
  // create long hallways.  The randomness keeps the network non-uniform while
  // still ensuring connectivity across the grid.
  for (const corridor of corridors) {
    const { x, y } = corridor.grid;
    const cardinalOrder = shuffleInPlace(rng, CARDINALS.slice());
    for (const dir of cardinalOrder) {
      const targetKey = `${x + dir.dx},${y + dir.dy}`;
      const neighbour = corridorLookup.get(targetKey);
      if (!neighbour) continue;

      // Skip some links to open dead ends and loops, creating a maze-like
      // topology.
      const skipChance = 0.18 + corridor.depth * 0.0004;
      if (rng() < skipChance) continue;

      corridor.connections.push({ direction: dir.id, target: neighbour.id });
    }
    // Guarantee at least one exit; otherwise the corridor becomes isolated.
    if (!corridor.connections.length) {
      const fallbackDir = pickRandom(rng, CARDINALS);
      if (fallbackDir) {
        const fallbackKey = `${x + fallbackDir.dx},${y + fallbackDir.dy}`;
        const fallback = corridorLookup.get(fallbackKey);
        if (fallback) {
          corridor.connections.push({ direction: fallbackDir.id, target: fallback.id });
        }
      }
    }
  }

  // Helper that produces aligned positions for doors along the corridor walls.
  function createDoor(corridor, direction, offsetScalar) {
    const doorId = `door-${corridor.id}-${direction}-${Math.round(offsetScalar * 1000)}`;
    const normal = CARDINALS.find((d) => d.id === direction);
    const tangent = normal ? { dx: normal.dy, dy: -normal.dx } : { dx: 0, dy: 0 };
    const offset = ((offsetScalar * 2) - 1) * (corridorSegmentLength * 0.5);
    const door = {
      id: doorId,
      corridorId: corridor.id,
      direction,
      normal,
      position: {
        x: corridor.world.x + tangent.dx * offset,
        y: corridor.world.y + tangent.dy * offset
      },
      type: 'side-room',
      target: null
    };
    doors.push(door);
    corridor.doors.push(door.id);
    return door;
  }

  // Create doors for each corridor.
  for (const corridor of corridors) {
    const availableDirections = corridor.connections.length
      ? corridor.connections.map((c) => c.direction)
      : CARDINALS.map((c) => c.id);
    const doorDirections = availableDirections.filter((dir) => dir === 'north' || dir === 'south');
    const fallbackDirections = availableDirections.filter((dir) => dir === 'east' || dir === 'west');
    const useDirections = doorDirections.length ? doorDirections : fallbackDirections;
    const doorCountBase = config.doorsPerCorridor + rng() * config.doorsPerCorridorVariance;
    const doorCount = Math.max(1, Math.round(doorCountBase));
    const createdDoors = [];
    for (let i = 0; i < doorCount; i += 1) {
      if (rng() > config.roomFrequency) continue;
      const dir = pickRandom(rng, useDirections);
      const offset = rng();
      const door = createDoor(corridor, dir, offset);
      createdDoors.push(door.id);
      rooms.push({
        id: `room-${door.id}`,
        doorId: door.id,
        type: 'side',
        props: [],
        collectibles: [],
        murder: false,
        world: {
          x: door.position.x + (door.normal ? door.normal.dx * config.roomDepth : 0),
          y: door.position.y + (door.normal ? door.normal.dy * config.roomDepth : 0)
        },
        size: {
          width: config.sideRoomWidth,
          depth: config.roomDepth
        }
      });
    }
    if (!createdDoors.length) {
      const dir = pickRandom(rng, useDirections);
      const offset = rng();
      const door = createDoor(corridor, dir, offset);
      rooms.push({
        id: `room-${door.id}`,
        doorId: door.id,
        type: 'side',
        props: [],
        collectibles: [],
        murder: false,
        world: {
          x: door.position.x + (door.normal ? door.normal.dx * config.roomDepth : 0),
          y: door.position.y + (door.normal ? door.normal.dy * config.roomDepth : 0)
        },
        size: {
          width: config.sideRoomWidth,
          depth: config.roomDepth
        }
      });
    }
  }

  // Promote some doors to cubicle or murder rooms.
  const desks = [];
  for (const room of rooms) {
    const door = doors.find((d) => d.id === room.doorId);
    if (!door) continue;

    if (rng() < config.cubicleRoomProbability) {
      room.type = 'cubicle';
      const rows = randomRange(rng, config.cubicleDeskRows[0], config.cubicleDeskRows[1]);
      const cols = randomRange(rng, config.cubicleDeskCols[0], config.cubicleDeskCols[1]);
      const deskList = [];
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const deskId = `${room.id}-desk-${r}-${c}`;
          deskList.push({
            id: deskId,
            roomId: room.id,
            row: r,
            col: c,
            world: {
              x: room.world.x + (c - cols / 2 + 0.5) * config.deskSpacing,
              y: room.world.y + (r - rows / 2 + 0.5) * config.deskSpacing
            },
            hasKey: false,
            searchable: true
          });
        }
      }
      room.size.width = config.cubicleRoomWidth;
      room.size.depth = config.cubicleRoomDepth;
      room.desks = deskList.map((desk) => desk.id);
      cubicleRooms.push(room.id);
      desks.push(...deskList);
    } else if (rng() < config.murderRoomProbability) {
      room.type = 'murder';
      room.murder = true;
      room.props = [
        { id: `${room.id}-table`, kind: 'table', position: { x: room.world.x, y: room.world.y } },
        { id: `${room.id}-body`, kind: 'body-bag', position: { x: room.world.x + 1.5, y: room.world.y + 2 } },
        { id: `${room.id}-blood`, kind: 'blood-decal', position: { x: room.world.x - 2, y: room.world.y - 1 } }
      ];
    } else if (rng() < config.deedProbability) {
      const deedId = `deed-${room.id}`;
      room.collectibles.push(deedId);
      collectibles.push({
        id: deedId,
        type: 'deed',
        title: randomDeedTitle(rng),
        text: 'A stamped and notarised deed to a suspicious property.',
        position: {
          x: room.world.x,
          y: room.world.y,
          z: 0.9
        }
      });
    }
  }

  // Guarantee a minimum number of cubicle rooms by converting random rooms if
  // necessary.
  while (cubicleRooms.length < config.minimumCubicleRooms && rooms.length) {
    const candidate = pickRandom(rng, rooms.filter((room) => room.type === 'side'));
    if (!candidate) break;
    candidate.type = 'cubicle';
    const rows = randomRange(rng, config.cubicleDeskRows[0], config.cubicleDeskRows[1]);
    const cols = randomRange(rng, config.cubicleDeskCols[0], config.cubicleDeskCols[1]);
    const deskList = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const deskId = `${candidate.id}-desk-${r}-${c}`;
        deskList.push({
          id: deskId,
          roomId: candidate.id,
          row: r,
          col: c,
          world: {
            x: candidate.world.x + (c - cols / 2 + 0.5) * config.deskSpacing,
            y: candidate.world.y + (r - rows / 2 + 0.5) * config.deskSpacing
          },
          hasKey: false,
          searchable: true
        });
      }
    }
    candidate.desks = deskList.map((desk) => desk.id);
    candidate.size.width = config.cubicleRoomWidth;
    candidate.size.depth = config.cubicleRoomDepth;
    cubicleRooms.push(candidate.id);
    desks.push(...deskList);
  }

  const deskLookup = new Map(desks.map((desk) => [desk.id, desk]));

  // Select the elevator key location.
  const deskForKey = pickRandom(rng, desks);
  if (deskForKey) {
    deskForKey.hasKey = true;
    collectibles.push({
      id: 'elevator-key',
      type: 'key',
      title: 'Executive Elevator Key',
      text: 'A cold metal key tagged with an ominous warning: "Property of Floor 19".',
      position: { ...deskForKey.world, z: 1 },
      deskId: deskForKey.id
    });
  }

  // Determine the elevator position by picking a corridor far from the spawn.
  let elevatorCorridor = corridors[0];
  let bestScore = -Infinity;
  for (const corridor of corridors) {
    const distance = manhattan(corridor.grid.x, corridor.grid.y, spawnCoord.x, spawnCoord.y);
    const score = -Math.abs(distance - config.averageElevatorDistance) + rng() * 0.5;
    if (score > bestScore) {
      bestScore = score;
      elevatorCorridor = corridor;
    }
  }
  const elevator = {
    corridorId: elevatorCorridor.id,
    position: {
      x: elevatorCorridor.world.x,
      y: elevatorCorridor.world.y,
      z: 0
    },
    locked: true
  };

  return {
    config,
    spawn: {
      corridorId: corridorLookup.get(`${spawnCoord.x},${spawnCoord.y}`)?.id ?? 0,
      position: {
        x: spawnCoord.x * corridorSegmentLength,
        y: spawnCoord.y * corridorSegmentLength,
        z: 0
      }
    },
    corridors,
    doors,
    rooms,
    cubicleRooms,
    murderRooms: rooms.filter((room) => room.murder).map((room) => room.id),
    desks,
    deskLookup,
    collectibles,
    elevator,
    meta: {
      description: 'Backrooms-style corporate maze',
      seed: normaliseSeed(seed)
    }
  };
}

function randomDeedTitle(rng) {
  const owners = [
    'Anderson Family',
    'The Sandoval Estate',
    'Chief Auditor Delgado',
    'Regional Director Hsu',
    'Vice President Adebayo',
    'Counselor Merrow',
    'Board Member Castillo',
    'Consultant Ibarra',
    'Covert Operative Vale',
    'Chairman Lockwood'
  ];
  const properties = [
    'Seaside Manor',
    'Desert Compound',
    'Northern Cabin',
    'Urban Penthouse',
    'Island Bunker',
    'Country Estate',
    'Private Airfield',
    'Mountain Observatory',
    'Hidden Vault',
    'Subterranean Spa'
  ];
  const owner = pickRandom(rng, owners) || 'Unknown Executive';
  const property = pickRandom(rng, properties) || 'Unnamed Property';
  return `${owner}'s ${property}`;
}

export const __level19Defaults = Object.freeze({ ...DEFAULT_LEVEL19_CONFIG });
