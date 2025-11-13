import * as THREE from 'three';

const LEVEL19_CONSTANTS = {
  CEILING_HEIGHT: 3.2,
  WALL_THICKNESS: 0.35,
  FLOOR_THICKNESS: 0.08,
  DOOR_WIDTH_RATIO: 0.42,
  DOOR_HEIGHT: 2.6,
  DOOR_DEPTH: 0.18,
  DESK_HEIGHT: 0.82,
  DESK_WIDTH: 1.6,
  DESK_DEPTH: 0.9,
  CHAIR_WIDTH: 0.7,
  CHAIR_DEPTH: 0.7,
  CHAIR_HEIGHT: 0.55
};

export const LEVEL19_DIMENSIONS = Object.freeze({ ...LEVEL19_CONSTANTS });

const CARDINAL_DIRECTIONS = ['north', 'south', 'east', 'west'];

function ensureNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function seededRandom(seedString = '') {
  let seed = 1779033703 ^ seedString.length;
  for (let i = 0; i < seedString.length; i += 1) {
    seed = Math.imul(seed ^ seedString.charCodeAt(i), 3432918353);
    seed = (seed << 13) | (seed >>> 19);
  }
  return () => {
    seed = Math.imul(seed ^ (seed >>> 16), 2246822507);
    seed = Math.imul(seed ^ (seed >>> 13), 3266489909);
    const t = (seed ^= seed >>> 16) >>> 0;
    return t / 4294967296;
  };
}

function createWallMesh({ length, height, thickness, material }) {
  const geometry = new THREE.BoxGeometry(length, height, thickness);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.isCollider = true;
  return mesh;
}

function positionWallSegments(direction, halfLength, thickness, segments) {
  for (const mesh of segments) {
    if (!mesh) continue;
    const { length } = mesh.geometry.parameters;
    const offset = halfLength - thickness / 2;
    if (direction === 'north') {
      mesh.position.z = -offset;
      mesh.position.y = mesh.geometry.parameters.height / 2;
    } else if (direction === 'south') {
      mesh.position.z = offset;
      mesh.position.y = mesh.geometry.parameters.height / 2;
    } else if (direction === 'west') {
      mesh.position.x = -offset;
      mesh.position.y = mesh.geometry.parameters.height / 2;
      mesh.rotation.y = Math.PI / 2;
    } else if (direction === 'east') {
      mesh.position.x = offset;
      mesh.position.y = mesh.geometry.parameters.height / 2;
      mesh.rotation.y = Math.PI / 2;
    }
  }
}

function createCorridorWall({
  direction,
  corridorSize,
  door,
  material,
  doorMaterial
}) {
  const { CEILING_HEIGHT, WALL_THICKNESS, DOOR_WIDTH_RATIO, DOOR_HEIGHT, DOOR_DEPTH } = LEVEL19_CONSTANTS;
  const halfLength = corridorSize / 2;
  const doorWidth = door
    ? Math.max(Math.min(corridorSize * DOOR_WIDTH_RATIO, corridorSize - 1.5), corridorSize * 0.2)
    : 0;

  if (!door) {
    const wall = createWallMesh({ length: corridorSize, height: CEILING_HEIGHT, thickness: WALL_THICKNESS, material });
    positionWallSegments(direction, halfLength, WALL_THICKNESS, [wall]);
    return { segments: [wall], doorMesh: null };
  }

  const remaining = corridorSize - doorWidth;
  const sideLength = Math.max(remaining / 2, 0);

  const wallSegments = [];
  if (sideLength > 0.25) {
    const left = createWallMesh({ length: sideLength, height: CEILING_HEIGHT, thickness: WALL_THICKNESS, material });
    const right = createWallMesh({ length: sideLength, height: CEILING_HEIGHT, thickness: WALL_THICKNESS, material });

    if (direction === 'north' || direction === 'south') {
      left.position.x = -doorWidth / 2 - sideLength / 2;
      right.position.x = doorWidth / 2 + sideLength / 2;
    } else {
      left.position.z = -doorWidth / 2 - sideLength / 2;
      right.position.z = doorWidth / 2 + sideLength / 2;
    }
    wallSegments.push(left, right);
  }

  positionWallSegments(direction, halfLength, WALL_THICKNESS, wallSegments);

  const doorGeometry = direction === 'north' || direction === 'south'
    ? new THREE.BoxGeometry(doorWidth, DOOR_HEIGHT, DOOR_DEPTH)
    : new THREE.BoxGeometry(DOOR_DEPTH, DOOR_HEIGHT, doorWidth);
  const doorMesh = new THREE.Mesh(doorGeometry, doorMaterial);
  doorMesh.castShadow = false;
  doorMesh.receiveShadow = false;
  doorMesh.position.y = DOOR_HEIGHT / 2;

  const offset = halfLength - WALL_THICKNESS / 2 + DOOR_DEPTH / 2;
  if (direction === 'north') {
    doorMesh.position.z = -offset;
  } else if (direction === 'south') {
    doorMesh.position.z = offset;
  } else if (direction === 'west') {
    doorMesh.position.x = -offset;
  } else if (direction === 'east') {
    doorMesh.position.x = offset;
  }

  if (direction === 'east' || direction === 'west') {
    doorMesh.rotation.y = Math.PI / 2;
  }

  return { segments: wallSegments, doorMesh };
}

