/**
 * Collectible system for Level 19.
 *
 * Collectibles are simple interactable objects that can be picked up by
 * looking at them and pressing the interaction key.  This module keeps the data
 * layer independent of the rendering implementation.
 */

export class Collectible {
  constructor({ id, type, title, text, position, deskId }) {
    this.id = id;
    this.type = type;
    this.title = title;
    this.text = text;
    this.position = position || { x: 0, y: 0, z: 0 };
    this.deskId = deskId ?? null;
    this.collected = false;
  }
}

export class CollectibleManager {
  constructor(options = {}) {
    this.collectibles = new Map();
    this.pickupRadius = options.pickupRadius ?? 2.4;
    this.onPickup = options.onPickup;
  }

  loadFromLayout(layout) {
    if (!layout || !Array.isArray(layout.collectibles)) return;
    for (const data of layout.collectibles) {
      const collectible = new Collectible(data);
      this.collectibles.set(collectible.id, collectible);
    }
  }

  getInteractable(targetId) {
    return this.collectibles.get(targetId) || null;
  }

  raycast(origin, direction, options = {}) {
    const maxDistance = options.maxDistance ?? 6;
    let closest = null;
    let closestDistance = maxDistance;
    for (const collectible of this.collectibles.values()) {
      if (collectible.collected) continue;
      const dist = distanceToRay(origin, direction, collectible.position);
      if (dist < this.pickupRadius && dist < closestDistance) {
        closest = collectible;
        closestDistance = dist;
      }
    }
    return closest;
  }

  pickup(id, player) {
    const collectible = this.collectibles.get(id);
    if (!collectible || collectible.collected) return false;
    collectible.collected = true;

    if (collectible.type === 'deed') {
      if (!Array.isArray(player.deeds)) player.deeds = [];
      player.deeds.push(collectible.title);
      if (typeof this.onPickup === 'function') {
        this.onPickup(collectible, { player, type: 'deed' });
      }
    } else if (collectible.type === 'key') {
      player.hasElevatorKey = true;
      if (typeof this.onPickup === 'function') {
        this.onPickup(collectible, { player, type: 'key' });
      }
    }
    return true;
  }
}

function distanceToRay(origin, direction, point) {
  const dirMag = Math.sqrt(direction.x * direction.x + direction.y * direction.y + (direction.z || 0) * (direction.z || 0));
  if (dirMag === 0) return Infinity;
  const nx = direction.x / dirMag;
  const ny = direction.y / dirMag;
  const nz = (direction.z || 0) / dirMag;
  const px = point.x - origin.x;
  const py = point.y - origin.y;
  const pz = (point.z || 0) - (origin.z || 0);
  const t = px * nx + py * ny + pz * nz;
  if (t < 0) return Infinity;
  const closestX = origin.x + nx * t;
  const closestY = origin.y + ny * t;
  const closestZ = (origin.z || 0) + nz * t;
  const dx = point.x - closestX;
  const dy = point.y - closestY;
  const dz = (point.z || 0) - closestZ;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function createDefaultCollectibleManager(options = {}) {
  return new CollectibleManager(options);
}
