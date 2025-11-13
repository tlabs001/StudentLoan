import { generateLevel19Layout, __level19Defaults } from '../world/generation.js';
import { ExecutiveController, EXECUTIVE_DEFAULTS } from '../entities/executive.js';
import { createDefaultCollectibleManager } from '../items/collectibles.js';
import { CrosshairHUD, updateCrosshairForRaycast } from '../ui/hud.js';

/**
 * === Level 19 tuning constants =================================================
 * These values intentionally live at the top of the file so that designers can
 * tweak the length and pacing of the experience without diving into the
 * implementation.
 */
export const LEVEL19_TUNING = {
  /** Corridor length in world units. Larger values create longer hallways. */
  CORRIDOR_SEGMENT_LENGTH: __level19Defaults.corridorSegmentLength,
  /** Likelihood that any given door produces a room. */
  ROOM_FREQUENCY: __level19Defaults.roomFrequency,
  /** Average number of doors per corridor segment. */
  DOORS_PER_CORRIDOR: __level19Defaults.doorsPerCorridor,
  /** Probability that any given door opens into a cubicle mega-room. */
  CUBICLE_ROOM_PROBABILITY: __level19Defaults.cubicleRoomProbability,
  /** Manhattan distance target for the elevator location. */
  AVERAGE_ELEVATOR_DISTANCE: __level19Defaults.averageElevatorDistance,
  /** Size of the grid in corridor tiles radiating from spawn. */
  GRID_RADIUS: __level19Defaults.gridRadius,
  /** Maximum number of active executives stalking the player. */
  EXECUTIVE_COUNT: 3,
  /** Cooldown before despawned executives reappear elsewhere. */
  EXECUTIVE_RESPAWN_COOLDOWN: 36,
  /** Base despawn distance; beyond this the executive relocates. */
  EXECUTIVE_DESPAWN_DISTANCE: EXECUTIVE_DEFAULTS.despawnDistance
};

const DEFAULT_SEED = 'level19';

function pickRandom(rng, list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[Math.floor(rng() * list.length)];
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export class Level19 {
  constructor(options = {}) {
    this.seed = options.seed ?? DEFAULT_SEED;
    this.player = options.player || null;
    this.layout = null;
    this.collectibles = createDefaultCollectibleManager({
      onPickup: (collectible, ctx) => {
        if (ctx.type === 'deed') {
          this.crosshair?.showToast(`Found deed: ${collectible.title}`);
        } else if (ctx.type === 'key') {
          this.crosshair?.showToast('Elevator key acquired. Find the exit.');
        }
      }
    });
    this.crosshair = null;
    this.executives = null;
    this.executiveRng = mulberry32(0x19f00d);
    this.searchedDesks = new Set();
    this.lastRayResult = null;
    this.onLevelComplete = options.onLevelComplete || (() => {});
  }

  initialise(gameContext = {}) {
    const overrides = {
      corridorSegmentLength: LEVEL19_TUNING.CORRIDOR_SEGMENT_LENGTH,
      gridRadius: LEVEL19_TUNING.GRID_RADIUS,
      doorsPerCorridor: LEVEL19_TUNING.DOORS_PER_CORRIDOR,
      cubicleRoomProbability: LEVEL19_TUNING.CUBICLE_ROOM_PROBABILITY,
      averageElevatorDistance: LEVEL19_TUNING.AVERAGE_ELEVATOR_DISTANCE,
      roomFrequency: LEVEL19_TUNING.ROOM_FREQUENCY
    };
    this.layout = generateLevel19Layout(this.seed, overrides);
    this.collectibles.loadFromLayout(this.layout);
    this.crosshair = new CrosshairHUD(gameContext.crosshairOptions || {});
    this.player = gameContext.player || this.player;
    this.executives = new ExecutiveController({
      maxExecutives: LEVEL19_TUNING.EXECUTIVE_COUNT,
      spawnCooldown: LEVEL19_TUNING.EXECUTIVE_RESPAWN_COOLDOWN,
      worldSampler: ({ player, rng }) => this.sampleExecutiveSpawn(player, rng),
      rng: this.executiveRng,
      executiveOptions: {
        despawnDistance: LEVEL19_TUNING.EXECUTIVE_DESPAWN_DISTANCE,
        damagePerSecond: EXECUTIVE_DEFAULTS.damagePerSecond,
        debtPercentPerSecond: EXECUTIVE_DEFAULTS.debtPercentPerSecond
      }
    });
  }

  update(dt, gameContext = {}) {
    if (!this.player && gameContext.player) {
      this.player = gameContext.player;
    }
    if (!this.player) return;

    const raycastResult = typeof gameContext.performRaycast === 'function'
      ? gameContext.performRaycast()
      : null;
    this.lastRayResult = raycastResult;
    if (raycastResult && (raycastResult.type === 'executive' || raycastResult.type === 'enemy')) {
      updateCrosshairForRaycast(this.crosshair, { type: 'enemy' });
    } else {
      updateCrosshairForRaycast(this.crosshair, null);
    }

    this.executives.update(dt, {
      player: this.player,
      hasLineOfSight: gameContext.hasLineOfSight
    });
  }

  interact(gameContext = {}) {
    if (!this.player) return false;
    const ray = this.lastRayResult;
    if (!ray) return false;

    if (ray.type === 'collectible' && ray.id) {
      return this.collectibles.pickup(ray.id, this.player);
    }

    if (ray.type === 'desk' && ray.deskId) {
      return this.searchDesk(ray.deskId, gameContext);
    }

    if (ray.type === 'elevator') {
      if (this.player.hasElevatorKey) {
        this.onLevelComplete(19, { player: this.player, layout: this.layout });
        return true;
      }
      this.crosshair?.showToast('Locked. Search the cubicles for the key.');
      return false;
    }
    return false;
  }

  searchDesk(deskId, gameContext = {}) {
    if (this.searchedDesks.has(deskId)) {
      this.crosshair?.showToast('Nothing new here.');
      return false;
    }
    this.searchedDesks.add(deskId);
    const desk = this.layout?.deskLookup?.get(deskId);
    if (!desk) {
      this.crosshair?.showToast('Empty drawer.');
      return false;
    }
    if (desk.hasKey) {
      this.collectibles.pickup('elevator-key', this.player);
      return true;
    }
    this.crosshair?.showToast('Just useless paperwork.');
    return false;
  }

  sampleExecutiveSpawn(player, rng = Math.random) {
    if (!this.layout || !player) return null;
    const farCorridors = this.layout.corridors.filter((corridor) => {
      const corridorPos = corridor.grid;
      const playerCoord = worldToGrid(player.position, this.layout.config.corridorSegmentLength);
      const dist = manhattan(corridorPos, playerCoord);
      return dist > 10;
    });
    const chosen = pickRandom(rng, farCorridors);
    if (!chosen) return null;
    return {
      x: chosen.world.x + (rng() - 0.5) * this.layout.config.corridorSegmentLength,
      y: chosen.world.y + (rng() - 0.5) * this.layout.config.corridorSegmentLength,
      z: 0
    };
  }

  destroy() {
    this.crosshair?.destroy();
    this.crosshair = null;
    this.executives = null;
    this.layout = null;
  }
}

export function createLevel19(options = {}) {
  return new Level19(options);
}

function mulberry32(a) {
  return function rng() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function worldToGrid(position, segmentLength) {
  if (!position) return { x: 0, y: 0 };
  return {
    x: Math.round((position.x || 0) / segmentLength),
    y: Math.round((position.y || 0) / segmentLength)
  };
}