function createRoomWall({ direction, width, depth, door, material }) {
  const { CEILING_HEIGHT, WALL_THICKNESS, DOOR_WIDTH_RATIO } = LEVEL19_CONSTANTS;
  const length = direction === 'north' || direction === 'south' ? width : depth;
  const halfLength = length / 2;
  const doorWidth = door ? Math.max(Math.min(length * DOOR_WIDTH_RATIO, length - 1), length * 0.2) : 0;
  const segments = [];

  if (!door) {
    const wall = createWallMesh({ length, height: CEILING_HEIGHT, thickness: WALL_THICKNESS, material });
    wall.position.y = CEILING_HEIGHT / 2;
    if (direction === 'north') wall.position.z = -depth / 2 + WALL_THICKNESS / 2;
    if (direction === 'south') wall.position.z = depth / 2 - WALL_THICKNESS / 2;
    if (direction === 'west') {
      wall.position.x = -width / 2 + WALL_THICKNESS / 2;
      wall.rotation.y = Math.PI / 2;
    }
    if (direction === 'east') {
      wall.position.x = width / 2 - WALL_THICKNESS / 2;
      wall.rotation.y = Math.PI / 2;
    }
    return [wall];
  }

  const remaining = length - doorWidth;
  const sideLength = Math.max(remaining / 2, 0);
  if (sideLength <= 0.3) {
    return [];
  }

  const left = createWallMesh({ length: sideLength, height: CEILING_HEIGHT, thickness: WALL_THICKNESS, material });
  const right = createWallMesh({ length: sideLength, height: CEILING_HEIGHT, thickness: WALL_THICKNESS, material });

  if (direction === 'north' || direction === 'south') {
    left.position.x = -doorWidth / 2 - sideLength / 2;
    right.position.x = doorWidth / 2 + sideLength / 2;
    const zPos = direction === 'north' ? -depth / 2 + WALL_THICKNESS / 2 : depth / 2 - WALL_THICKNESS / 2;
    left.position.z = zPos;
    right.position.z = zPos;
    left.position.y = CEILING_HEIGHT / 2;
    right.position.y = CEILING_HEIGHT / 2;
  } else {
    left.position.z = -doorWidth / 2 - sideLength / 2;
    right.position.z = doorWidth / 2 + sideLength / 2;
    const xPos = direction === 'west' ? -width / 2 + WALL_THICKNESS / 2 : width / 2 - WALL_THICKNESS / 2;
    left.position.x = xPos;
    right.position.x = xPos;
    left.position.y = CEILING_HEIGHT / 2;
    right.position.y = CEILING_HEIGHT / 2;
    left.rotation.y = Math.PI / 2;
    right.rotation.y = Math.PI / 2;
  }

  return [left, right];
}

