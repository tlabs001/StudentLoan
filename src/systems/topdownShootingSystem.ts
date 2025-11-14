export interface ShootingInputState {
  fire: boolean;
  angle?: number;
}

export interface ShooterEntity {
  position: { x: number; y: number };
  facing: { x: number; y: number };
  fireCooldown: number;
}

export interface ProjectileSpawner {
  spawnProjectile: (projectile: {
    x: number;
    y: number;
    direction: { x: number; y: number };
    speed: number;
    owner: string;
  }) => void;
}

export interface ShootingOptions {
  projectileSpeed?: number;
  cooldownMs?: number;
}

const DEFAULT_PROJECTILE_SPEED = 540;
const DEFAULT_COOLDOWN = 160;

export class TopdownShootingSystem {
  private readonly projectileSpeed: number;
  private readonly cooldownMs: number;

  constructor(options: ShootingOptions = {}) {
    this.projectileSpeed = options.projectileSpeed ?? DEFAULT_PROJECTILE_SPEED;
    this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN;
  }

  update(entity: ShooterEntity, input: ShootingInputState, dt: number, spawner: ProjectileSpawner) {
    entity.fireCooldown = Math.max(0, entity.fireCooldown - dt * 1000);

    const direction = this.resolveDirection(entity, input);
    entity.facing.x = direction.x;
    entity.facing.y = direction.y;

    if (!input.fire || entity.fireCooldown > 0) {
      return;
    }

    spawner.spawnProjectile({
      x: entity.position.x,
      y: entity.position.y,
      direction,
      speed: this.projectileSpeed,
      owner: 'player'
    });

    entity.fireCooldown = this.cooldownMs;
  }

  private resolveDirection(entity: ShooterEntity, input: ShootingInputState) {
    if (typeof input.angle === 'number') {
      return { x: Math.cos(input.angle), y: Math.sin(input.angle) };
    }
    const length = Math.hypot(entity.facing.x, entity.facing.y) || 1;
    return { x: entity.facing.x / length, y: entity.facing.y / length };
  }
}
