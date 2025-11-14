export interface Vector2 {
  x: number;
  y: number;
}

export interface MovementOptions {
  speed?: number;
  sprintMultiplier?: number;
}

export interface MovementInputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  sprint?: boolean;
}

export interface MovementEntity {
  position: Vector2;
  velocity: Vector2;
}

export interface MovementBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const DEFAULT_SPEED = 220;
const DEFAULT_SPRINT_MULTIPLIER = 1.35;

export class TopdownMovementSystem {
  private readonly speed: number;
  private readonly sprintMultiplier: number;

  constructor(options: MovementOptions = {}) {
    this.speed = options.speed ?? DEFAULT_SPEED;
    this.sprintMultiplier = options.sprintMultiplier ?? DEFAULT_SPRINT_MULTIPLIER;
  }

  update(entity: MovementEntity, input: MovementInputState, dt: number, bounds?: MovementBounds) {
    const direction = this.sampleDirection(input);
    const magnitude = direction.x !== 0 || direction.y !== 0 ? 1 : 0;

    if (!entity.velocity) {
      entity.velocity = { x: 0, y: 0 };
    }

    if (magnitude === 0) {
      entity.velocity.x = 0;
      entity.velocity.y = 0;
      return;
    }

    const sprint = input.sprint ? this.sprintMultiplier : 1;
    const speed = this.speed * sprint;

    entity.velocity.x = direction.x * speed;
    entity.velocity.y = direction.y * speed;

    entity.position.x += entity.velocity.x * dt;
    entity.position.y += entity.velocity.y * dt;

    if (bounds) {
      entity.position.x = Math.max(bounds.minX, Math.min(bounds.maxX, entity.position.x));
      entity.position.y = Math.max(bounds.minY, Math.min(bounds.maxY, entity.position.y));
    }
  }

  private sampleDirection(input: MovementInputState): Vector2 {
    let dx = 0;
    let dy = 0;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;

    if (dx === 0 && dy === 0) {
      return { x: 0, y: 0 };
    }

    const length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length };
  }
}
