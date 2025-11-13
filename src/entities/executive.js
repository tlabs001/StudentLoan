/**
 * Executive enemy implementation for Level 19.
 *
 * The executives are inspired by Slenderman-style entities: they stalk the
 * player slowly, only dealing damage when observed directly.  This module does
 * not depend on the rendering layer and simply focuses on behaviour logic so it
 * can be reused in unit tests.
 */

const DEFAULT_EXECUTIVE_OPTIONS = {
  health: 60,
  speed: 1.2,
  stalkingSpeed: 0.9,
  attackRange: 6,
  lookAngleDegrees: 18,
  damagePerSecond: 10,
  debtPercentPerSecond: 0.05,
  despawnDistance: 56,
  respawnCooldown: 40,
  banishOnKill: false
};

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function length3(vec) {
  return Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
}

function normalise(vec) {
  const mag = length3(vec);
  if (mag === 0) return { x: 0, y: 0, z: 0 };
  return { x: vec.x / mag, y: vec.y / mag, z: vec.z / mag };
}

function dot3(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function subtract3(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) };
}

function scale3(vec, scale) {
  return { x: vec.x * scale, y: vec.y * scale, z: (vec.z || 0) * scale };
}

function add3(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: (a.z || 0) + (b.z || 0) };
}

export class Executive {
  constructor(options = {}) {
    const opts = { ...DEFAULT_EXECUTIVE_OPTIONS, ...options };
    this.position = { x: opts.x ?? 0, y: opts.y ?? 0, z: opts.z ?? 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.health = opts.health;
    this.maxHealth = opts.health;
    this.speed = opts.speed;
    this.stalkingSpeed = opts.stalkingSpeed;
    this.attackRange = opts.attackRange;
    this.lookAngle = (opts.lookAngleDegrees * Math.PI) / 180;
    this.damagePerSecond = opts.damagePerSecond;
    this.debtPercentPerSecond = opts.debtPercentPerSecond;
    this.despawnDistance = opts.despawnDistance;
    this.respawnCooldown = opts.respawnCooldown;
    this.banishOnKill = opts.banishOnKill;
    this.targetPlayerId = null;
    this.timeSinceSeen = 0;
    this.cooldown = 0;
    this.id = opts.id || `executive-${Math.random().toString(36).slice(2, 9)}`;
    this.state = 'stalking';
    this.isBanished = false;
    this.pendingRespawn = false;
  }

  /**
   * Update the executive each frame.  The context object is expected to contain
   * the player reference and helper functions for line-of-sight checks.
   */
  update(dt, context) {
    if (this.isBanished) return;
    if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      return;
    }

    const { player, hasLineOfSight } = context;
    if (!player) return;

    const playerPosition = player.position || player;
    const toPlayer = subtract3(playerPosition, this.position);
    const distance = length3(toPlayer);
    const direction = distance > 0 ? normalise(toPlayer) : { x: 0, y: 0, z: 0 };

    const playerView = normalise(player.viewDirection || { x: 0, y: 0, z: 1 });
    const los = typeof hasLineOfSight === 'function' ? hasLineOfSight(this.position, playerPosition) : true;

    const dot = clamp01((dot3(playerView, normalise(subtract3(this.position, playerPosition))) + 1) / 2);
    const viewingAngle = Math.acos(Math.min(1, Math.max(-1, dot3(playerView, normalise(toPlayer)) || 0)));
    const isBeingLookedAt = los && viewingAngle <= this.lookAngle;

    if (isBeingLookedAt) {
      this.timeSinceSeen = 0;
    } else {
      this.timeSinceSeen += dt;
    }

    // Movement: the executive approaches slowly unless the player is looking
    // directly at them, in which case they pause to stare unsettlingly.
    const moveSpeed = isBeingLookedAt ? this.stalkingSpeed : this.speed;
    this.velocity = scale3(direction, moveSpeed);
    this.position = add3(this.position, scale3(this.velocity, dt));

    if (distance <= this.attackRange && isBeingLookedAt) {
      const damage = this.damagePerSecond * dt;
      const debtRatio = this.debtPercentPerSecond * dt;
      if (typeof player.applyDamage === 'function') {
        player.applyDamage(damage, { source: 'executive' });
      } else if (typeof player.health === 'number') {
        player.health = Math.max(0, player.health - damage);
      }
      if (typeof player.addDebt === 'function') {
        player.addDebt(player.debt * debtRatio, { source: 'executive' });
      } else if (typeof player.debt === 'number') {
        player.debt += player.debt * debtRatio;
      }
    }

    if (distance >= this.despawnDistance && !isBeingLookedAt) {
      this.pendingRespawn = true;
    }
  }

