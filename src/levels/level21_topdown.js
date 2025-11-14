import { generateCorporateLabyrinth, createLabyrinthRng } from '../maps/level21_corporate_labyrinth.js';
import { createJobTerminal, resetTerminalCounter } from '../entities/jobTerminal.js';
import { JobApplicationTerminalUI } from '../ui/jobApplicationTerminalUI.js';

const REQUIRED_APPLICATIONS = 35;
const ENEMY_COUNT = 18;
const TERMINAL_COUNT = 5;

export class Level21TopDown {
  constructor(options = {}) {
    const seed = options.seed ?? 'level21';
    this.map = generateCorporateLabyrinth({ seed });
    this.onComplete = options.onLevelComplete ?? (() => {});
    this.requiredApplications = options.requiredApplications ?? REQUIRED_APPLICATIONS;

    resetTerminalCounter();
    this.movement = { speed: 230, sprintMultiplier: 1.35 };
    this.projectileSpeed = 600;
    this.cooldownMs = 160;
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

    this.enemies = [];
    this.terminals = [];
    this.appliedJobs = 0;
    this.interactionCooldown = 0;

    this.spawnEnemies(seed);
    this.spawnTerminals(seed);
  }

  spawnEnemies(seed) {
    const rng = createLabyrinthRng(`${seed}-enemies`);
    this.enemies = [];
    for (let i = 0; i < ENEMY_COUNT; i += 1) {
      const room = this.map.rooms[Math.floor(rng() * this.map.rooms.length)];
      const route = [
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

  spawnTerminals(seed) {
    const rng = createLabyrinthRng(`${seed}-terminals`);
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

  update(dt, input) {
    if (this.ui.isOpen()) {
      return;
    }

    this.updateMovement(dt, input);
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

  updateMovement(dt, input) {
    const direction = this.sampleDirection(input);
    const magnitude = direction.x !== 0 || direction.y !== 0 ? 1 : 0;

    if (!this.player.velocity) {
      this.player.velocity = { x: 0, y: 0 };
    }

    if (magnitude === 0) {
      this.player.velocity.x = 0;
      this.player.velocity.y = 0;
      return;
    }

    const sprint = input.sprint ? (this.movement.sprintMultiplier ?? 1.35) : 1;
    const speed = (this.movement.speed ?? 220) * sprint;

    this.player.velocity.x = direction.x * speed;
    this.player.velocity.y = direction.y * speed;

    this.player.position.x = Math.max(0, Math.min(this.map.width, this.player.position.x + this.player.velocity.x * dt));
    this.player.position.y = Math.max(0, Math.min(this.map.height, this.player.position.y + this.player.velocity.y * dt));
  }

  sampleDirection(input) {
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

  updateEnemies(dt) {
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

  findNearbyTerminal() {
    const range = 48;
    return this.terminals.find((terminal) => {
      const dx = terminal.position.x - this.player.position.x;
      const dy = terminal.position.y - this.player.position.y;
      return Math.hypot(dx, dy) <= range;
    });
  }

  openTerminal(terminal) {
    this.ui.setAppliedCount(this.appliedJobs);
    const listings = this.ui.getListings();
    this.ui.open(listings);
    terminal.interacted = true;
  }

  resumePlayerControl() {
    // placeholder for hooking control resume logic
  }

  incrementApplications() {
    this.appliedJobs += 1;
    if (this.appliedJobs >= this.requiredApplications) {
      this.completeLevel();
    }
  }

  completeLevel() {
    this.ui.close();
    this.onComplete?.(this.id, {
      appliedJobs: this.appliedJobs,
      terminalsUsed: this.terminals.filter((t) => t.interacted).length,
      mapSeed: this.map.seed
    });
  }
}

Level21TopDown.prototype.id = 'level21_corporate_labyrinth';

export function createLevel21TopDown(options = {}) {
  return new Level21TopDown(options);
}