function isMurderRoom(room) {
  if (!room) return false;
  if (room.type === 'murder') return true;
  const meta = room.metadata || {};
  const candidates = [];
  for (const value of Object.values(meta)) {
    if (typeof value === 'string') candidates.push(value.toLowerCase());
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string') candidates.push(entry.toLowerCase());
      }
    }
  }
  return candidates.some((value) => value.includes('murder') || value.includes('blood'));
}

function populateMurderRoom(group, room, materials, colliderMeshes) {
  const rng = seededRandom(room.id || 'murder-room');
  const tableWidth = 2.4;
  const tableDepth = 1.2;
  const tableHeight = 0.9;
  const table = new THREE.Mesh(new THREE.BoxGeometry(tableWidth, tableHeight, tableDepth), materials.desk);
  table.position.y = tableHeight / 2;
  group.add(table);
  table.userData.isCollider = true;
  colliderMeshes.push(table);

  const goreCount = 4;
  for (let i = 0; i < goreCount; i += 1) {
    const partWidth = 0.4 + rng() * 0.4;
    const partHeight = 0.18 + rng() * 0.2;
    const partDepth = 0.3 + rng() * 0.3;
    const bodyPart = new THREE.Mesh(new THREE.BoxGeometry(partWidth, partHeight, partDepth), materials.bodyPart);
    bodyPart.position.set(
      (rng() - 0.5) * Math.min(room.size.width * 0.6, 6),
      partHeight / 2 + 0.02,
      (rng() - 0.5) * Math.min(room.size.depth * 0.6, 6)
    );
    group.add(bodyPart);
  }

  const redLight = new THREE.PointLight(0x912323, 0.85, Math.max(room.size.width, room.size.depth) * 1.1, 1.8);
  redLight.position.set(0, LEVEL19_CONSTANTS.CEILING_HEIGHT - 0.2, 0);
  group.add(redLight);
}

function createDesk(deskId, materials) {
  const deskGroup = new THREE.Group();
  deskGroup.name = `Desk-${deskId}`;
  const { DESK_HEIGHT, DESK_WIDTH, DESK_DEPTH } = LEVEL19_CONSTANTS;
  const topThickness = 0.08;
  const top = new THREE.Mesh(new THREE.BoxGeometry(DESK_WIDTH, topThickness, DESK_DEPTH), materials.desk);
  top.position.y = DESK_HEIGHT;
  top.castShadow = false;
  top.receiveShadow = false;
  deskGroup.add(top);

  const legGeometry = new THREE.BoxGeometry(0.08, DESK_HEIGHT, 0.08);
  const legPositions = [
    [-DESK_WIDTH / 2 + 0.08, DESK_HEIGHT / 2, -DESK_DEPTH / 2 + 0.08],
    [DESK_WIDTH / 2 - 0.08, DESK_HEIGHT / 2, -DESK_DEPTH / 2 + 0.08],
    [-DESK_WIDTH / 2 + 0.08, DESK_HEIGHT / 2, DESK_DEPTH / 2 - 0.08],
    [DESK_WIDTH / 2 - 0.08, DESK_HEIGHT / 2, DESK_DEPTH / 2 - 0.08]
  ];
  for (const [x, y, z] of legPositions) {
    const leg = new THREE.Mesh(legGeometry.clone(), materials.desk);
    leg.position.set(x, y, z);
    leg.castShadow = false;
    leg.receiveShadow = false;
    deskGroup.add(leg);
  }

  const chairHeight = LEVEL19_CONSTANTS.CHAIR_HEIGHT;
  const chairSeat = new THREE.Mesh(
    new THREE.BoxGeometry(LEVEL19_CONSTANTS.CHAIR_WIDTH, 0.08, LEVEL19_CONSTANTS.CHAIR_DEPTH),
    materials.chair
  );
  chairSeat.position.set(0, chairHeight, DESK_DEPTH / 2 + 0.25);
  deskGroup.add(chairSeat);

  const chairBack = new THREE.Mesh(new THREE.BoxGeometry(LEVEL19_CONSTANTS.CHAIR_WIDTH, chairHeight, 0.08), materials.chair);
  chairBack.position.set(0, chairHeight / 2 + chairHeight, DESK_DEPTH / 2 + 0.25 + LEVEL19_CONSTANTS.CHAIR_DEPTH / 2);
  deskGroup.add(chairBack);

  top.userData.interaction = { type: 'desk', deskId };
  top.userData.isCollider = true;

  return { group: deskGroup, interactionMesh: top };
}

