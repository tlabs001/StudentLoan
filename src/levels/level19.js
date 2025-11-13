import { generateLevel19Layout, __level19Defaults } from '../world/generation.js';
import { ExecutiveController, EXECUTIVE_DEFAULTS } from '../entities/executive.js';
import { createDefaultCollectibleManager } from '../items/collectibles.js';
import { CrosshairHUD, updateCrosshairForRaycast } from '../ui/hud.js';

export const CUBICLE_ROOM_PROB = 0.005;
export const DOOR_PROB = 0.15;
export const MAP_SIZE = 200;

/**
 * === Level 19 tuning constants =================================================
 * These values intentionally live at the top of the file so that designers can
 * tweak the length and pacing of the experience without diving into the
 * implementation.
 */
export const LEVEL19_TUNING = {
  /** Corridor length in world units. Larger values create longer hallways. */
  CORRIDOR_SEGMENT_LENGTH: __level19Defaults.corridorSegmentLength,
  /** Minimum length of a straight corridor segment in grid cells. */
  MIN_SEGMENT_LENGTH: __level19Defaults.minSegmentLength,
  /** Maximum length of a straight corridor segment in grid cells. */
  MAX_SEGMENT_LENGTH: __level19Defaults.maxSegmentLength,
  /** Probability that carving branches into an orthogonal corridor. */
  BRANCH_PROBABILITY: __level19Defaults.branchProbability,
  /** Chance that a segment turns mid-run, generating corners. */
  TURN_PROBABILITY: __level19Defaults.turnProbability,
  /** Bias for extending deeper corridors when stuck. */
  REVISIT_DEPTH_BIAS: __level19Defaults.revisitDepthBias,
  /** Probability that a wall spawns a door. */
  DOOR_PROBABILITY: DOOR_PROB,
  /** Probability that a door leads to a cubicle mega-room. */
  CUBICLE_ROOM_PROBABILITY: CUBICLE_ROOM_PROB,
  /** Size of the generated corridor lattice in cells. */
  MAP_SIZE,
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
      mapSize: LEVEL19_TUNING.MAP_SIZE,
      minSegmentLength: LEVEL19_TUNING.MIN_SEGMENT_LENGTH,
      maxSegmentLength: LEVEL19_TUNING.MAX_SEGMENT_LENGTH,
      branchProbability: LEVEL19_TUNING.BRANCH_PROBABILITY,
      turnProbability: LEVEL19_TUNING.TURN_PROBABILITY,
      revisitDepthBias: LEVEL19_TUNING.REVISIT_DEPTH_BIAS,
      doorProbability: LEVEL19_TUNING.DOOR_PROBABILITY,
      cubicleRoomProbability: LEVEL19_TUNING.CUBICLE_ROOM_PROBABILITY
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