  takeDamage(amount) {
    if (!Number.isFinite(amount) || amount <= 0 || this.isBanished) return false;
    this.health = Math.max(0, this.health - amount);
    if (this.health === 0) {
      if (this.banishOnKill) {
        this.isBanished = true;
      } else {
        this.cooldown = this.respawnCooldown;
        this.health = this.maxHealth;
        this.pendingRespawn = true;
      }
      return true;
    }
    return false;
  }

  teleport(position) {
    this.position = { x: position.x, y: position.y, z: position.z ?? 0 };
    this.pendingRespawn = false;
    this.timeSinceSeen = 0;
  }
}

/**
 * Controls a set of executives, handling spawn logic and respawns to keep the
 * pressure persistent but manageable.
 */
export class ExecutiveController {
  constructor(options = {}) {
    this.executives = [];
    this.maxExecutives = options.maxExecutives ?? 3;
    this.spawnCooldown = options.spawnCooldown ?? 8;
    this.spawnTimer = 0;
    this.respawnBehaviour = options.respawnBehaviour ?? 'relocate';
    this.worldSampler = options.worldSampler;
    this.rng = options.rng || Math.random;
    this.executiveOptions = { ...options.executiveOptions };
  }

  update(dt, context) {
    this.spawnTimer = Math.max(0, this.spawnTimer - dt);

    for (const exec of this.executives) {
      exec.update(dt, context);
      if (exec.pendingRespawn && this.spawnTimer === 0) {
        const destination = this.sampleSpawnPoint(context.player);
        if (destination) {
          exec.teleport(destination);
          exec.pendingRespawn = false;
          this.spawnTimer = this.spawnCooldown;
        }
      }
    }

    // Replace banished executives if the behaviour demands it.
    this.executives = this.executives.filter((exec) => !exec.isBanished);
    while (this.executives.length < this.maxExecutives) {
      const spawnPoint = this.sampleSpawnPoint(context.player);
      if (!spawnPoint) break;
      const executive = new Executive({ ...this.executiveOptions, x: spawnPoint.x, y: spawnPoint.y, z: spawnPoint.z });
      this.executives.push(executive);
    }
  }

  handlePlayerShot(targetId, damage) {
    const exec = this.executives.find((entity) => entity.id === targetId);
    if (!exec) return false;
    return exec.takeDamage(damage);
  }

  sampleSpawnPoint(player) {
    const { worldSampler, rng } = this;
    if (typeof worldSampler === 'function') {
      const result = worldSampler({ player, rng });
      if (result) return result;
    }
    // Fallback spawn logic: position behind the player at a fixed offset.
    const dir = player?.viewDirection ? normalise(player.viewDirection) : { x: 0, y: 1, z: 0 };
    const back = scale3(dir, -24 - (rng() * 12));
    const position = add3(player?.position || { x: 0, y: 0, z: 0 }, back);
    position.y += 4 * (rng() - 0.5);
    return position;
  }
}

export const EXECUTIVE_DEFAULTS = Object.freeze({ ...DEFAULT_EXECUTIVE_OPTIONS });