function createCorridorGroup(corridor, doorLookup, materials, options) {
  const corridorSize = ensureNumber(options.segmentLength, 20);
  const group = new THREE.Group();
  group.name = `Corridor-${corridor.id}`;
  group.position.set(corridor.world.x, 0, corridor.world.y);

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(corridorSize, LEVEL19_CONSTANTS.FLOOR_THICKNESS, corridorSize),
    materials.floor
  );
  floor.position.y = -LEVEL19_CONSTANTS.FLOOR_THICKNESS / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(corridorSize, LEVEL19_CONSTANTS.FLOOR_THICKNESS, corridorSize),
    materials.ceiling
  );
  ceiling.position.y = LEVEL19_CONSTANTS.CEILING_HEIGHT;
  ceiling.receiveShadow = false;
  group.add(ceiling);

  const colliderMeshes = [];
  const interactiveMeshes = [];
  const doorMeshes = new Map();

  const connections = new Set((corridor.connections || []).map((conn) => conn.direction));
  const corridorDoors = (corridor.doors || []).map((doorId) => doorLookup.get(doorId)).filter(Boolean);
  const doorByDirection = new Map(corridorDoors.map((door) => [door.direction, door]));

  for (const direction of CARDINAL_DIRECTIONS) {
    const hasNeighbour = connections.has(direction);
    const door = doorByDirection.get(direction);
    if (hasNeighbour && !door) continue;

    const { segments, doorMesh } = createCorridorWall({
      direction,
      corridorSize,
      door,
      material: materials.wall,
      doorMaterial: materials.door
    });

    for (const wall of segments) {
      group.add(wall);
      colliderMeshes.push(wall);
    }

    if (doorMesh) {
      doorMesh.userData.interaction = { type: 'door', doorId: door.id, roomId: door.roomId, direction: door.direction };
      group.add(doorMesh);
      interactiveMeshes.push(doorMesh);
      doorMeshes.set(door.id, doorMesh);
    }
  }

  const fillLight = new THREE.PointLight(0xf6edcc, 0.35, corridorSize * 1.6, 1.6);
  fillLight.position.set(0, LEVEL19_CONSTANTS.CEILING_HEIGHT - 0.2, 0);
  group.add(fillLight);

  return { group, colliderMeshes, interactiveMeshes, doorMeshes };
}

function createRoomGroup(room, doorLookup, materials, deskLookup) {
  const width = ensureNumber(room.size?.width, 16);
  const depth = ensureNumber(room.size?.depth, 12);
  const group = new THREE.Group();
  group.name = `Room-${room.id}`;
  group.position.set(room.world.x, 0, room.world.y);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(width, LEVEL19_CONSTANTS.FLOOR_THICKNESS, depth), materials.floor);
  floor.position.y = -LEVEL19_CONSTANTS.FLOOR_THICKNESS / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(width, LEVEL19_CONSTANTS.FLOOR_THICKNESS, depth), materials.ceiling);
  ceiling.position.y = LEVEL19_CONSTANTS.CEILING_HEIGHT;
  group.add(ceiling);

  const colliderMeshes = [];
  const interactiveMeshes = [];

  const door = doorLookup.get(room.doorId);
  const murder = isMurderRoom(room);
  for (const direction of CARDINAL_DIRECTIONS) {
    const wallDoor = door && door.direction === direction ? door : null;
    const walls = createRoomWall({ direction, width, depth, door: wallDoor, material: murder ? materials.murderWall : materials.wall });
    for (const wall of walls) {
      group.add(wall);
      colliderMeshes.push(wall);
    }
  }

  if (room.type === 'cubicle' && Array.isArray(room.desks)) {
    for (const deskId of room.desks) {
      const deskWorld = deskLookup?.get?.(deskId);
      const { group: deskGroup, interactionMesh } = createDesk(deskId, materials);
      if (deskWorld) {
        deskGroup.position.set(deskWorld.position.x - room.world.x, 0, deskWorld.position.y - room.world.y);
      }
      group.add(deskGroup);
      interactionMesh.userData.roomId = room.id;
      colliderMeshes.push(interactionMesh);
      interactiveMeshes.push(interactionMesh);
    }
  } else if (room.desks && room.desks.length) {
    for (const deskId of room.desks) {
      const deskWorld = deskLookup?.get?.(deskId);
      const { group: deskGroup, interactionMesh } = createDesk(deskId, materials);
      if (deskWorld) {
        deskGroup.position.set(deskWorld.position.x - room.world.x, 0, deskWorld.position.y - room.world.y);
      }
      group.add(deskGroup);
      interactionMesh.userData.roomId = room.id;
      colliderMeshes.push(interactionMesh);
      interactiveMeshes.push(interactionMesh);
    }
  }

  if (murder) {
    populateMurderRoom(group, room, materials, colliderMeshes);
  } else {
    const lightColour = room.type === 'cubicle' ? 0xf3e5bc : 0xf1dfc9;
    const lightIntensity = room.type === 'cubicle' ? 0.6 : 0.4;
    const roomLight = new THREE.PointLight(lightColour, lightIntensity, Math.max(width, depth) * 1.3, 1.8);
    roomLight.position.set(0, LEVEL19_CONSTANTS.CEILING_HEIGHT - 0.25, 0);
    group.add(roomLight);
  }

  return { group, colliderMeshes, interactiveMeshes };
}

