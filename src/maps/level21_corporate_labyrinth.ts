export type RoomType = 'office' | 'board-room' | 'bathroom' | 'lounge' | 'storage' | 'reception';

export interface LabyrinthRoom {
  id: string;
  type: RoomType;
  center: { x: number; y: number };
  width: number;
  height: number;
  doors: string[];
}

export interface LabyrinthCorridor {
  id: string;
  from: string;
  to: string;
  waypoints: { x: number; y: number }[];
}

export interface CorporateLabyrinthMap {
  seed: string;
  rooms: LabyrinthRoom[];
  corridors: LabyrinthCorridor[];
  gridSize: number;
  width: number;
  height: number;
}

export interface LabyrinthOptions {
  seed?: string;
  gridSize?: number;
  roomCount?: number;
  width?: number;
  height?: number;
}

const ROOM_TYPES: RoomType[] = ['office', 'board-room', 'bathroom', 'lounge', 'storage'];

function mulberry32(seed: number) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, list: T[]): T {
  return list[Math.floor(rng() * list.length)];
}

function hashSeed(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return h;
}

export function generateCorporateLabyrinth(options: LabyrinthOptions = {}): CorporateLabyrinthMap {
  const seed = options.seed ?? 'level21-labyrinth';
  const gridSize = options.gridSize ?? 32;
  const roomCount = options.roomCount ?? 28;
  const width = options.width ?? 1800;
  const height = options.height ?? 1400;

  const rng = mulberry32(hashSeed(seed));

  const rooms: LabyrinthRoom[] = [];
  const corridors: LabyrinthCorridor[] = [];

  for (let i = 0; i < roomCount; i += 1) {
    const w = (6 + Math.floor(rng() * 6)) * gridSize;
    const h = (6 + Math.floor(rng() * 6)) * gridSize;
    const x = Math.floor(rng() * (width - w)) + w / 2;
    const y = Math.floor(rng() * (height - h)) + h / 2;

    const roomType = i === 0 ? 'reception' : pick(rng, ROOM_TYPES);
    const id = `room-${i}`;

    rooms.push({
      id,
      type: roomType,
      center: { x, y },
      width: w,
      height: h,
      doors: []
    });
  }

  rooms.sort((a, b) => a.center.x - b.center.x);

  for (let i = 1; i < rooms.length; i += 1) {
    const current = rooms[i];
    const previous = rooms[Math.max(0, i - Math.floor(rng() * 3) - 1)];

    const corridorId = `corridor-${i}`;
    current.doors.push(previous.id);
    previous.doors.push(current.id);

    corridors.push({
      id: corridorId,
      from: previous.id,
      to: current.id,
      waypoints: [
        { x: previous.center.x, y: current.center.y },
        { x: current.center.x, y: current.center.y }
      ]
    });
  }

  // add extra cross connections to create loops
  for (let i = 0; i < rooms.length; i += 1) {
    const source = rooms[i];
    if (source.type === 'reception') continue;
    if (rng() < 0.4) {
      const target = pick(rng, rooms);
      if (target.id !== source.id && !source.doors.includes(target.id)) {
        const corridorId = `extra-${source.id}-${target.id}`;
        source.doors.push(target.id);
        target.doors.push(source.id);
        corridors.push({
          id: corridorId,
          from: source.id,
          to: target.id,
          waypoints: [
            { x: source.center.x, y: source.center.y },
            { x: target.center.x, y: source.center.y },
            { x: target.center.x, y: target.center.y }
          ]
        });
      }
    }
  }

  return {
    seed,
    rooms,
    corridors,
    gridSize,
    width,
    height
  };
}
