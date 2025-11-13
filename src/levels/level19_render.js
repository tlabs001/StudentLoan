import * as THREE from 'three';
import { createRenderEngine } from '../render/engine.js';
import { createLevel19Materials, disposeMaterials } from '../render/materials.js';
import {
  createLevel19Environment,
  createPistolViewModel,
  updatePistolViewModel,
  computeStaticColliders,
  LEVEL19_DIMENSIONS
} from '../render/objects.js';
import { initPointerLockControls } from '../render/fpsControls.js';
import { createExecutiveRenderManager } from '../entities/executive_render.js';

const DEFAULT_OPTIONS = {
  fogDensity: 0.015,
  movementSpeed: 4.6,
  collisionRadius: 0.62,
  eyeHeight: 1.68,
  raycastDistance: 64,
  visibilityRadius: 9
};

function mapWorldTo3D(position) {
  if (!position) return new THREE.Vector3();
  const x = position.x ?? 0;
  const z = (position.y ?? position.z) ?? 0;
  const y = position.z ?? 0;
  return new THREE.Vector3(x, y, z);
}

function extractInteraction(object) {
  let current = object;
  while (current) {
    if (current.userData && current.userData.interaction) {
      return current.userData.interaction;
    }
    current = current.parent;
  }
  return null;
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function renderLevel19Scene(levelData, player = {}, options = {}) {
  if (!levelData) {
    throw new Error('renderLevel19Scene requires the generated Level 19 layout data.');
  }

  const settings = { ...DEFAULT_OPTIONS, ...options };
  const canvas = settings.canvas || document.getElementById('game');
  const engine = createRenderEngine({ canvas, fogDensity: settings.fogDensity });
  const materials = settings.materials || createLevel19Materials(settings.materialOverrides || {});
  const environment = createLevel19Environment(levelData, materials, settings.environment);
  engine.scene.add(environment.group);

  const shouldDisposeMaterials = !settings.materials;

  const colliderBoxes = computeStaticColliders(environment.colliderMeshes, settings.colliderExpansion ?? 0.02);
  const controls = initPointerLockControls(engine.camera, engine.renderer.domElement, {
    speed: settings.movementSpeed,
    eyeHeight: settings.eyeHeight,
    collisionRadius: settings.collisionRadius,
    lookSpeed: settings.lookSpeed
  });
  controls.setColliders(colliderBoxes);

  const spawn = levelData.spawn?.position || { x: 0, y: 0, z: 0 };
  const initialX = player.position?.x ?? spawn.x;
  const initialZ = player.position?.y ?? spawn.y;
  engine.camera.position.set(initialX, settings.eyeHeight, initialZ);

  const pistol = createPistolViewModel(materials);
  engine.camera.add(pistol.group);
  let recoil = 0;

  const executiveManager = createExecutiveRenderManager(engine.scene, { materials });

  const raycaster = new THREE.Raycaster();
  raycaster.near = 0.1;
  raycaster.far = settings.raycastDistance;
  const losRaycaster = new THREE.Raycaster();
  losRaycaster.near = 0.1;

  const staticRaycastTargets = environment.interactiveMeshes.slice();
  const blockerTargets = environment.colliderMeshes.slice();

  const segmentLength = levelData.config?.corridorSegmentLength || 20;
  let elapsedTime = 0;

  function updatePlayerState() {
    if (!player) return;
    if (!player.position) {
      player.position = { x: 0, y: 0, z: 0 };
    }
    const camPos = engine.camera.position;
    player.position.x = camPos.x;
    player.position.y = camPos.z;
    player.position.z = 0;

    const forward = new THREE.Vector3();
    engine.camera.getWorldDirection(forward);
    player.viewDirection = { x: forward.x, y: forward.z, z: forward.y };
  }

  function collectRaycastTargets() {
    const executiveMeshes = executiveManager.getMeshes();
    return [...staticRaycastTargets, ...executiveMeshes];
  }

  function resolveBlockedHit(hit, blockers) {
    if (!hit) return null;
    if (!blockers || !blockers.length) return hit;

    const targetInteraction = extractInteraction(hit.object);

    for (const blocker of blockers) {
      if (blocker.object === hit.object) return hit;
      const blockerInteraction = extractInteraction(blocker.object);
      if (blockerInteraction && blockerInteraction === targetInteraction) return hit;
      if (blocker.distance + 0.01 < hit.distance) {
        return null;
      }
    }
    return hit;
  }

  function performRaycast() {
    raycaster.setFromCamera({ x: 0, y: 0 }, engine.camera);
    raycaster.far = settings.raycastDistance;
    const targets = collectRaycastTargets();
    if (!targets.length) return null;
    const intersects = raycaster.intersectObjects(targets, true);
    if (!intersects.length) return null;
    const blockers = blockerTargets.length ? raycaster.intersectObjects(blockerTargets, true) : null;

    for (const intersection of intersects) {
      const interaction = extractInteraction(intersection.object);
      if (!interaction) continue;
      const resolved = resolveBlockedHit(intersection, blockers);
      if (!resolved) continue;
      return {
        ...interaction,
        distance: intersection.distance,
        point: intersection.point,
        object: intersection.object
      };
    }
    return null;
  }

  function hasLineOfSight(from, to) {
    if (!from || !to) return false;
    const origin = mapWorldTo3D(from).clone();
    origin.y = LEVEL19_DIMENSIONS.CEILING_HEIGHT * 0.5;
    const target = mapWorldTo3D(to).clone();
    target.y = settings.eyeHeight * 0.9;
    const direction = target.clone().sub(origin);
    const distance = direction.length();
    if (distance === 0) return true;
    direction.normalize();
    losRaycaster.set(origin, direction);
    losRaycaster.far = distance;
    const blockers = losRaycaster.intersectObjects(blockerTargets, true);
    return blockers.length === 0;
  }

  function updateVisibility() {
    if (!settings.visibilityRadius) return;
    const cam = engine.camera.position;
    const camGrid = { x: Math.round(cam.x / segmentLength), y: Math.round(cam.z / segmentLength) };

    for (const entry of environment.corridorGroups.values()) {
      const dist = manhattan(camGrid, entry.data.grid);
      entry.group.visible = dist <= settings.visibilityRadius;
    }

    for (const entry of environment.roomGroups.values()) {
      const dx = entry.data.world.x - cam.x;
      const dz = entry.data.world.y - cam.z;
      const dist = Math.sqrt(dx * dx + dz * dz) / segmentLength;
      entry.group.visible = dist <= settings.visibilityRadius + 2;
    }
  }

  function syncExecutives(dt) {
    const controller = settings.executiveController;
    const executives = controller?.executives || [];
    executiveManager.syncExecutives(executives, elapsedTime);
  }

  function update(dt) {
    const delta = Number.isFinite(dt) ? dt : 0;
    elapsedTime += delta;
    controls.update(delta);
    updatePlayerState();
    syncExecutives(delta);
    updateVisibility();

    recoil = Math.max(0, recoil - delta * 2.4);
    const sway = controls.getSwayAmount();
    updatePistolViewModel(pistol, { recoil, swayX: sway.x, swayY: sway.y });
  }

  function render(delta) {
    update(delta);
    engine.renderer.render(engine.scene, engine.camera);
  }

  function shoot(damage = settings.playerDamage || 10) {
    recoil = Math.min(1, recoil + 0.5);
    const hit = performRaycast();
    if (hit && (hit.type === 'executive' || hit.type === 'enemy')) {
      const controller = settings.executiveController;
      if (controller && typeof controller.handlePlayerShot === 'function') {
        controller.handlePlayerShot(hit.id, damage);
      }
    }
    return hit;
  }

  function dispose() {
    engine.camera.remove(pistol.group);
    executiveManager.dispose();
    controls.dispose();
    engine.scene.remove(environment.group);
    environment.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose?.();
    });
    if (shouldDisposeMaterials) {
      disposeMaterials(materials);
    }
    engine.dispose();
  }

  return {
    engine,
    scene: engine.scene,
    camera: engine.camera,
    controls,
    materials,
    environment,
    update,
    render,
    performRaycast,
    shoot,
    hasLineOfSight,
    dispose,
    getRaycastTargets: collectRaycastTargets
  };
}