function determineElevatorOrientation(corridor) {
  if (!corridor) return 'south';
  const connected = new Set((corridor.connections || []).map((conn) => conn.direction));
  for (const direction of CARDINAL_DIRECTIONS) {
    if (!connected.has(direction)) return direction;
  }
  return corridor.connections?.[0]?.direction || 'south';
}

function createElevator(elevator, corridorLookup, materials) {
  if (!elevator) return null;
  const group = new THREE.Group();
  group.name = 'Elevator';
  group.position.set(elevator.position.x, 0, elevator.position.y);

  const width = 3.2;
  const height = 3.0;
  const depth = 0.4;

  const frameMaterial = materials.trim || materials.door;
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.18, height, depth), frameMaterial);
  const right = new THREE.Mesh(new THREE.BoxGeometry(0.18, height, depth), frameMaterial);
  left.position.set(-width / 2, height / 2, 0);
  right.position.set(width / 2, height / 2, 0);
  group.add(left, right);

  const header = new THREE.Mesh(new THREE.BoxGeometry(width + 0.36, 0.26, depth), frameMaterial);
  header.position.set(0, height - 0.13, 0);
  group.add(header);

  const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(width, height * 0.92, depth * 0.6), materials.elevator);
  doorPanel.position.set(0, height * 0.46, depth * -0.05);
  doorPanel.userData.interaction = { type: 'elevator', id: 'level19-elevator' };
  group.add(doorPanel);

  const light = new THREE.PointLight(0xb7cbff, 0.9, 12, 1.7);
  light.position.set(0, height - 0.2, 0.2);
  group.add(light);

  const corridor = corridorLookup?.get?.(elevator.corridorId);
  const facing = determineElevatorOrientation(corridor);
  if (facing === 'north') {
    group.rotation.y = Math.PI;
  } else if (facing === 'east') {
    group.rotation.y = -Math.PI / 2;
  } else if (facing === 'west') {
    group.rotation.y = Math.PI / 2;
  }

  group.userData.isCollider = true;
  doorPanel.userData.isCollider = true;
  return { group, colliderMeshes: [doorPanel], interactiveMeshes: [doorPanel] };
}

