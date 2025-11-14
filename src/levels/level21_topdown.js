import { generateCorporateLabyrinth, createLabyrinthRng } from '../maps/level21_corporate_labyrinth.js';
import { createJobTerminal, resetTerminalCounter } from '../entities/jobTerminal.js';
import { JobApplicationTerminalUI } from '../ui/jobApplicationTerminalUI.js';

const REQUIRED_APPLICATIONS = 35;
const ENEMY_COUNT = 18;
const TERMINAL_COUNT = 5;
const VIEW_PADDING = 160;
const MIN_TILE_SIZE = 18;

function createNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return () => performance.now();
  }
  return () => Date.now();
}

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

    this.roomLookup = new Map(this.map.rooms.map((room) => [room.id, room]));
    this.door = {
      position: { ...reception.center },
      radius: Math.max(this.map.gridSize * 0.75, Math.min(reception.width, reception.height) * 0.35),
      glowUntil: 0,
      unlocked: false
    };

    this.enemies = [];
    this.terminals = [];
    this.appliedJobs = 0;
    this.interactionCooldown = 0;
    this.levelComplete = false;
    this.completed = false;
    this.view = null;

    this._now = createNow();

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
      const terminal = createJobTerminal({ room, offset });
      this.terminals.push({
        ...terminal,
        glowUntil: 0
      });
    }
  }

  update(dt, input) {
    if (this.ui.isOpen()) {
      return;
    }

    this.updateMovement(dt, input);
    this.updateEnemies(dt);
    this.updateHighlights();

    if (this.interactionCooldown > 0) {
      this.interactionCooldown -= dt * 1000;
      if (this.interactionCooldown < 0) {
        this.interactionCooldown = 0;
      }
    }

    if (input.interact && this.interactionCooldown <= 0) {
      const terminal = this.findNearbyTerminal();
      if (terminal) {
        this.openTerminal(terminal);
        this.interactionCooldown = 400;
        return;
      }

      if (this.levelComplete && this.isPlayerAtDoor()) {
        this.completeLevel();
        this.interactionCooldown = 500;
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

  updateHighlights() {
    const range = this.getInteractionRange();
    const now = this._now();
    const { position } = this.player;

    this.terminals.forEach((terminal) => {
      const dx = terminal.position.x - position.x;
      const dy = terminal.position.y - position.y;
      if (Math.hypot(dx, dy) <= range) {
        terminal.glowUntil = now + 240;
      }
    });

    if (this.door) {
      const dx = this.door.position.x - position.x;
      const dy = this.door.position.y - position.y;
      const reach = range + (this.door.radius ?? this.map.gridSize * 0.5);
      if (Math.hypot(dx, dy) <= reach) {
        this.door.glowUntil = now + 240;
      }
    }
  }

  findNearbyTerminal() {
    const range = this.getInteractionRange();
    return this.terminals.find((terminal) => {
      const dx = terminal.position.x - this.player.position.x;
      const dy = terminal.position.y - this.player.position.y;
      return Math.hypot(dx, dy) <= range;
    });
  }

  getInteractionRange() {
    return Math.max(48, this.map.gridSize * 1.5);
  }

  isPlayerAtDoor() {
    if (!this.door) return false;
    const dx = this.door.position.x - this.player.position.x;
    const dy = this.door.position.y - this.player.position.y;
    const radius = this.door.radius ?? this.map.gridSize * 0.6;
    return Math.hypot(dx, dy) <= this.getInteractionRange() + radius;
  }

  openTerminal(terminal) {
    this.ui.setAppliedCount(this.appliedJobs);
    this.ui.open();
    terminal.interacted = true;
  }

  resumePlayerControl() {
    this.interactionCooldown = Math.max(this.interactionCooldown, 300);
  }

  incrementApplications() {
    this.appliedJobs += 1;
    if (this.appliedJobs >= this.requiredApplications) {
      this.levelComplete = true;
      if (this.door) {
        this.door.unlocked = true;
        this.door.glowUntil = this._now() + 2200;
      }
      this.completeLevel();
    }
  }

  completeLevel() {
    if (this.completed) {
      return;
    }
    this.levelComplete = true;
    this.completed = true;
    this.ui.close();
    this.onComplete?.(this.id, {
      appliedJobs: this.appliedJobs,
      terminalsUsed: this.terminals.filter((t) => t.interacted).length,
      mapSeed: this.map.seed
    });
  }

  ensureView(width, height) {
    if (!this.view || this.view.canvasWidth !== width || this.view.canvasHeight !== height) {
      const maxWidth = Math.max(1, width - VIEW_PADDING);
      const maxHeight = Math.max(1, height - VIEW_PADDING);
      const rawScale = Math.min(maxWidth / this.map.width, maxHeight / this.map.height) || 1;
      const desiredTile = Math.max(MIN_TILE_SIZE, Math.floor(this.map.gridSize * Math.max(rawScale, 0.55)));
      let scale = desiredTile / this.map.gridSize;
      let scaledWidth = this.map.width * scale;
      let scaledHeight = this.map.height * scale;

      if (scaledWidth > width || scaledHeight > height) {
        const fitScale = Math.min(maxWidth / this.map.width, maxHeight / this.map.height) || scale;
        scale = Math.min(scale, fitScale);
        scaledWidth = this.map.width * scale;
        scaledHeight = this.map.height * scale;
      }

      const offsetX = Math.round((width - scaledWidth) / 2);
      const offsetY = Math.round((height - scaledHeight) / 2);

      this.view = {
        scale,
        tileSize: scale * this.map.gridSize,
        offsetX,
        offsetY,
        canvasWidth: width,
        canvasHeight: height
      };
    }
    return this.view;
  }

  worldToScreen(position) {
    const view = this.view ?? this.ensureView(1180, 660);
    return {
      x: view.offsetX + position.x * view.scale,
      y: view.offsetY + position.y * view.scale
    };
  }

  render(ctx) {
    if (!ctx) return;
    const canvas = ctx.canvas || { width: 1180, height: 660 };
    const width = canvas.width;
    const height = canvas.height;
    const view = this.ensureView(width, height);
    const now = this._now();

    ctx.save();
    ctx.fillStyle = '#0b121c';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(20,28,42,0.9)';
    ctx.fillRect(view.offsetX, view.offsetY, this.map.width * view.scale, this.map.height * view.scale);

    ctx.lineWidth = Math.max(4, view.tileSize * 0.25);
    ctx.strokeStyle = 'rgba(120,160,210,0.28)';
    this.map.corridors.forEach((corridor) => {
      const from = corridor.from && this.roomLookup.get(corridor.from);
      const to = corridor.to && this.roomLookup.get(corridor.to);
      if (!from || !to) return;
      const points = [from.center, ...(corridor.waypoints ?? []), to.center];
      ctx.beginPath();
      points.forEach((point, index) => {
        const sx = view.offsetX + point.x * view.scale;
        const sy = view.offsetY + point.y * view.scale;
        if (index === 0) {
          ctx.moveTo(sx, sy);
        } else {
          ctx.lineTo(sx, sy);
        }
      });
      ctx.stroke();
    });

    this.map.rooms.forEach((room) => {
      const widthPx = room.width * view.scale;
      const heightPx = room.height * view.scale;
      const x = view.offsetX + (room.center.x - room.width / 2) * view.scale;
      const y = view.offsetY + (room.center.y - room.height / 2) * view.scale;
      const base = room.type === 'reception'
        ? 'rgba(120,180,240,0.32)'
        : 'rgba(50,72,104,0.82)';
      ctx.fillStyle = base;
      ctx.fillRect(x, y, widthPx, heightPx);
      ctx.strokeStyle = 'rgba(140,180,220,0.35)';
      ctx.strokeRect(x, y, widthPx, heightPx);
    });

    if (this.door) {
      const doorPos = this.worldToScreen(this.door.position);
      const radius = (this.door.radius ?? this.map.gridSize * 0.6) * view.scale;
      const glow = this.door.glowUntil > now;
      ctx.fillStyle = this.door.unlocked || glow
        ? 'rgba(120,255,200,0.85)'
        : 'rgba(80,110,150,0.65)';
      ctx.beginPath();
      ctx.arc(doorPos.x, doorPos.y, Math.max(radius, view.tileSize * 0.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,30,45,0.7)';
      ctx.lineWidth = Math.max(2, view.tileSize * 0.12);
      ctx.stroke();
    }

    const terminalRadius = Math.max(10, view.tileSize * 0.32);
    this.terminals.forEach((terminal) => {
      const pos = this.worldToScreen(terminal.position);
      const glow = terminal.glowUntil > now;
      ctx.fillStyle = glow ? 'rgba(140,255,210,0.92)' : 'rgba(180,220,255,0.8)';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, terminalRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0a1320';
      ctx.font = `${Math.max(10, Math.floor(view.tileSize * 0.35))}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PC', pos.x, pos.y + 1);
    });

    const enemyRadius = Math.max(8, view.tileSize * 0.28);
    this.enemies.forEach((enemy) => {
      const pos = this.worldToScreen(enemy.position);
      ctx.fillStyle = 'rgba(255,120,140,0.85)';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, enemyRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,10,18,0.8)';
      ctx.lineWidth = Math.max(1.5, view.tileSize * 0.08);
      ctx.stroke();
    });

    const playerPos = this.worldToScreen(this.player.position);
    const playerRadius = Math.max(view.tileSize * 0.4, 10);
    ctx.fillStyle = '#88f6ff';
    ctx.beginPath();
    ctx.arc(playerPos.x, playerPos.y, playerRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0a1f2c';
    ctx.lineWidth = Math.max(2, view.tileSize * 0.1);
    ctx.stroke();

    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '16px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Applications: ${this.appliedJobs}/${this.requiredApplications}`, 24, 20);
    if (this.levelComplete) {
      ctx.fillStyle = 'rgba(120,255,200,0.9)';
      ctx.fillText('Return to the elevator!', 24, 44);
    } else {
      ctx.fillStyle = 'rgba(200,220,255,0.75)';
      ctx.fillText('Locate terminals to submit applications.', 24, 44);
    }
  }
}

Level21TopDown.prototype.id = 'level21_corporate_labyrinth';

export function createLevel21TopDown(options = {}) {
  return new Level21TopDown(options);
}
