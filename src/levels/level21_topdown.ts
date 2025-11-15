import { generateCorporateLabyrinth } from '../maps/level21_corporate_labyrinth.ts';
import { createJobTerminal, JobTerminalState, resetTerminalCounter } from '../entities/jobTerminal.ts';
import { JobApplicationTerminalUI } from '../ui/jobApplicationTerminalUI.ts';
import { TopdownMovementSystem, MovementEntity } from '../systems/topdownMovementSystem.ts';
import { TopdownShootingSystem } from '../systems/topdownShootingSystem.ts';

export interface Level21Options {
  seed?: string;
  onLevelComplete?: (levelId: string, context?: Record<string, unknown>) => void;
  requiredApplications?: number;
}

interface PlayerState extends MovementEntity {
  facing: { x: number; y: number };
  fireCooldown: number;
}

interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  fire: boolean;
  interact: boolean;
  aimAngle?: number;
}

interface EnemyState {
  id: string;
  position: { x: number; y: number };
  patrolRoute: { x: number; y: number }[];
  patrolIndex: number;
}

const REQUIRED_APPLICATIONS = 35;
const ENEMY_COUNT = 18;
const TERMINAL_COUNT = 5;

export class Level21TopDown {
  readonly id = 'level21_corporate_labyrinth';
  private readonly onComplete: Level21Options['onLevelComplete'];
  private readonly movement: TopdownMovementSystem;
  private readonly shooting: TopdownShootingSystem;
  private readonly ui: JobApplicationTerminalUI;
  private readonly requiredApplications: number;
  private map = generateCorporateLabyrinth();
  private player: PlayerState;
  private enemies: EnemyState[] = [];
  private terminals: JobTerminalState[] = [];
  private appliedJobs = 0;
  private interactionCooldown = 0;

  constructor(options: Level21Options = {}) {
    const seed = options.seed ?? 'level21';
    this.map = generateCorporateLabyrinth({ seed });
    this.onComplete = options.onLevelComplete ?? (() => {});
    this.requiredApplications = options.requiredApplications ?? REQUIRED_APPLICATIONS;

    resetTerminalCounter();
    this.movement = new TopdownMovementSystem({ speed: 230 });
    this.shooting = new TopdownShootingSystem({ projectileSpeed: 600 });
    this.ui = new JobApplicationTerminalUI({
      requiredApplications: this.requiredApplications,
      onApply: () => this.incrementApplications(),
      onClose: () => this.resumePlayerControl(),
      onComplete: () => this.completeLevel()
    });

    const reception = this.map.rooms.find((room) => room.type === 'reception') ?? this.map.rooms[0];
    this.player = {
      position: { ...reception.center },
      velocity: { x: 0, y: 0 },
      facing: { x: 1, y: 0 },
      fireCooldown: 0
    };

    this.spawnEnemies(seed);
    this.spawnTerminals(seed);
  }

  private spawnEnemies(seed: string) {
    const rng = this.createRng(seed + '-enemies');
    this.enemies = [];
    for (let i = 0; i < ENEMY_COUNT; i += 1) {
      const room = this.map.rooms[Math.floor(rng() * this.map.rooms.length)];
      const route: EnemyState['patrolRoute'] = [
        { x: room.center.x + (rng() - 0.5) * (room.width * 0.6), y: room.center.y + (rng() - 0.5) * (room.height * 0.6) },
        { x: room.center.x + (rng() - 0.5) * (room.width * 0.6), y: room.center.y + (rng() - 0.5) * (room.height * 0.6) }
      ];
      this.enemies.push({
        id: `enemy-${i}`,
        position: { ...route[0] },
        patrolRoute: route,
        patrolIndex: 0
      });
    }
  }

  private spawnTerminals(seed: string) {
    const rng = this.createRng(seed + '-terminals');
    const shuffledRooms = [...this.map.rooms].sort(() => rng() - 0.5);
    this.terminals = [];

    for (let i = 0; i < TERMINAL_COUNT && i < shuffledRooms.length; i += 1) {
      const room = shuffledRooms[i];
      const offset = {
        x: (rng() - 0.5) * (room.width * 0.3),
        y: (rng() - 0.5) * (room.height * 0.3)
      };
      this.terminals.push(createJobTerminal({ room, offset }));
    }
  }

  private createRng(seed: string) {
    let h = 0;
    for (let i = 0; i < seed.length; i += 1) {
      h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
    }
    return function rng() {
      h |= 0;
      h = (h + 0x6D2B79F5) | 0;
      let t = Math.imul(h ^ (h >>> 15), h | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  update(dt: number, input: InputState) {
    if (this.ui.isOpen()) {
      return;
    }

    this.movement.update(this.player, input, dt, {
      minX: 0,
      maxX: this.map.width,
      minY: 0,
      maxY: this.map.height
    });

    this.shooting.update(
      this.player,
      { fire: input.fire, angle: input.aimAngle },
      dt,
      {
        spawnProjectile: ({ x, y, direction, speed }) => {
          void (x + y + direction.x + direction.y + speed);
        }
      }
    );

    this.updateEnemies(dt);

    if (this.interactionCooldown > 0) {
      this.interactionCooldown -= dt * 1000;
    }

    if (input.interact && this.interactionCooldown <= 0) {
      const terminal = this.findNearbyTerminal();
      if (terminal) {
        this.openTerminal(terminal);
        this.interactionCooldown = 400;
      }
    }
  }

  private updateEnemies(dt: number) {
    const speed = 120;
    this.enemies.forEach((enemy) => {
      const target = enemy.patrolRoute[enemy.patrolIndex];
      const dx = target.x - enemy.position.x;
      const dy = target.y - enemy.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 4) {
        enemy.patrolIndex = (enemy.patrolIndex + 1) % enemy.patrolRoute.length;
        return;
      }
      const vx = (dx / Math.max(dist, 0.0001)) * speed * dt;
      const vy = (dy / Math.max(dist, 0.0001)) * speed * dt;
      enemy.position.x += vx;
      enemy.position.y += vy;
    });
  }

  private findNearbyTerminal() {
    const range = 48;
    return this.terminals.find((terminal) => {
      const dx = terminal.position.x - this.player.position.x;
      const dy = terminal.position.y - this.player.position.y;
      return Math.hypot(dx, dy) <= range;
    });
  }

  private openTerminal(terminal: JobTerminalState) {
    this.ui.setAppliedCount(this.appliedJobs);
    const listings = this.ui.getListings();
    this.ui.open(listings);
    terminal.interacted = true;
  }

  private resumePlayerControl() {
    // placeholder for hooking control resume logic
  }

  private incrementApplications() {
    this.appliedJobs += 1;
    if (this.appliedJobs >= this.requiredApplications) {
      this.completeLevel();
    }
  }

  private completeLevel() {
    this.ui.close();
    this.onComplete?.(this.id, {
      appliedJobs: this.appliedJobs,
      terminalsUsed: this.terminals.filter((t) => t.interacted).length,
      mapSeed: this.map.seed
    });
  }
}

export function createLevel21TopDown(options: Level21Options = {}) {
  return new Level21TopDown(options);
}