export function createLevel19Environment(levelData, materials, options = {}) {
  if (!levelData) throw new Error('Level data is required to create the environment.');
  const sceneGroup = new THREE.Group();
  sceneGroup.name = 'Level19Environment';

  const doorLookup = new Map((levelData.doors || []).map((door) => [door.id, door]));
  const corridorLookup = new Map((levelData.corridors || []).map((corridor) => [corridor.id, corridor]));
  const deskLookup = levelData.deskLookup instanceof Map ? levelData.deskLookup : new Map();

  const colliderMeshes = [];
  const interactiveMeshes = [];
  const doorMeshes = new Map();
  const roomGroups = new Map();
  const corridorGroups = new Map();

  const segmentLength = ensureNumber(levelData.config?.corridorSegmentLength, 20);

  for (const corridor of levelData.corridors || []) {
    const { group, colliderMeshes: corridorColliders, interactiveMeshes: corridorInteractives, doorMeshes: corridorDoors } =
      createCorridorGroup(corridor, doorLookup, materials, { segmentLength });
    sceneGroup.add(group);
    corridorGroups.set(corridor.id, { group, data: corridor });
    colliderMeshes.push(...corridorColliders);
    interactiveMeshes.push(...corridorInteractives);
    for (const [id, mesh] of corridorDoors.entries()) {
      doorMeshes.set(id, mesh);
    }
  }

  for (const room of levelData.rooms || []) {
    const { group, colliderMeshes: roomColliders, interactiveMeshes: roomInteractives } = createRoomGroup(room, doorLookup, materials, deskLookup);
    sceneGroup.add(group);
    roomGroups.set(room.id, { group, data: room });
    colliderMeshes.push(...roomColliders);
    interactiveMeshes.push(...roomInteractives);
  }

  const elevator = createElevator(levelData.elevator, corridorLookup, materials);
  if (elevator) {
    sceneGroup.add(elevator.group);
    colliderMeshes.push(...elevator.colliderMeshes);
    interactiveMeshes.push(...elevator.interactiveMeshes);
  }

  return {
    group: sceneGroup,
    colliderMeshes,
    interactiveMeshes,
    doorMeshes,
    roomGroups,
    corridorGroups,
    elevatorMesh: elevator ? elevator.group : null
  };
}

export function createPistolViewModel(materials, options = {}) {
  const group = new THREE.Group();
  group.name = 'PlayerPistol';
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.9), materials.pistolBody || materials.pistol || materials.door);
  body.position.set(0, -0.02, -0.45);
  group.add(body);

  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.18, 0.6), materials.pistolBody || materials.pistol || materials.door);
  slide.position.set(0, 0.08, -0.3);
  group.add(slide);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.25), materials.pistolGrip || materials.pistolBody || materials.door);
  grip.position.set(-0.08, -0.28, -0.1);
  grip.rotation.x = THREE.MathUtils.degToRad(18);
  group.add(grip);

  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 12), materials.pistolBody || materials.door);
  muzzle.rotation.z = Math.PI / 2;
  muzzle.position.set(0, 0.02, -0.93);
  group.add(muzzle);

  group.position.set(0.42, -0.42, -0.9);
  group.rotation.set(THREE.MathUtils.degToRad(-6), THREE.MathUtils.degToRad(6), THREE.MathUtils.degToRad(-4));

  return {
    group,
    parts: { body, slide, grip, muzzle }
  };
}

export function updatePistolViewModel(pistol, state = {}) {
  if (!pistol) return;
  const { recoil = 0, swayX = 0, swayY = 0 } = state;
  const recoilOffset = Math.min(Math.max(recoil, 0), 1);
  const recoilTranslation = recoilOffset * 0.08;
  const recoilRotation = recoilOffset * THREE.MathUtils.degToRad(-6);

  pistol.group.position.z = -0.9 - recoilTranslation;
  pistol.group.rotation.x = THREE.MathUtils.degToRad(-6) + recoilRotation;
  pistol.group.position.x = 0.42 + swayX * 0.02;
  pistol.group.position.y = -0.42 + swayY * 0.02;
}

export function computeStaticColliders(meshes, expand = 0) {
  const boxes = [];
  const expansion = new THREE.Vector3(expand, expand, expand);
  for (const mesh of meshes) {
    if (!mesh) continue;
    mesh.updateWorldMatrix(true, true);
    const geometry = mesh.geometry;
    if (!geometry) continue;
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }
    const box = geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
    if (expand > 0) {
      box.expandByVector(expansion);
    }
    boxes.push(box);
  }
  return boxes;
}
