const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;
const GAME_DURATION_REAL_MS = 2 * 60 * 60 * 1000;
const FLOOR_COUNT = 36;
const SERVER_MIN = 3;
const SERVER_MAX = 5;
const FLASHLIGHT_RANGE = 180;
const PLAYER_CHECKING_MAX = 250;
const PLAYER_START_CHECKING = 100;
const PLAYER_SAVINGS_MAX = 1200;
const PLAYER_START_SAVINGS = 1200;
const DAMAGE_AMOUNT = 10;
const MELEE_HOTKEY_COOLDOWN = 250;
const ATTACK_KEYS = ["e", "j"];
const GUARD_WEAPON_PROFILES = {
  pistol: { shotInterval: 700, attackInterval: 900, speedBonus: 0 },
  auto: { shotInterval: 220, attackInterval: 600, speedBonus: 10 },
  launcher: { shotInterval: 1600, attackInterval: 1500, speedBonus: -5 },
  ninja: { shotInterval: 0, attackInterval: 800, speedBonus: 25 }
};
const COLORS_BY_FLOOR = [
  "#162035",
  "#1f1a33",
  "#221f28",
  "#1c2436"
];

const BOARD_ABILITIES = [
  { id: "late_fees", name: "Late Fees", description: "Periodic balance drain.", apply: (game, boss) => {
      if (!boss.timers) boss.timers = {};
      if (!boss.timers.lateFee || game.now - boss.timers.lateFee > 7000) {
        boss.timers.lateFee = game.now;
        game.player.modifyBalance(-5, "Late fee charged!");
      }
    }
  },
  { id: "second_job", name: "Second Job Fatigue", description: "Reduced jump height.", apply: (game) => {
      game.player.jumpModifier = 0.65;
    }
  },
  { id: "night_shift", name: "Night Job Sleep", description: "Vision flickers.", apply: (game, boss) => {
      const cycle = (game.now / 1000) % 4;
      boss.flicker = cycle > 2.5;
    }
  },
  { id: "no_healthcare", name: "No Healthcare", description: "Cannot heal.", apply: (game) => {
      game.disableHealUntil = Math.max(game.disableHealUntil, game.now + 10000);
    }
  },
  { id: "debt_collector", name: "Debt Collectors", description: "Summons extra guards.", apply: (game, boss) => {
      if (!boss.timers) boss.timers = {};
      if (!boss.timers.summon || game.now - boss.timers.summon > 12000) {
        boss.timers.summon = game.now;
        game.floorState.spawnGuard({ aggressive: true, weapon: "auto" });
        game.log("Debt collectors burst through the doors!");
      }
    }
  },
  { id: "balloon_interest", name: "Balloon Interest", description: "Servers re-arm unless destroyed quickly.", apply: (game) => {
      if (!game.floorState || !game.floorState.servers) return;
      game.floorState.servers.forEach(server => {
        if (server.destroyed && game.now - server.destroyedAt > 8000) {
          server.destroyed = false;
          server.destroyedAt = 0;
          game.floorState.smoke = false;
          game.floorState.exitVisible = false;
          game.log("Balloon interest caused a server to come back online!");
        }
      });
    }
  },
  { id: "tuition_hike", name: "Tuition Hike", description: "Ammo pickups are scarcer.", apply: (game) => {
      if (!game.floorState || !game.floorState.items) return;
      game.floorState.items.forEach(item => {
        if (item.type === "ammo") {
          item.spawnRateModifier = 0.2;
        }
      });
    }
  },
  { id: "loan_servicer", name: "Loan Servicer", description: "Projectiles slow down.", apply: (game) => {
      game.player.projectileSpeedModifier = 0.7;
    }
  },
  { id: "garnish_wages", name: "Wage Garnish", description: "Lose money when damaged.", apply: (game, boss) => {
      if (!boss.garnishActive) {
        boss.garnishActive = true;
      }
    }
  }
];

const BOSS_ORDER = BOARD_ABILITIES.map((ability, idx) => ({
  floor: (idx + 1) * 4,
  ability
}));

function findElementByIds(...ids) {
  for (const id of ids) {
    if (!id) continue;
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

function ensureHiddenFallback(id, tag = "div") {
  const existing = id ? document.getElementById(id) : null;
  if (existing) return existing;
  const el = document.createElement(tag);
  if (id) el.id = id;
  el.style.display = "none";
  if (document.body) {
    document.body.appendChild(el);
  } else {
    document.addEventListener("DOMContentLoaded", () => document.body.appendChild(el), { once: true });
  }
  return el;
}

function formatCountdown(ms) {
  const clamped = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

class Input {
  constructor() {
    this.keys = new Map();
    this.downTimestamps = new Map();
    this.pendingPressed = new Set();
    this.framePressed = new Set();
    window.addEventListener("keydown", (event) => {
      const key = this.normalizeKey(event.key);
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "space"].includes(key)) {
        event.preventDefault();
      }
      if (!this.keys.get(key)) {
        this.downTimestamps.set(key, performance.now());
        this.pendingPressed.add(key);
      }
      this.keys.set(key, true);
    });
    window.addEventListener("keyup", (event) => {
      const key = this.normalizeKey(event.key);
      this.keys.set(key, false);
      this.downTimestamps.delete(key);
    });
  }

  normalizeKey(raw) {
    if (!raw) return "";
    if (raw === " ") return "space";
    return raw.toLowerCase();
  }

  beginFrame() {
    this.framePressed.clear();
    this.pendingPressed.forEach((key) => this.framePressed.add(key));
    this.pendingPressed.clear();
  }

  isPressed(...candidates) {
    return candidates.some((key) => this.keys.get(this.normalizeKey(key)));
  }

  pressedThisFrame(...candidates) {
    return candidates.some((key) => this.framePressed.has(this.normalizeKey(key)));
  }

  heldDuration(key) {
    const normalized = this.normalizeKey(key);
    if (!this.keys.get(normalized)) return 0;
    const start = this.downTimestamps.get(normalized);
    if (!start) return 0;
    return performance.now() - start;
  }

  comboHeld(groups, durationMs) {
    return groups.every((group) => group.some((key) => {
      const normalized = this.normalizeKey(key);
      return this.keys.get(normalized) && this.heldDuration(normalized) >= durationMs;
    }));
  }

  get left() {
    return this.isPressed("ArrowLeft", "a");
  }

  get right() {
    return this.isPressed("ArrowRight", "d");
  }

  get up() {
    return this.isPressed("ArrowUp", "w");
  }

  get down() {
    return this.isPressed("ArrowDown", "s", "x");
  }

  get jump() {
    return this.isPressed("space");
  }

  get crouch() {
    return this.down;
  }

  get attack() {
    return this.isPressed(...ATTACK_KEYS);
  }
}

class Player {
  constructor(game) {
    this.game = game;
    this.width = 32;
    this.height = 48;
    this.position = { x: 80, y: CANVAS_HEIGHT - 120 };
    this.velocity = { x: 0, y: 0 };
    this.speed = 160;
    this.gravity = 900;
    this.jumpStrength = 360;
    this.jumpModifier = 1;
    this.maxJumps = 2;
    this.doubleFlight = false;
    this.jumpCount = 0;
    this.grounded = false;
    this.crouching = false;
    this.hidden = false;
    this.health = PLAYER_START_CHECKING;
    this.savings = PLAYER_START_SAVINGS;
    this.score = 0;
    this.intel = 0;
    this.modeTestRevive = false;
    this.weapon = "pistol";
    this.lastAttack = 0;
    this.attackCooldowns = {
      pistol: 250,
      silenced: 250,
      flamethrower: 150,
      melee: 400,
      grenade: 800,
      saber: 320,
      machine: 140
    };
    this.projectileSpeedModifier = 1;
    this.canHeal = true;
    this.featherTimer = 0;
    this.inVent = false;
    this.currentVent = null;
    this.originalVentPosition = { x: 0, y: 0 };
    this.lastVentToggle = 0;
    this.dropComboActive = false;
    this.lastDropComboTime = 0;
    this.lastDirectionalMelee = 0;
    this.facing = 1;
  }

  respawn() {
    this.position = { x: 80, y: CANVAS_HEIGHT - 120 };
    this.velocity = { x: 0, y: 0 };
    this.jumpCount = 0;
    this.grounded = false;
    this.hidden = false;
    this.crouching = false;
    this.inVent = false;
    this.currentVent = null;
    this.doubleFlight = false;
    this.featherTimer = 0;
    this.maxJumps = 2;
    this.dropComboActive = false;
    this.facing = 1;
    this.lastDirectionalMelee = 0;
  }

  modifyBalance(amount, reason) {
    if (!amount) {
      if (reason) {
        this.game.log(reason);
      }
      return;
    }
    if (amount > 0) {
      let remaining = amount;
      const savingsCapacity = PLAYER_SAVINGS_MAX - this.savings;
      if (savingsCapacity > 0) {
        const toSavings = Math.min(remaining, savingsCapacity);
        this.savings += toSavings;
        remaining -= toSavings;
      }
      if (remaining > 0 && this.canHeal && this.savings >= PLAYER_SAVINGS_MAX) {
        const checkingCapacity = PLAYER_CHECKING_MAX - this.health;
        if (checkingCapacity > 0) {
          const toChecking = Math.min(remaining, checkingCapacity);
          this.health += toChecking;
          remaining -= toChecking;
        }
      }
    } else {
      const loss = Math.abs(amount);
      const checkLoss = Math.min(this.health, loss);
      this.health -= checkLoss;
      const savingsLoss = Math.min(this.savings, loss);
      this.savings -= savingsLoss;
    }
    this.health = Math.max(0, Math.min(this.health, PLAYER_CHECKING_MAX));
    this.savings = Math.max(0, Math.min(this.savings, PLAYER_SAVINGS_MAX));
    if (reason) {
      this.game.log(reason);
    }
    if (amount < 0 && this.health <= 0) {
      this.handleDeath();
    }
  }

  damage(amount, source) {
    const reason = source ? `Lost $${amount} to ${source}.` : undefined;
    this.modifyBalance(-amount, reason);
  }

  handleDeath() {
    if (this.modeTestRevive) {
      this.health = PLAYER_CHECKING_MAX;
      this.savings = PLAYER_SAVINGS_MAX;
      this.game.log("Auto payment reversed for testing. Respawning on current floor.");
      this.respawn();
    } else {
      this.savings = 0;
      this.game.log("Emergency payments drained your savings account!");
      this.game.resetToFloor(1, true);
    }
  }

  update(delta) {
    if (this.inVent) {
      this.velocity.x = 0;
      this.velocity.y = 0;
      return;
    }
    const input = this.game.input;
    const accel = this.speed;
    this.velocity.x = 0;
    if (input.left) this.velocity.x = -accel;
    if (input.right) this.velocity.x = accel;
    if (this.velocity.x < 0) this.facing = -1;
    if (this.velocity.x > 0) this.facing = 1;

    this.crouching = !!input.crouch;

    if (input.jump && (this.grounded || this.jumpCount < (this.doubleFlight ? 99 : this.maxJumps))) {
      if (!this.jumpHeld) {
        this.velocity.y = -this.jumpStrength * this.jumpModifier;
        this.jumpCount += 1;
        this.grounded = false;
        this.jumpHeld = true;
      }
    } else {
      this.jumpHeld = false;
    }

    const dropComboReady = input.comboHeld([
      ["ArrowUp", "w"],
      ["ArrowDown", "s", "x"]
    ], 120);
    if (this.grounded && dropComboReady && !this.dropComboActive) {
      this.game.floorState.scheduleDrop();
      this.dropComboActive = true;
      this.lastDropComboTime = this.game.now;
    }
    if (!dropComboReady || (this.game.now - this.lastDropComboTime) > 400) {
      this.dropComboActive = false;
    }

    this.velocity.y += this.gravity * delta;
    this.position.x += this.velocity.x * delta;
    this.position.y += this.velocity.y * delta;

    if (this.position.x < 0) this.position.x = 0;
    if (this.position.x + this.width > CANVAS_WIDTH) this.position.x = CANVAS_WIDTH - this.width;

    this.applyCollisions();

    if (this.featherTimer > 0) {
      this.featherTimer -= delta;
      if (this.featherTimer <= 0) {
        this.doubleFlight = false;
        this.maxJumps = 2;
      }
    }
  }

  applyCollisions() {
    const platforms = this.game.floorState.platforms;
    let grounded = false;
    for (const platform of platforms) {
      const dropping = this.game.floorState.dropIgnoreTimer > 0 && !platform.solid && this.velocity.y >= 0 && (this.position.y + this.height) <= platform.y + 12;
      if (dropping) continue;
      if (this.intersects(platform)) {
        if (this.velocity.y > 0 && this.position.y + this.height <= platform.y + this.velocity.y * this.game.delta) {
          this.position.y = platform.y - this.height;
          this.velocity.y = 0;
          grounded = true;
          this.jumpCount = 0;
        } else if (this.velocity.y < 0) {
          this.position.y = platform.y + platform.height;
          this.velocity.y = 0;
        }
      }
    }

    if (this.position.y + this.height >= CANVAS_HEIGHT) {
      this.position.y = CANVAS_HEIGHT - this.height;
      this.velocity.y = 0;
      grounded = true;
      this.jumpCount = 0;
    }

    this.grounded = grounded;
    this.hidden = this.crouching && this.game.floorState.isPlayerUnderDesk(this);
  }

  intersects(rect) {
    return (
      this.position.x < rect.x + rect.width &&
      this.position.x + this.width > rect.x &&
      this.position.y < rect.y + rect.height &&
      this.position.y + this.height > rect.y
    );
  }
}

class Projectile {
  constructor({ x, y, vx, vy, owner, damage, range, weapon }) {
    this.position = { x, y };
    this.velocity = { x: vx, y: vy };
    this.owner = owner;
    this.damage = damage;
    this.range = range;
    this.distance = 0;
    this.weapon = weapon;
    const radii = {
      flame: 14,
      grenade: 12,
      machine: 5,
      silenced: 5
    };
    this.radius = radii[weapon] ?? 6;
  }

  update(delta) {
    this.position.x += this.velocity.x * delta;
    this.position.y += this.velocity.y * delta;
    this.distance += Math.hypot(this.velocity.x, this.velocity.y) * delta;
  }
}

class FloorState {
  constructor(game, floorNumber, config) {
    this.game = game;
    this.floor = floorNumber;
    this.type = config.type;
    this.platforms = config.platforms;
    this.decor = config.decor;
    this.desks = config.desks;
    this.guards = config.guards;
    this.officeWorkers = config.officeWorkers;
    this.managers = config.managers;
    this.boardMembers = config.boardMembers;
    this.ceo = config.ceo;
    this.items = config.items;
    this.servers = config.servers;
    this.spotlights = config.spotlights || [];
    this.alarmSwitch = config.alarmSwitch || null;
    this.alarmActive = config.alarmActive;
    this.spotlightAlertCooldown = 0;
    this.vents = config.vents;
    this.exit = config.exit;
    this.smoke = false;
    this.exitVisible = false;
    this.dropIgnoreTimer = 0;
    this.spawnArea = config.spawnArea;
  }

  update(delta) {
    if (this.dropIgnoreTimer > 0) {
      this.dropIgnoreTimer -= delta;
    }

    this.updateGuards(delta);
    this.updateWorkers(delta);
    this.updateManagers(delta);
    this.updateBoardMembers(delta);
    if (this.ceo) {
      this.updateCeo(delta);
    }
    this.animateSpotlights(delta);
  }

  scheduleDrop() {
    this.dropIgnoreTimer = 0.2;
  }

  updateGuards(delta) {
    const chasingEnabled = this.type === "server";
    for (const guard of this.guards) {
      const player = this.game.player;
      if (guard.alive) {
        guard.chaseTimer = Math.max(0, (guard.chaseTimer || 0) - delta);
        if (player.hidden) {
          guard.chasing = false;
          guard.chaseTimer = 0;
        }
        if (guard.aggressive && !player.hidden) {
          guard.chasing = true;
          guard.chaseTimer = Math.max(guard.chaseTimer, 1.5);
        }

        if (guard.chasing && chasingEnabled) {
          const targetX = player.hidden ? (guard.lastKnownPlayerX ?? guard.position.x) : player.position.x;
          if (!player.hidden) {
            guard.lastKnownPlayerX = targetX;
          }
          const direction = targetX >= guard.position.x ? 1 : -1;
          guard.direction = direction;
          const speedMultiplier = 1.35;
          guard.position.x += guard.direction * guard.speed * speedMultiplier * delta;
          guard.position.x = Math.max(0, Math.min(CANVAS_WIDTH - guard.width, guard.position.x));
          if (guard.chaseTimer <= 0 && Math.abs((guard.lastKnownPlayerX ?? targetX) - guard.position.x) < 12) {
            guard.chasing = false;
          }
        } else {
          guard.chasing = chasingEnabled ? guard.chasing : false;
          guard.chaseTimer = chasingEnabled ? guard.chaseTimer : 0;
          guard.position.x += guard.direction * guard.speed * delta;
          if (guard.position.x < guard.patrol.min) {
            guard.position.x = guard.patrol.min;
            guard.direction = 1;
          }
          if (guard.position.x > guard.patrol.max) {
            guard.position.x = guard.patrol.max;
            guard.direction = -1;
          }
        }
      }

      guard.flashlight = {
        x: guard.position.x + guard.width / 2,
        y: guard.position.y + guard.height / 2,
        length: FLASHLIGHT_RANGE,
        direction: guard.direction
      };

      const sameLayer = Math.abs((guard.position.y + guard.height) - (player.position.y + player.height)) < 40;
      if (guard.alive && !this.game.completedServers() && sameLayer && !player.hidden) {
        const inCone = this.isPlayerInFlashlight(guard, player);
        if (inCone) {
          if (chasingEnabled) {
            guard.chasing = true;
            guard.chaseTimer = Math.max(guard.chaseTimer || 0, 2.5);
            guard.lastKnownPlayerX = player.position.x + player.width / 2;
            guard.direction = player.position.x > guard.position.x ? 1 : -1;
          }
          const now = this.game.now;
          if (guard.weapon !== "ninja") {
            if (!guard.lastAttackTime || now - guard.lastAttackTime >= guard.attackInterval) {
              guard.lastAttackTime = now;
              this.game.attemptDamagePlayer(DAMAGE_AMOUNT, "guard fire");
            }
            this.fireGuardProjectile(guard);
          } else {
            this.performNinjaStrike(guard, now);
          }
        }
      }

      guard.projectiles = guard.projectiles || [];
      guard.projectiles.forEach((projectile) => projectile.update(delta));
      guard.projectiles = guard.projectiles.filter((projectile) => projectile.distance < projectile.range);

      if (guard.alive && !player.hidden && this.game.player.intersects({
        x: guard.position.x,
        y: guard.position.y,
        width: guard.width,
        height: guard.height
      })) {
        const playerBottom = player.position.y + player.height;
        if (this.game.player.velocity.y > 120 && playerBottom <= guard.position.y + guard.height * 0.6) {
          continue;
        }
        const now = this.game.now;
        if (!guard.lastTackle || now - guard.lastTackle >= guard.attackInterval) {
          guard.lastTackle = now;
          this.game.attemptDamagePlayer(DAMAGE_AMOUNT, "guard tackle");
        }
      }
    }
  }

  updateWorkers(delta) {
    for (const worker of this.officeWorkers) {
      if (!worker.alive) continue;
      worker.timer = (worker.timer || 0) + delta;
      if (worker.timer > 6) {
        worker.direction *= -1;
        worker.timer = 0;
      }
      worker.position.x += worker.direction * worker.speed * delta;
      if (worker.position.x < worker.patrol.min || worker.position.x > worker.patrol.max) {
        worker.direction *= -1;
      }
    }
  }

  updateManagers(delta) {
    for (const manager of this.managers) {
      if (!manager.alive) continue;
      manager.cooldown = Math.max(0, (manager.cooldown || 0) - delta);
      if (manager.cooldown === 0) {
        const target = this.game.player.position.x;
        manager.projectiles.push(new Projectile({
          x: manager.position.x + manager.width / 2,
          y: manager.position.y + manager.height / 2,
          vx: (target > manager.position.x ? 220 : -220),
          vy: 0,
          owner: manager,
          damage: DAMAGE_AMOUNT,
          range: 320,
          weapon: "clipboard"
        }));
        manager.cooldown = 3.4;
      }
      manager.projectiles.forEach((projectile) => projectile.update(delta));
      manager.projectiles = manager.projectiles.filter((projectile) => projectile.distance < projectile.range);
    }
  }

  updateBoardMembers(delta) {
    for (const boss of this.boardMembers) {
      if (!boss.alive) continue;
      boss.position.x += boss.direction * boss.speed * delta;
      if (boss.position.x < boss.patrol.min || boss.position.x > boss.patrol.max) {
        boss.direction *= -1;
      }
      boss.ability.apply(this.game, boss);
    }
  }

  updateCeo(delta) {
    const ceo = this.ceo;
    if (!ceo.alive) return;
    if (this.boardMembers.some((boss) => boss.alive)) {
      ceo.timer = 0;
      ceo.state = "idle";
      return;
    }
    ceo.timer += delta;
    switch (ceo.state) {
      case "idle":
        if (ceo.timer > 2.5) {
          ceo.state = "rampage";
          ceo.timer = 0;
          ceo.direction = this.game.player.position.x > ceo.position.x ? 1 : -1;
          this.game.log("The CEO begins a rampage!");
        }
        break;
      case "rampage":
        ceo.position.x += ceo.direction * ceo.speed * delta;
        if (ceo.position.x < ceo.patrol.min || ceo.position.x > ceo.patrol.max) {
          ceo.position.x = Math.max(ceo.patrol.min, Math.min(ceo.patrol.max, ceo.position.x));
          ceo.state = "vulnerable";
          ceo.timer = 0;
          ceo.vulnerable = true;
          this.game.log("The CEO is winded. Hit his back!");
        }
        break;
      case "vulnerable":
        if (ceo.timer > 3) {
          ceo.vulnerable = false;
          ceo.state = "idle";
          ceo.timer = 0;
          this.game.log("The CEO recovers, watch out!");
        }
        break;
    }
  }

  animateSpotlights(delta) {
    if (!this.spotlights.length) {
      this.spotlightAlertCooldown = Math.max(0, this.spotlightAlertCooldown - delta);
      return;
    }
    for (const light of this.spotlights) {
      if (!light.active) continue;
      if (!this.alarmActive) continue;
      if (!light.direction) light.direction = 1;
      light.angle += light.sweepSpeed * light.direction * delta;
      if (light.angle > light.maxAngle) {
        light.angle = light.maxAngle;
        light.direction *= -1;
      }
      if (light.angle < light.minAngle) {
        light.angle = light.minAngle;
        light.direction *= -1;
      }
    }
    this.spotlightAlertCooldown = Math.max(0, this.spotlightAlertCooldown - delta);
  }

  evaluateSpotlights(player) {
    if (!this.alarmActive || !this.spotlights.length) return;
    if (player.hidden) return;
    if (this.spotlightAlertCooldown > 0) return;
    const center = {
      x: player.position.x + player.width / 2,
      y: player.position.y + player.height / 2
    };
    const triggered = this.spotlights.some((light) => this.isPlayerInSpotlight(light, center));
    if (triggered) {
      this.spotlightAlertCooldown = 1.5;
      this.alertAllGuards(center.x);
      this.game.log("Sweeping spotlights expose your position!");
    }
  }

  isPlayerInSpotlight(light, point) {
    if (!this.alarmActive || !light.active) return false;
    const dx = point.x - light.origin.x;
    const dy = point.y - light.origin.y;
    const distance = Math.hypot(dx, dy);
    if (distance > light.radius) return false;
    const angleToPlayer = Math.atan2(dy, dx);
    const diff = Math.atan2(Math.sin(angleToPlayer - light.angle), Math.cos(angleToPlayer - light.angle));
    return Math.abs(diff) <= light.beamWidth / 2;
  }

  alertAllGuards(playerX) {
    if (this.type !== "server") return;
    for (const guard of this.guards) {
      if (!guard.alive) continue;
      guard.chasing = true;
      guard.chaseTimer = Math.max(guard.chaseTimer || 0, 3.2);
      guard.lastKnownPlayerX = playerX;
      guard.direction = playerX >= guard.position.x ? 1 : -1;
    }
  }

  disableAlarm() {
    if (!this.alarmActive) return;
    this.alarmActive = false;
    if (this.alarmSwitch) {
      this.alarmSwitch.disabled = true;
      this.alarmSwitch.progress = 1;
    }
    this.spotlights.forEach((light) => {
      light.active = false;
    });
    this.game.log("Alarm switch flipped. Spotlights offline.");
  }

  fireGuardProjectile(guard) {
    guard.projectiles = guard.projectiles || [];
    const now = this.game.now;
    if (guard.shotInterval > 0) {
      if (guard.lastShot && now - guard.lastShot < guard.shotInterval) {
        return;
      }
      guard.lastShot = now;
    }
    if (guard.weapon === "launcher") {
      guard.projectiles.push(new Projectile({
        x: guard.position.x + guard.width / 2,
        y: guard.position.y + guard.height / 2,
        vx: guard.direction * 150,
        vy: -60,
        owner: guard,
        damage: DAMAGE_AMOUNT * 2,
        range: 360,
        weapon: "launcher"
      }));
    } else {
      const speed = guard.weapon === "auto" ? 300 : 240;
      guard.projectiles.push(new Projectile({
        x: guard.position.x + guard.width / 2,
        y: guard.position.y + guard.height / 2,
        vx: guard.direction * speed,
        vy: 0,
        owner: guard,
        damage: DAMAGE_AMOUNT,
        range: 320,
        weapon: guard.weapon
      }));
    }
  }

  performNinjaStrike(guard, now) {
    const player = this.game.player;
    const dx = player.position.x - guard.position.x;
    const dy = Math.abs((player.position.y + player.height / 2) - (guard.position.y + guard.height / 2));
    if (Math.abs(dx) < 140 && dy < 60) {
      if (!guard.lastStrike || now - guard.lastStrike >= guard.attackInterval) {
        guard.lastStrike = now;
        this.game.attemptDamagePlayer(DAMAGE_AMOUNT, "ninja strike");
      }
    }
  }

  isPlayerInFlashlight(guard, player) {
    if (this.game.completedServers()) return false;
    const dx = player.position.x - guard.flashlight.x;
    if (Math.sign(dx) !== guard.direction) return false;
    const distance = Math.abs(dx);
    if (distance > guard.flashlight.length) return false;
    const dy = Math.abs((player.position.y + player.height / 2) - guard.flashlight.y);
    return dy < 60;
  }

  completedServers() {
    if (!this.servers.length) return true;
    return this.servers.every(server => server.destroyed);
  }

  isPlayerUnderDesk(player) {
    return this.desks.some((desk) => (
      player.position.x + player.width > desk.x &&
      player.position.x < desk.x + desk.width &&
      player.position.y + player.height <= desk.y + desk.height + 4 &&
      player.position.y + player.height >= desk.y + desk.height - 18
    ));
  }

  spawnGuard(overrides = {}) {
    if (this.exitVisible) return;
    const base = this.game.generateGuard(this.floor, overrides, this.platforms);
    const avoidX = this.game.player ? this.game.player.position.x : null;
    base.position.x = this.game.pickSafeGuardSpawn(this.spawnArea, this.exit, base, avoidX);
    this.guards.push(base);
  }
}

class Game {
  constructor(canvas) {
    this.canvas = canvas || findElementByIds("game-canvas", "game");
    if (!this.canvas) {
      throw new Error("Game canvas element not found");
    }
    this.ctx = this.canvas.getContext("2d");
    this.input = new Input();
    this.player = new Player(this);
    this.projectiles = [];
    this.items = [];
    this.lockedWeapons = new Set(["grenade", "saber", "machine"]);
    this.weaponButtons = [];
    this.map = {
      button: findElementByIds("map-toggle", "btnMap", "mapButton"),
      panel: findElementByIds("map-panel", "mapPanel", "minimap"),
      visible: false
    };
    if (this.map.button) {
      this.map.button.addEventListener("click", () => this.toggleMap());
    }
    this.modeToggle = findElementByIds("test-mode-toggle");
    if (this.modeToggle) {
      this.player.modeTestRevive = !!this.modeToggle.checked;
      this.modeToggle.addEventListener("change", () => {
        this.player.modeTestRevive = this.modeToggle.checked;
      });
    }
    document.querySelectorAll('input[name="weapon"]').forEach((input) => {
      input.addEventListener("change", (event) => {
        this.setWeapon(this.normalizeWeaponKey(event.target.value));
      });
    });
    this.weaponButtons = Array.from(document.querySelectorAll('[data-weapon]'));
    this.weaponButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const weapon = this.normalizeWeaponKey(btn.getAttribute("data-weapon"));
        this.setWeapon(weapon);
      });
    });
    window.addEventListener("keydown", (event) => {
      if (!event || event.repeat) return;
      const activeElement = document.activeElement;
      if (activeElement && ["input", "textarea"].includes(activeElement.tagName?.toLowerCase())) return;
      const key = event.key ? event.key.toLowerCase() : "";
      const weaponByKey = {
        "1": "pistol",
        "2": "silenced",
        "3": "flamethrower",
        "4": "melee",
        "5": "grenade",
        "6": "saber",
        "7": "machine"
      };
      if (weaponByKey[key]) {
        event.preventDefault();
        this.setWeapon(weaponByKey[key]);
      }
      if (key === "0" || key === "numpad0") {
        event.preventDefault();
        this.toggleMap();
      }
    });
    this.syncWeaponUi();
    this.floor = 1;
    this.floorState = this.generateFloor(this.floor);
    this.now = 0;
    this.delta = 0;
    this.lastTime = 0;
    this.disableHealUntil = 0;
    this.logElement = findElementByIds("event-log", "log");
    if (!this.logElement) {
      this.logElement = ensureHiddenFallback("event-log", "div");
    }
    this.objectiveList = findElementByIds("objective-list");
    if (!this.objectiveList) {
      this.objectiveList = ensureHiddenFallback("objective-list", "ul");
    }
    this.hud = {
      floor: findElementByIds("floor-display", "floor"),
      health: findElementByIds("health-display", "checkVal"),
      savings: findElementByIds("savings-display", "saveVal"),
      checkingFill: findElementByIds("checking-fill", "checkFill"),
      savingsFill: findElementByIds("savings-fill", "saveFill"),
      score: findElementByIds("score-display"),
      intel: findElementByIds("intel-display", "intelPill"),
      servers: findElementByIds("server-display", "servers"),
      clock: findElementByIds("clock-display", "time"),
    };
    this.runStartMs = performance.now();
    this.pausedMs = 0;
    this.pauseStarted = null;
    this.midnightHandled = false;
    this.setupObjectiveList();
    this.updateHud();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    this.updateClock();
  }

  loop(timestamp) {
    if (!this.lastTime) this.lastTime = timestamp;
    if (this.input && typeof this.input.beginFrame === "function") {
      this.input.beginFrame();
    }
    this.delta = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;
    this.now = performance.now();

    this.update(this.delta);
    this.updateClock();
    this.render();

    requestAnimationFrame(this.loop);
  }

  handleProjectiles(delta) {
    this.projectiles.forEach((projectile) => projectile.update(delta));
    this.projectiles = this.projectiles.filter((projectile) => projectile.distance < projectile.range);

    if (this.input.pressedThisFrame("d")) {
      this.executeDirectionalMelee();
    }

    // Player weapon usage
    if (this.player.weapon === "flamethrower") {
      if (this.input.attack) {
        this.emitFlame(delta);
      }
    } else if (this.input.attack) {
      this.fireWeapon();
    }

    this.resolveProjectileHits();
  }

  fireWeapon() {
    const now = this.now;
    const weapon = this.player.weapon;
    const cooldown = this.player.attackCooldowns[weapon] ?? 300;
    if (now - this.player.lastAttack < cooldown) return;
    this.player.lastAttack = now;
    const direction = this.input.left ? -1 : this.input.right ? 1 : this.playerFacingDirection();
    if (direction === 0) return;
    if (weapon === "pistol" || weapon === "silenced") {
      const speed = 480 * this.player.projectileSpeedModifier;
      this.projectiles.push(new Projectile({
        x: this.player.position.x + this.player.width / 2,
        y: this.player.position.y + this.player.height / 2,
        vx: direction * speed,
        vy: 0,
        owner: this.player,
        damage: DAMAGE_AMOUNT,
        range: 420,
        weapon: weapon === "silenced" ? "silenced" : "bullet"
      }));
    } else if (weapon === "machine") {
      const speed = 520 * this.player.projectileSpeedModifier;
      this.projectiles.push(new Projectile({
        x: this.player.position.x + this.player.width / 2,
        y: this.player.position.y + this.player.height / 2,
        vx: direction * speed,
        vy: 0,
        owner: this.player,
        damage: DAMAGE_AMOUNT,
        range: 360,
        weapon: "machine"
      }));
    } else if (weapon === "grenade") {
      const speed = 320 * this.player.projectileSpeedModifier;
      this.projectiles.push(new Projectile({
        x: this.player.position.x + this.player.width / 2,
        y: this.player.position.y + this.player.height / 2,
        vx: direction * speed,
        vy: 0,
        owner: this.player,
        damage: DAMAGE_AMOUNT * 2,
        range: 520,
        weapon: "grenade"
      }));
    } else if (weapon === "melee" || weapon === "saber") {
      const reach = weapon === "saber" ? 56 : 40;
      const hitbox = {
        x: direction > 0 ? this.player.position.x + this.player.width : this.player.position.x - reach,
        y: this.player.position.y + 4,
        width: reach,
        height: weapon === "saber" ? this.player.height - 4 : this.player.height - 8
      };
      const meleeDamage = weapon === "saber" ? DAMAGE_AMOUNT * 2 : DAMAGE_AMOUNT;
      this.resolveMelee(hitbox, meleeDamage, weapon);
    } else {
      const speed = 460 * this.player.projectileSpeedModifier;
      this.projectiles.push(new Projectile({
        x: this.player.position.x + this.player.width / 2,
        y: this.player.position.y + this.player.height / 2,
        vx: direction * speed,
        vy: 0,
        owner: this.player,
        damage: DAMAGE_AMOUNT,
        range: 420,
        weapon: "bullet"
      }));
    }
  }

  emitFlame(delta) {
    const now = this.now;
    const cooldown = this.player.attackCooldowns.flamethrower;
    if (now - this.player.lastAttack < cooldown) return;
    this.player.lastAttack = now;
    const direction = this.playerFacingDirection() || 1;
    const speed = 260 * this.player.projectileSpeedModifier;
    this.projectiles.push(new Projectile({
      x: this.player.position.x + this.player.width / 2,
      y: this.player.position.y + this.player.height / 2,
      vx: direction * speed,
      vy: 0,
      owner: this.player,
      damage: DAMAGE_AMOUNT,
      range: 180,
      weapon: "flame"
    }));
  }

  executeDirectionalMelee() {
    const now = this.now;
    if (now - this.player.lastDirectionalMelee < MELEE_HOTKEY_COOLDOWN) return;
    this.player.lastDirectionalMelee = now;
    const direction = this.playerFacingDirection() || 1;
    const reach = 36;
    const hitbox = {
      x: direction > 0 ? this.player.position.x + this.player.width : this.player.position.x - reach,
      y: this.player.position.y + 6,
      width: reach,
      height: this.player.height - 12
    };
    this.resolveMelee(hitbox, DAMAGE_AMOUNT, "directional");
  }

  playerFacingDirection() {
    if (this.input.left) return -1;
    if (this.input.right) return 1;
    return this.player.facing || 1;
  }

  normalizeWeaponKey(raw) {
    if (!raw) return null;
    const normalized = String(raw).toLowerCase();
    const aliases = {
      flame: "flamethrower",
      flamethrower: "flamethrower",
      pistol: "pistol",
      silenced: "silenced",
      silent: "silenced",
      melee: "melee",
      saber: "saber",
      sabre: "saber",
      grenade: "grenade",
      launcher: "grenade",
      machine: "machine",
      machinegun: "machine"
    };
    return aliases[normalized] || normalized;
  }

  isWeaponLocked(weapon) {
    return this.lockedWeapons.has(weapon);
  }

  setWeapon(weapon) {
    if (!weapon) return;
    const normalized = this.normalizeWeaponKey(weapon);
    if (!normalized) return;
    if (this.isWeaponLocked(normalized)) {
      this.log("Weapon locked. Earn unlocks to equip it.");
      return;
    }
    if (this.player.weapon === normalized) {
      this.syncWeaponUi();
      return;
    }
    if (!this.player.attackCooldowns[normalized]) {
      this.player.attackCooldowns[normalized] = 300;
    }
    this.player.weapon = normalized;
    this.player.lastAttack = 0;
    this.syncWeaponUi();
  }

  syncWeaponUi() {
    if (!Array.isArray(this.weaponButtons)) return;
    this.weaponButtons.forEach((btn) => {
      const weapon = this.normalizeWeaponKey(btn.getAttribute("data-weapon"));
      if (!weapon) return;
      if (typeof btn.classList !== "undefined") {
        if (weapon === this.player.weapon) {
          btn.classList.add("active");
        } else {
          btn.classList.remove("active");
        }
        if (this.isWeaponLocked(weapon)) {
          btn.classList.add("locked");
          btn.setAttribute("aria-disabled", "true");
        } else {
          btn.classList.remove("locked");
          btn.removeAttribute("aria-disabled");
        }
      }
    });
  }

  toggleMap(force) {
    if (!this.map) return;
    const desired = typeof force === "boolean" ? force : !this.map.visible;
    this.map.visible = desired;
    if (this.map.panel && typeof this.map.panel.classList !== "undefined") {
      this.map.panel.classList.toggle("hidden", !desired);
      if (!desired && "style" in this.map.panel) {
        this.map.panel.style.display = "none";
      } else if (desired && "style" in this.map.panel) {
        this.map.panel.style.display = "";
      }
    }
    if (this.map.button && typeof this.map.button.classList !== "undefined") {
      this.map.button.classList.toggle("active", desired);
    }
    if (!this.map.panel) {
      this.log(`Minimap ${desired ? "shown" : "hidden"}.`);
    }
  }

  resolveMelee(hitbox, damage = DAMAGE_AMOUNT, source = "melee") {
    const hit = (entity) => (
      hitbox.x < entity.position.x + entity.width &&
      hitbox.x + hitbox.width > entity.position.x &&
      hitbox.y < entity.position.y + entity.height &&
      hitbox.y + hitbox.height > entity.position.y
    );
    const targets = [
      ...this.floorState.guards,
      ...this.floorState.officeWorkers,
      ...this.floorState.managers,
      ...this.floorState.boardMembers
    ];
    for (const target of targets) {
      if (!target.alive) continue;
      if (hit(target)) {
        this.damageEntity(target, damage, source);
      }
    }
    if (this.floorState.ceo && this.floorState.ceo.vulnerable) {
      const ceo = this.floorState.ceo;
      if (hit({ position: ceo.position, width: ceo.width, height: ceo.height })) {
        this.hitCeo(ceo, true);
      }
    }
  }

  resolveProjectileHits() {
    const playerRect = {
      x: this.player.position.x,
      y: this.player.position.y,
      width: this.player.width,
      height: this.player.height
    };

    const enemyProjectiles = [];
    this.floorState.guards.forEach((guard) => {
      if (guard.projectiles) enemyProjectiles.push(...guard.projectiles);
    });
    this.floorState.managers.forEach((manager) => {
      if (manager.projectiles) enemyProjectiles.push(...manager.projectiles);
    });

    for (const projectile of enemyProjectiles) {
      if (this.intersectsProjectile(playerRect, projectile)) {
        this.attemptDamagePlayer(projectile.weapon === "launcher" ? DAMAGE_AMOUNT * 2 : DAMAGE_AMOUNT, "projectile");
        projectile.distance = projectile.range;
      }
    }

    for (const projectile of this.projectiles) {
      const targets = [
        ...this.floorState.guards,
        ...this.floorState.officeWorkers,
        ...this.floorState.managers,
        ...this.floorState.boardMembers
      ];
      let hit = false;
      for (const target of targets) {
        if (!target.alive) continue;
        if (this.intersectsProjectileEntity(projectile, target)) {
          hit = true;
          const defeated = this.damageEntity(target, projectile.damage, projectile.weapon);
          if (projectile.weapon === "flame" && defeated) {
            this.player.score += 2;
          }
          break;
        }
      }
      if (!hit && this.floorState.ceo && this.floorState.ceo.vulnerable && this.intersectsProjectileEntity(projectile, this.floorState.ceo)) {
        hit = true;
        this.hitCeo(this.floorState.ceo, projectile.owner === this.player, projectile);
      }
      if (hit) {
        projectile.distance = projectile.range;
      }
    }
  }

  hitCeo(ceo, fromPlayer, projectile = null) {
    if (!fromPlayer) return;
    if (!ceo.vulnerable) return;
    const ceoCenter = ceo.position.x + ceo.width / 2;
    const hitX = projectile ? projectile.position.x : this.player.position.x + this.player.width / 2;
    if (ceo.direction > 0 && hitX > ceoCenter) {
      this.log("The CEO blocked the frontal hit. Get behind him!");
      return;
    }
    if (ceo.direction < 0 && hitX < ceoCenter) {
      this.log("The CEO blocked the frontal hit. Get behind him!");
      return;
    }
    if (!ceo.backHits) ceo.backHits = 0;
    ceo.backHits += 1;
    this.log(`You struck the CEO's back (${ceo.backHits}/3)!`);
    if (ceo.backHits >= 3) {
      ceo.alive = false;
      this.log("The CEO falls. The building trembles.");
      this.player.score += 200;
      this.advanceFloor();
    } else {
      ceo.vulnerable = false;
      ceo.state = "idle";
      ceo.timer = 0;
    }
  }

  intersectsProjectile(rect, projectile) {
    return (
      projectile.position.x + projectile.radius > rect.x &&
      projectile.position.x - projectile.radius < rect.x + rect.width &&
      projectile.position.y + projectile.radius > rect.y &&
      projectile.position.y - projectile.radius < rect.y + rect.height
    );
  }

  intersectsProjectileEntity(projectile, entity) {
    return this.intersectsProjectile({
      x: entity.position.x,
      y: entity.position.y,
      width: entity.width,
      height: entity.height
    }, projectile);
  }

  damageEntity(entity, amount, source = null) {
    if (!entity || !entity.alive) return false;
    const effectiveDamage = typeof amount === "number" ? amount : DAMAGE_AMOUNT;
    if (effectiveDamage <= 0) return false;

    if (entity.type === "guard") {
      if (typeof entity.maxHealth !== "number") {
        entity.maxHealth = DAMAGE_AMOUNT * 2;
      }
      if (typeof entity.health !== "number") {
        entity.health = entity.maxHealth;
      }
      entity.health = Math.max(0, entity.health - effectiveDamage);
      entity.lastDamagedAt = this.now;
      if (entity.health <= 0) {
        this.defeatEntity(entity);
        return true;
      }
      const flashEnd = this.now + 180;
      entity.hitFlashUntil = Math.max(entity.hitFlashUntil || 0, flashEnd);
      return false;
    }

    this.defeatEntity(entity);
    return true;
  }

  defeatEntity(entity) {
    entity.alive = false;
    if (entity.type === "guard") {
      entity.health = 0;
      entity.hitFlashUntil = 0;
      this.player.score += 10;
      this.log("Guard defeated. +$10 confidence.");
      entity.projectiles = [];
    } else if (entity.type === "worker") {
      this.player.score += 10;
      this.log("Office worker knocked out of overtime. +10 points.");
    } else if (entity.type === "manager") {
      this.player.score += 25;
      this.log("Office manager routed.");
      entity.projectiles = [];
    } else if (entity.type === "board") {
      this.player.score += 80;
      this.log(`Board member ${entity.ability.name} defeated.`);
      if (this.floorState.boardMembers.every((boss) => !boss.alive)) {
        this.unlockExit();
      }
    }
  }

  attemptDamagePlayer(amount, source) {
    this.player.damage(amount, source);
    if (this.floorState.boardMembers.some((boss) => boss.alive && boss.garnishActive)) {
      this.player.score = Math.max(0, this.player.score - amount);
      this.log("Wage garnish removed some of your score.");
    }
    this.updateHud();
  }

  handleAlarmSwitch(delta) {
    const alarmSwitch = this.floorState.alarmSwitch;
    if (!alarmSwitch || alarmSwitch.disabled || !this.floorState.alarmActive) {
      if (alarmSwitch && alarmSwitch.progress) {
        alarmSwitch.progress = Math.max(0, alarmSwitch.progress - delta * 0.5);
      }
      return;
    }
    const interacting = this.player.intersects({
      x: alarmSwitch.x,
      y: alarmSwitch.y,
      width: alarmSwitch.width,
      height: alarmSwitch.height
    }) && (this.input.attack || this.input.crouch);
    if (interacting) {
      alarmSwitch.progress = (alarmSwitch.progress || 0) + delta;
      if (alarmSwitch.progress >= 0.75) {
        this.floorState.disableAlarm();
      }
    } else {
      alarmSwitch.progress = Math.max(0, (alarmSwitch.progress || 0) - delta * 0.6);
    }
  }

  handlePlayerStomps() {
    if (this.player.velocity.y <= 180) return;
    const playerBottom = this.player.position.y + this.player.height;
    for (const guard of this.floorState.guards) {
      if (!guard.alive) continue;
      if (!this.player.intersects({
        x: guard.position.x,
        y: guard.position.y,
        width: guard.width,
        height: guard.height
      })) {
        continue;
      }
      const guardTop = guard.position.y;
      if (playerBottom >= guardTop && playerBottom <= guardTop + guard.height * 0.5) {
        this.damageEntity(guard, DAMAGE_AMOUNT, "stomp");
        this.player.velocity.y = -this.player.jumpStrength * 0.55;
        this.player.grounded = false;
        this.player.jumpCount = 1;
      }
    }
  }

  handleItems(delta) {
    for (const item of this.floorState.items) {
      if (!item.available) {
        item.cooldown -= delta;
        if (item.cooldown <= 0) {
          item.available = true;
          item.cooldown = item.spawnCooldown;
        }
        continue;
      }
      if (this.player.intersects({ x: item.x, y: item.y, width: item.width, height: item.height })) {
        this.collectItem(item);
      }
    }
  }

  manageVents() {
    const player = this.player;
    if (player.inVent) {
      if (!player.currentVent) {
        player.inVent = false;
        return;
      }
      const room = player.currentVent.linkedRoom;
      player.position.x = room.x + room.width / 2 - player.width / 2;
      player.position.y = room.y + room.height / 2 - player.height / 2;
      player.velocity.x = 0;
      player.velocity.y = 0;
      if ((this.input.down || this.input.up) && this.now - player.lastVentToggle > 400) {
        player.inVent = false;
        player.currentVent = null;
        player.position.x = player.originalVentPosition.x;
        player.position.y = player.originalVentPosition.y;
        player.lastVentToggle = this.now;
        this.log("You exit the vent back to the floor.");
      }
      return;
    }
    if (this.input.up && this.now - player.lastVentToggle > 400) {
      for (const vent of this.floorState.vents) {
        if (player.intersects({ x: vent.x, y: vent.y, width: vent.width, height: vent.height })) {
          player.inVent = true;
          player.currentVent = vent;
          player.originalVentPosition = { x: player.position.x, y: player.position.y };
          player.lastVentToggle = this.now;
          this.log("You slip into a maintenance vent.");
          break;
        }
      }
    }
  }

  collectItem(item) {
    if (item.type === "file" || item.type === "intel") {
      this.player.intel += 1;
      this.player.score += 5;
      this.log("Collected intel file.");
    } else if (item.type === "ammo") {
      const bonus = 10 + Math.floor(Math.random() * 10);
      this.player.score += 4;
      this.log(`Ammo pickup restocks your weapons (+${bonus} rounds).`);
    } else if (item.type === "money") {
      const payout = 15 + Math.floor(Math.random() * 20);
      this.player.score += payout;
      this.player.modifyBalance(20, `Found $${payout} in unclaimed reimbursements.`);
    } else if (item.type === "feather") {
      this.player.doubleFlight = true;
      this.player.maxJumps = 6;
      this.player.featherTimer = 8;
      this.log("Feather collected. Ride the updraft!");
    }
    item.available = false;
    item.cooldown = item.spawnCooldown * (item.spawnRateModifier || 1);
  }

  checkObjectives() {
    if (this.floorState.type === "server") {
      const allDestroyed = this.floorState.completedServers();
      if (allDestroyed && !this.floorState.smoke) {
        this.floorState.smoke = true;
        this.floorState.exitVisible = true;
        this.log("Servers detonated. Elevator unlocked.");
      }
    } else if (this.floorState.type === "boss") {
      if (this.floorState.boardMembers.every((boss) => !boss.alive) && (!this.floorState.ceo || !this.floorState.ceo.alive)) {
        this.floorState.exitVisible = true;
      }
    }

    if (this.floorState.exitVisible) {
      if (this.player.intersects({ x: this.floorState.exit.x, y: this.floorState.exit.y, width: this.floorState.exit.width, height: this.floorState.exit.height })) {
        this.advanceFloor();
      }
    }
  }

  unlockExit() {
    this.floorState.exitVisible = true;
  }

  completedServers() {
    return this.floorState.completedServers();
  }

  pickSafeGuardSpawn(spawnArea, exit, guard = null, avoidX = null) {
    const exitCenter = exit ? exit.x + (exit.width || 0) / 2 : CANVAS_WIDTH - 80;
    const clampWorld = (candidate) => Math.min(CANVAS_WIDTH - 60, Math.max(60, candidate));
    const safeFromSpawn = (x) => Math.abs(x - 80) >= FLASHLIGHT_RANGE * 2;
    const safeFromExit = (x) => Math.abs(x - exitCenter) >= FLASHLIGHT_RANGE * 1.5;
    const safeFromPlayer = (x) => (avoidX === null || avoidX === undefined) ? true : Math.abs(x - avoidX) >= FLASHLIGHT_RANGE * 2;
    const pickCandidate = () => {
      const baseWidth = spawnArea.width || (CANVAS_WIDTH - 160);
      const baseX = spawnArea.x || 0;
      return clampWorld(baseX + Math.random() * baseWidth);
    };
    let candidate = pickCandidate();
    let attempts = 0;
    while (!(safeFromSpawn(candidate) && safeFromExit(candidate) && safeFromPlayer(candidate)) && attempts < 12) {
      candidate = pickCandidate();
      attempts += 1;
    }
    if (!(safeFromSpawn(candidate) && safeFromExit(candidate) && safeFromPlayer(candidate))) {
      const direction = candidate < exitCenter ? 1 : -1;
      candidate = direction > 0 ? 80 + FLASHLIGHT_RANGE * 2 : exitCenter - FLASHLIGHT_RANGE * 1.5;
    }
    candidate = clampWorld(candidate);
    if (guard && guard.patrol) {
      candidate = Math.min(guard.patrol.max, Math.max(guard.patrol.min, candidate));
    }
    return candidate;
  }

  advanceFloor() {
    if (this.floor >= FLOOR_COUNT) {
      this.log("You escaped the corporate tower before midnight. Student loans forgiven (for now).");
      return;
    }
    this.floor += 1;
    this.disableHealUntil = 0;
    this.floorState = this.generateFloor(this.floor);
    this.player.respawn();
    this.setupObjectiveList();
    this.updateHud();
    this.syncWeaponUi();
    this.log(`Elevator ascends to floor ${this.floor}.`);
  }

  resetToFloor(floorNumber, dueToDeath = false) {
    this.floor = floorNumber;
    this.player.health = Math.min(PLAYER_CHECKING_MAX, PLAYER_START_CHECKING);
    this.player.savings = dueToDeath ? 0 : PLAYER_START_SAVINGS;
    this.disableHealUntil = 0;
    this.runStartMs = performance.now();
    this.pausedMs = 0;
    this.pauseStarted = null;
    this.midnightHandled = false;
    this.floorState = this.generateFloor(this.floor);
    this.player.respawn();
    this.setupObjectiveList();
    this.updateHud();
    if (this.map && this.map.visible) {
      this.toggleMap(false);
    }
    this.syncWeaponUi();
    if (dueToDeath) {
      this.log("Auto payment emptied your account. Starting over at floor 1.");
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const colorIndex = (this.floor - 1) % COLORS_BY_FLOOR.length;
    ctx.fillStyle = COLORS_BY_FLOOR[colorIndex];
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    this.drawDecor();
    this.drawSpotlights();
    this.drawServers();
    this.drawItems();
    this.drawVents();
    this.drawAlarmSwitch();
    this.drawGuards();
    this.drawWorkers();
    this.drawManagers();
    this.drawBoardMembers();
    this.drawCeo();
    this.drawPlayer();
    this.drawSmoke();
    this.drawExit();
    this.drawProjectiles();
  }

  drawDecor() {
    const ctx = this.ctx;
    for (const platform of this.floorState.platforms) {
      ctx.fillStyle = platform.color || "rgba(40, 60, 90, 0.9)";
      ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
    }
    for (const desk of this.floorState.desks) {
      ctx.fillStyle = "#2b3d58";
      ctx.fillRect(desk.x, desk.y, desk.width, desk.height);
    }
    for (const decor of this.floorState.decor) {
      ctx.fillStyle = decor.color;
      ctx.fillRect(decor.x, decor.y, decor.width, decor.height);
    }
  }

  drawSpotlights() {
    const ctx = this.ctx;
    const { spotlights, alarmActive } = this.floorState;
    if (!spotlights || !spotlights.length) return;
    ctx.save();
    for (const light of spotlights) {
      const active = alarmActive && light.active;
      const fill = active ? "rgba(255, 255, 190, 0.16)" : "rgba(120, 130, 150, 0.08)";
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(light.origin.x, light.origin.y);
      ctx.arc(light.origin.x, light.origin.y, light.radius, light.angle - light.beamWidth / 2, light.angle + light.beamWidth / 2, false);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = active ? "rgba(255, 230, 120, 0.4)" : "rgba(120, 140, 160, 0.25)";
      ctx.beginPath();
      ctx.arc(light.origin.x, light.origin.y, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawServers() {
    const ctx = this.ctx;
    for (const server of this.floorState.servers) {
      ctx.fillStyle = server.destroyed ? "rgba(120, 20, 20, 0.4)" : "#4dd6ff";
      ctx.fillRect(server.x, server.y, server.width, server.height);
      if (server.destroyed) {
        ctx.fillStyle = "rgba(200, 100, 40, 0.4)";
        ctx.fillRect(server.x - 4, server.y - 10, server.width + 8, 12);
      }
    }
  }

  drawItems() {
    const ctx = this.ctx;
    for (const item of this.floorState.items) {
      if (!item.available) continue;
      ctx.fillStyle = {
        file: "#ffd86b",
        intel: "#6bffde",
        ammo: "#f56bff",
        money: "#8bff6b",
        feather: "#fffb85"
      }[item.type];
      ctx.beginPath();
      ctx.ellipse(item.x + item.width / 2, item.y + item.height / 2, item.width / 2, item.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawVents() {
    const ctx = this.ctx;
    ctx.fillStyle = "#5b6d84";
    for (const vent of this.floorState.vents) {
      ctx.fillRect(vent.x, vent.y, vent.width, vent.height);
      if (this.player.inVent && this.player.currentVent === vent) {
        ctx.fillStyle = "rgba(120, 150, 180, 0.35)";
        const room = vent.linkedRoom;
        ctx.fillRect(room.x, room.y, room.width, room.height);
        ctx.fillStyle = "#5b6d84";
      }
    }
  }

  drawAlarmSwitch() {
    const alarmSwitch = this.floorState.alarmSwitch;
    if (!alarmSwitch) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = alarmSwitch.disabled ? "#3a6b4a" : "#ff9f45";
    ctx.fillRect(alarmSwitch.x, alarmSwitch.y, alarmSwitch.width, alarmSwitch.height);
    if (!alarmSwitch.disabled) {
      const progress = Math.min(1, (alarmSwitch.progress || 0) / 0.75);
      ctx.fillStyle = "#ff5533";
      ctx.fillRect(
        alarmSwitch.x + 6,
        alarmSwitch.y + alarmSwitch.height * (1 - progress),
        alarmSwitch.width - 12,
        alarmSwitch.height * progress
      );
    }
    ctx.restore();
  }

  drawGuards() {
    const ctx = this.ctx;
    for (const guard of this.floorState.guards) {
      if (!guard.alive) continue;
      const flashing = guard.hitFlashUntil && guard.hitFlashUntil > this.now;
      ctx.fillStyle = flashing ? "#ffd1d1" : "#ff6767";
      ctx.fillRect(guard.position.x, guard.position.y, guard.width, guard.height);
      if (typeof guard.health === "number" && typeof guard.maxHealth === "number" && guard.maxHealth > 0) {
        const ratio = Math.max(0, Math.min(1, guard.health / guard.maxHealth));
        ctx.fillStyle = "#1c1c1c";
        ctx.fillRect(guard.position.x, guard.position.y - 5, guard.width, 3);
        ctx.fillStyle = flashing ? "#ff7878" : "#ff4444";
        ctx.fillRect(guard.position.x, guard.position.y - 5, guard.width * ratio, 3);
      }
      if (guard.chasing) {
        ctx.strokeStyle = "rgba(255, 120, 120, 0.9)";
        ctx.lineWidth = 2;
        ctx.strokeRect(guard.position.x - 2, guard.position.y - 2, guard.width + 4, guard.height + 4);
        ctx.lineWidth = 1;
      }
      ctx.fillStyle = "rgba(255, 255, 200, 0.15)";
      ctx.beginPath();
      const startX = guard.position.x + guard.width / 2;
      const startY = guard.position.y + guard.height / 2;
      ctx.moveTo(startX, startY - 40);
      ctx.lineTo(startX + guard.direction * FLASHLIGHT_RANGE, startY - 60);
      ctx.lineTo(startX + guard.direction * FLASHLIGHT_RANGE, startY + 60);
      ctx.lineTo(startX, startY + 40);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ff6767";
    }
  }

  drawWorkers() {
    const ctx = this.ctx;
    ctx.fillStyle = "#ffc36b";
    for (const worker of this.floorState.officeWorkers) {
      if (!worker.alive) continue;
      ctx.fillRect(worker.position.x, worker.position.y, worker.width, worker.height);
    }
  }

  drawManagers() {
    const ctx = this.ctx;
    ctx.fillStyle = "#9c6bff";
    for (const manager of this.floorState.managers) {
      if (!manager.alive) continue;
      ctx.fillRect(manager.position.x, manager.position.y, manager.width, manager.height);
    }
  }

  drawBoardMembers() {
    const ctx = this.ctx;
    ctx.fillStyle = "#ff8bd1";
    for (const boss of this.floorState.boardMembers) {
      if (!boss.alive) continue;
      ctx.fillRect(boss.position.x, boss.position.y, boss.width, boss.height);
      ctx.fillStyle = "#ffe0f6";
      ctx.fillText(boss.ability.name, boss.position.x - 10, boss.position.y - 6);
      ctx.fillStyle = "#ff8bd1";
      if (boss.flicker && Math.floor(this.now / 200) % 2 === 0) {
        this.ctx.fillStyle = "rgba(20, 20, 20, 0.55)";
        this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        this.ctx.fillStyle = "#ff8bd1";
      }
    }
  }

  drawCeo() {
    const ceo = this.floorState.ceo;
    if (!ceo || !ceo.alive) return;
    const ctx = this.ctx;
    ctx.fillStyle = "#ff4444";
    ctx.fillRect(ceo.position.x, ceo.position.y, ceo.width, ceo.height);
    if (ceo.vulnerable) {
      ctx.fillStyle = "rgba(255, 200, 80, 0.45)";
      ctx.fillRect(ceo.position.x - 6, ceo.position.y - 6, ceo.width + 12, ceo.height + 12);
    }
  }

  drawPlayer() {
    const ctx = this.ctx;
    ctx.fillStyle = "#6be3ff";
    ctx.fillRect(this.player.position.x, this.player.position.y, this.player.width, this.player.height);
    if (this.player.hidden) {
      ctx.fillStyle = "rgba(30, 60, 80, 0.5)";
      ctx.fillRect(this.player.position.x, this.player.position.y, this.player.width, this.player.height);
    }
  }

  drawSmoke() {
    if (!this.floorState.smoke) return;
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(120, 120, 140, 0.2)";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  drawExit() {
    if (!this.floorState.exitVisible) return;
    const ctx = this.ctx;
    ctx.fillStyle = "#66ff88";
    ctx.fillRect(this.floorState.exit.x, this.floorState.exit.y, this.floorState.exit.width, this.floorState.exit.height);
  }

  drawProjectiles() {
    const ctx = this.ctx;
    ctx.fillStyle = "#fff";
    for (const projectile of this.projectiles) {
      ctx.beginPath();
      ctx.arc(projectile.position.x, projectile.position.y, projectile.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    this.floorState.guards.forEach((guard) => {
      if (!guard.projectiles) return;
      ctx.fillStyle = "#ff5555";
      guard.projectiles.forEach((projectile) => {
        ctx.beginPath();
        ctx.arc(projectile.position.x, projectile.position.y, projectile.radius, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    this.floorState.managers.forEach((manager) => {
      if (!manager.projectiles) return;
      ctx.fillStyle = "#ffb347";
      manager.projectiles.forEach((projectile) => {
        ctx.beginPath();
        ctx.arc(projectile.position.x, projectile.position.y, projectile.radius, 0, Math.PI * 2);
        ctx.fill();
      });
    });
  }

  updateHud() {
    const destroyed = this.floorState ? this.floorState.servers.filter((s) => s.destroyed).length : 0;
    const total = this.floorState ? this.floorState.servers.length : 0;
    if (this.hud.floor) {
      this.hud.floor.textContent = `Floor ${this.floor} / ${FLOOR_COUNT}`;
    }
    if (this.hud.health) {
      const value = Math.round(this.player.health);
      this.hud.health.textContent = this.hud.health.id === "checkVal" ? `$${value}` : `${value}`;
    }
    if (this.hud.savings) {
      const savingsValue = Math.round(this.player.savings);
      this.hud.savings.textContent = this.hud.savings.id === "saveVal" ? `$${savingsValue}` : `${savingsValue}`;
    }
    const checkingRatio = Math.min(1, this.player.health / PLAYER_CHECKING_MAX);
    const savingsRatio = Math.min(1, this.player.savings / PLAYER_SAVINGS_MAX);
    if (this.hud.checkingFill && this.hud.checkingFill.style) {
      this.hud.checkingFill.style.width = `${Math.round(checkingRatio * 100)}%`;
    }
    if (this.hud.savingsFill && this.hud.savingsFill.style) {
      this.hud.savingsFill.style.width = `${Math.round(savingsRatio * 100)}%`;
    }
    if (this.hud.score) {
      this.hud.score.textContent = this.player.score;
    }
    if (this.hud.intel) {
      const text = this.hud.intel.id === "intelPill" ? `Intel: ${this.player.intel}` : `${this.player.intel}`;
      this.hud.intel.textContent = text;
    }
    if (this.hud.servers) {
      const value = `${destroyed} / ${total}`;
      this.hud.servers.textContent = this.hud.servers.id === "servers" ? `Servers: ${value}` : value;
    }
  }

  updateClock() {
    if (!this.hud.clock) return;
    const nowMs = performance.now();
    const pausedDuration = this.pausedMs + (this.pauseStarted ? nowMs - this.pauseStarted : 0);
    const remaining = GAME_DURATION_REAL_MS - (nowMs - this.runStartMs - pausedDuration);
    this.handleMidnightTrigger(remaining);
    const formatted = formatCountdown(remaining);
    if (this.hud.clock.id === "time") {
      this.hud.clock.textContent = `${formatted} ➜ 12:00 AM`;
    } else {
      this.hud.clock.textContent = formatted;
    }
  }

  handleMidnightTrigger(remainingMs) {
    if (this.midnightHandled || remainingMs > 0) return;
    this.midnightHandled = true;
    const checkingFull = this.player.health >= PLAYER_CHECKING_MAX;
    const savingsFull = this.player.savings >= PLAYER_SAVINGS_MAX;
    if (!checkingFull || !savingsFull) {
      this.log("Midnight hit with insufficient funds. Your run resets.");
      this.resetToFloor(1, true);
      return;
    }
    this.player.health = 0;
    this.player.savings = 0;
    this.log("Midnight auto debit drained all accounts! Rebuild savings before healing.");
    this.updateHud();
  }

  log(message) {
    if (!this.logElement) {
      console.log(message);
      return;
    }
    const tag = document.createElement("span");
    tag.textContent = message;
    this.logElement.prepend(tag);
    while (this.logElement.childNodes.length > 12) {
      this.logElement.removeChild(this.logElement.lastChild);
    }
  }

  setupObjectiveList() {
    if (!this.objectiveList) return;
    this.objectiveList.innerHTML = "";
    const objectives = [];
    if (this.floorState.type === "server") {
      objectives.push("Collect intel files for bonuses.");
      objectives.push("Plant explosives on all servers (3-5).");
      objectives.push("Reach the elevator once smoke fills the floor.");
      if (this.floorState.spotlights.length) {
        objectives.push("Disable the alarm switch to power down sweeping spotlights.");
      }
    } else if (this.floorState.type === "boss" && this.floorState.ceo) {
      objectives.push("Survive the dual board ambush.");
      objectives.push("Bait the CEO's rampage and strike his back three times.");
    } else if (this.floorState.type === "boss") {
      objectives.push("Defeat the board member.");
      objectives.push(`Beware ability: ${this.floorState.boardMembers[0]?.ability.name || "Unknown"}.`);
    }
    objectives.push("Avoid guard flashlights unless hidden under desks.");
    objectives.push("Loot ammo, money, intel, and feathers.");
    objectives.forEach((objective) => {
      const li = document.createElement("li");
      li.textContent = objective;
      this.objectiveList.appendChild(li);
    });
  }

  generateFloor(floorNumber) {
    const type = this.determineFloorType(floorNumber);
    const basePlatforms = this.generatePlatforms(floorNumber, type);
    const desks = this.generateDesks(basePlatforms);
    const decor = this.generateDecor(basePlatforms);
    const vents = this.generateVents(basePlatforms);
    const spawnArea = { x: 40, y: CANVAS_HEIGHT - 140, width: CANVAS_WIDTH - 160, height: 0 };
    const exit = { x: CANVAS_WIDTH - 80, y: CANVAS_HEIGHT - 140, width: 60, height: 120 };

    const config = {
      type,
      platforms: basePlatforms,
      decor,
      desks,
      guards: [],
      officeWorkers: [],
      managers: [],
      boardMembers: [],
      ceo: null,
      items: [],
      servers: [],
      spotlights: [],
      alarmSwitch: null,
      alarmActive: false,
      vents,
      exit,
      spawnArea
    };

    if (type === "server") {
      config.servers = this.generateServers(basePlatforms);
      config.guards = this.generateGuards(floorNumber, spawnArea, exit, 0, basePlatforms);
      config.officeWorkers = this.generateWorkers(basePlatforms);
      config.managers = this.generateManagers(basePlatforms, floorNumber);
      config.items = this.generateItems(basePlatforms);
      config.spotlights = this.generateSpotlights(basePlatforms, floorNumber);
      config.alarmSwitch = this.generateAlarmSwitch(basePlatforms, config.spotlights, floorNumber);
      config.alarmActive = config.spotlights.length > 0;
    } else if (type === "boss" && floorNumber === FLOOR_COUNT) {
      config.boardMembers = this.generateBoardMembers(floorNumber, 2);
      config.ceo = this.generateCeo();
      config.guards = [];
      config.officeWorkers = [];
      config.managers = [];
      config.items = this.generateItems(basePlatforms, true);
      config.exitVisible = false;
    } else if (type === "boss") {
      config.boardMembers = this.generateBoardMembers(floorNumber, 1);
      config.guards = this.generateGuards(floorNumber, spawnArea, exit, 1, basePlatforms);
      config.managers = [];
      config.officeWorkers = this.generateWorkers(basePlatforms).slice(0, 2);
      config.servers = [];
      config.items = this.generateItems(basePlatforms, true);
    }

    return new FloorState(this, floorNumber, config);
  }

  determineFloorType(floorNumber) {
    if (floorNumber === FLOOR_COUNT) return "boss";
    if (floorNumber % 4 === 0) return "boss";
    return "server";
  }

  seededRandom(seed, offset = 0) {
    const value = Math.sin(seed * 9301 + offset * 49297) * 43758.5453;
    return value - Math.floor(value);
  }

  generatePlatforms(floorNumber, type) {
    if (type === "server") {
      return this.generateServerPlatforms(floorNumber);
    }
    return this.generateBossPlatforms();
  }

  generateServerPlatforms(floorNumber) {
    const layouts = [
      () => {
        const levelGap = 90;
        const baseY = CANVAS_HEIGHT - 140;
        const platforms = [];
        for (let i = 0; i < 4; i += 1) {
          const y = baseY - i * levelGap;
          const width = 180 - i * 12;
          const x = i % 2 === 0 ? 60 : CANVAS_WIDTH - width - 120;
          platforms.push({ x, y, width, height: 12, color: "rgba(32, 48, 86, 0.9)", solid: false });
        }
        platforms.push({ x: CANVAS_WIDTH / 2 - 70, y: baseY - levelGap / 2, width: 140, height: 12, color: "rgba(36, 58, 94, 0.9)", solid: false });
        return platforms;
      },
      () => {
        const platforms = [];
        const midY = CANVAS_HEIGHT - 160;
        platforms.push({ x: CANVAS_WIDTH / 2 - 120, y: midY, width: 240, height: 12, color: "rgba(38, 60, 96, 0.9)", solid: false });
        platforms.push({ x: 80, y: midY - 90, width: 160, height: 12, color: "rgba(34, 52, 90, 0.9)", solid: false });
        platforms.push({ x: CANVAS_WIDTH - 240, y: midY - 90, width: 160, height: 12, color: "rgba(34, 52, 90, 0.9)", solid: false });
        platforms.push({ x: CANVAS_WIDTH / 2 - 60, y: midY - 180, width: 120, height: 12, color: "rgba(44, 68, 104, 0.9)", solid: false });
        return platforms;
      },
      () => {
        const platforms = [];
        const bandHeights = [CANVAS_HEIGHT - 130, CANVAS_HEIGHT - 210, CANVAS_HEIGHT - 290];
        bandHeights.forEach((y, index) => {
          const segmentCount = index === 0 ? 3 : 4;
          const gap = CANVAS_WIDTH / segmentCount;
          for (let i = 0; i < segmentCount; i += 1) {
            const width = gap * 0.55;
            const x = i * gap + ((i + index) % 2 === 0 ? gap * 0.15 : gap * 0.25);
            platforms.push({ x, y: y - index * 6, width, height: 12, color: "rgba(30, 46, 82, 0.9)", solid: false });
          }
        });
        return platforms;
      },
      () => {
        const platforms = [];
        const ladderX = CANVAS_WIDTH / 2 - 50;
        for (let i = 0; i < 5; i += 1) {
          const y = CANVAS_HEIGHT - 120 - i * 70;
          platforms.push({ x: ladderX - 80 + (i % 2 === 0 ? -40 : 40), y, width: 160, height: 12, color: "rgba(40, 62, 104, 0.9)", solid: false });
        }
        platforms.push({ x: ladderX - 30, y: CANVAS_HEIGHT - 470, width: 60, height: 12, color: "rgba(48, 74, 118, 0.9)", solid: false });
        return platforms;
      },
      () => {
        const platforms = [];
        const ringY = CANVAS_HEIGHT - 200;
        platforms.push({ x: 60, y: ringY, width: 180, height: 12, color: "rgba(36, 54, 92, 0.9)", solid: false });
        platforms.push({ x: CANVAS_WIDTH - 240, y: ringY, width: 180, height: 12, color: "rgba(36, 54, 92, 0.9)", solid: false });
        platforms.push({ x: CANVAS_WIDTH / 2 - 70, y: ringY - 90, width: 140, height: 12, color: "rgba(46, 70, 112, 0.9)", solid: false });
        platforms.push({ x: CANVAS_WIDTH / 2 - 180, y: ringY + 60, width: 120, height: 12, color: "rgba(44, 68, 110, 0.9)", solid: false });
        platforms.push({ x: CANVAS_WIDTH / 2 + 60, y: ringY + 60, width: 120, height: 12, color: "rgba(44, 68, 110, 0.9)", solid: false });
        return platforms;
      }
    ];

    const layoutIndex = (floorNumber - 1) % layouts.length;
    const platforms = layouts[layoutIndex]();
    const randomPods = 2 + Math.floor(this.seededRandom(floorNumber, 1) * 3);
    for (let i = 0; i < randomPods; i += 1) {
      const rand = this.seededRandom(floorNumber, 20 + i * 7);
      const x = 40 + rand * (CANVAS_WIDTH - 160);
      const y = CANVAS_HEIGHT - 140 - this.seededRandom(floorNumber, 40 + i * 11) * 240;
      let width = 80 + this.seededRandom(floorNumber, 60 + i * 13) * 90;
      width = Math.min(width, CANVAS_WIDTH - 40 - x);
      width = Math.max(60, width);
      platforms.push({ x, y, width, height: 12, color: "rgba(28, 44, 78, 0.85)", solid: false });
    }

    platforms.push({ x: 0, y: CANVAS_HEIGHT - 20, width: CANVAS_WIDTH, height: 20, color: "#121a2d", solid: true });
    return platforms;
  }

  generateBossPlatforms() {
    const layers = 3 + Math.floor(Math.random() * 2);
    const platforms = [];
    const layerHeight = CANVAS_HEIGHT / (layers + 1);
    for (let i = 1; i <= layers; i += 1) {
      const y = CANVAS_HEIGHT - i * layerHeight;
      const segments = 3 + Math.floor(Math.random() * 2);
      const segmentWidth = CANVAS_WIDTH / segments;
      for (let j = 0; j < segments; j += 1) {
        const width = segmentWidth * 0.8;
        const x = j * segmentWidth + segmentWidth * 0.1;
        platforms.push({
          x,
          y,
          width,
          height: 12,
          color: "rgba(30, 40, 66, 0.85)",
          solid: false
        });
      }
    }
    platforms.push({ x: 0, y: CANVAS_HEIGHT - 20, width: CANVAS_WIDTH, height: 20, color: "#121a2d", solid: true });
    return platforms;
  }

  generateDesks(platforms) {
    const desks = [];
    for (const platform of platforms) {
      if (platform.y > CANVAS_HEIGHT - 100) continue;
      if (Math.random() > 0.4) continue;
      desks.push({
        x: platform.x + Math.random() * (platform.width - 80),
        y: platform.y - 20,
        width: 80,
        height: 20
      });
    }
    return desks;
  }

  generateDecor(platforms) {
    const decor = [];
    for (let i = 0; i < 6; i += 1) {
      decor.push({
        x: Math.random() * (CANVAS_WIDTH - 30),
        y: CANVAS_HEIGHT - 60 - Math.random() * 30,
        width: 20 + Math.random() * 16,
        height: 60 + Math.random() * 40,
        color: "rgba(60, 90, 120, 0.45)"
      });
    }
    for (let i = 0; i < 4; i += 1) {
      decor.push({
        x: Math.random() * (CANVAS_WIDTH - 16),
        y: CANVAS_HEIGHT - 90 - Math.random() * 80,
        width: 16,
        height: 40,
        color: "rgba(120, 180, 200, 0.35)"
      });
    }
    return decor;
  }

  generateVents(platforms) {
    const vents = [];
    const uniquePlatforms = platforms.filter((p) => p.y < CANVAS_HEIGHT - 80 && Math.random() > 0.7);
    for (const platform of uniquePlatforms) {
      vents.push({
        x: platform.x + platform.width / 2 - 20,
        y: platform.y - 18,
        width: 40,
        height: 18,
        linkedRoom: {
          x: platform.x + platform.width / 2 - 40,
          y: platform.y - 80,
          width: 80,
          height: 50
        }
      });
    }
    return vents;
  }

  generateServers(platforms) {
    const servers = [];
    const eligible = platforms.filter((platform) => platform.y < CANVAS_HEIGHT - 30);
    const count = SERVER_MIN + Math.floor(Math.random() * (SERVER_MAX - SERVER_MIN + 1));
    if (!eligible.length) return servers;
    const placed = [];
    for (let i = 0; i < count; i += 1) {
      const platform = eligible[Math.floor(Math.random() * eligible.length)];
      let x = platform.x + 12 + Math.random() * Math.max(12, platform.width - 48);
      let attempts = 0;
      while (attempts < 6 && placed.some((prev) => Math.abs(prev - x) < 60)) {
        x = platform.x + 12 + Math.random() * Math.max(12, platform.width - 48);
        attempts += 1;
      }
      placed.push(x);
      servers.push({
        x,
        y: platform.y - 48,
        width: 36,
        height: 48,
        destroyed: false,
        destroyedAt: 0
      });
    }
    return servers;
  }

  generateSpotlights(platforms, floorNumber) {
    const spotlights = [];
    const candidates = platforms.filter((platform) => !platform.solid && platform.y < CANVAS_HEIGHT - 60);
    if (!candidates.length) return spotlights;
    const count = Math.min(3, 2 + Math.floor(floorNumber / 10));
    for (let i = 0; i < count; i += 1) {
      const platform = candidates[i % candidates.length];
      const rand = this.seededRandom(floorNumber, 320 + i * 37);
      const horizontalSpan = Math.max(60, platform.width - 20);
      const baseX = platform.x + platform.width / 2 - horizontalSpan / 2;
      const originX = Math.max(40, Math.min(CANVAS_WIDTH - 40, baseX + rand * horizontalSpan));
      const originY = Math.max(48, platform.y - 220 - this.seededRandom(floorNumber, 360 + i * 17) * 40);
      const baseAngle = Math.PI / 2 + (this.seededRandom(floorNumber, 400 + i * 19) - 0.5) * 0.8;
      const sweepRange = 0.35 + this.seededRandom(floorNumber, 440 + i * 23) * 0.45;
      const beamWidth = Math.PI / 6 + this.seededRandom(floorNumber, 480 + i * 29) * 0.25;
      const radius = 420;
      const minAngle = baseAngle - sweepRange;
      const maxAngle = baseAngle + sweepRange;
      spotlights.push({
        origin: { x: originX, y: originY },
        angle: baseAngle,
        minAngle,
        maxAngle,
        beamWidth,
        radius,
        sweepSpeed: 0.45 + this.seededRandom(floorNumber, 520 + i * 31) * 0.85,
        direction: i % 2 === 0 ? 1 : -1,
        active: true
      });
    }
    return spotlights;
  }

  generateAlarmSwitch(platforms, spotlights, floorNumber) {
    if (!spotlights || !spotlights.length) return null;
    const candidates = platforms.filter((platform) => !platform.solid && platform.width >= 80);
    if (!candidates.length) return null;
    const index = Math.floor(this.seededRandom(floorNumber, 560) * candidates.length);
    const platform = candidates[index];
    const x = platform.x + platform.width - 48;
    return {
      x,
      y: platform.y - 42,
      width: 32,
      height: 42,
      progress: 0,
      disabled: false
    };
  }

  generateItems(platforms, bossFloor = false) {
    const items = [];
    if (!platforms.length) return items;
    const guaranteed = ["file", "intel", "ammo", "money", "feather"];
    const pool = [...guaranteed];
    const extraPool = ["file", "intel", "ammo", "ammo", "money", "money", "file", "intel", "feather"];
    const count = bossFloor ? 12 : 18;
    while (pool.length < count) {
      pool.push(extraPool[Math.floor(Math.random() * extraPool.length)]);
    }
    const spawnCooldownByType = {
      file: 14,
      intel: 18,
      ammo: 16,
      money: 20,
      feather: 26
    };
    pool.forEach((type) => {
      const platform = platforms[Math.floor(Math.random() * platforms.length)];
      items.push({
        type,
        x: platform.x + 8 + Math.random() * Math.max(4, platform.width - 24),
        y: platform.y - 24,
        width: 18,
        height: 18,
        available: true,
        spawnCooldown: spawnCooldownByType[type] + Math.random() * 6,
        cooldown: 0,
        spawnRateModifier: 1
      });
    });
    return items;
  }

  generateGuards(floorNumber, spawnArea, exit, extra = 0, platforms = []) {
    const guards = [];
    const total = 4 + Math.floor(floorNumber / 3) + extra;
    for (let i = 0; i < total; i += 1) {
      const guard = this.generateGuard(floorNumber, {}, platforms);
      const avoidX = this.player ? this.player.position.x : null;
      guard.position.x = this.pickSafeGuardSpawn(spawnArea, exit, guard, avoidX);
      guard.position.y = guard.basePlatform ? guard.basePlatform.y - guard.height : CANVAS_HEIGHT - 140 - Math.random() * 120;
      guards.push(guard);
    }
    return guards;
  }

  generateGuard(floorNumber, overrides = {}, platforms = []) {
    const level = Math.ceil(floorNumber / 4);
    const weaponProgression = [
      ["pistol"],
      ["pistol", "auto"],
      ["pistol", "auto", "ninja"],
      ["pistol", "auto", "ninja", "launcher"]
    ];
    const poolIndex = Math.min(weaponProgression.length - 1, Math.floor((floorNumber - 1) / 6));
    const pool = weaponProgression[poolIndex];
    let weapon = pool[Math.floor(Math.random() * pool.length)];
    if (overrides.weapon) weapon = overrides.weapon;
    const profile = GUARD_WEAPON_PROFILES[weapon] || GUARD_WEAPON_PROFILES.pistol;
    const baseHealth = overrides.maxHealth ?? overrides.health ?? DAMAGE_AMOUNT * 2;
    const guard = {
      type: "guard",
      width: 28,
      height: 52,
      position: { x: 0, y: CANVAS_HEIGHT - 140 },
      direction: Math.random() > 0.5 ? 1 : -1,
      speed: Math.max(30, 40 + level * 10 + (profile.speedBonus || 0)),
      patrol: { min: 40, max: CANVAS_WIDTH - 200 },
      weapon,
      shotInterval: profile.shotInterval,
      attackInterval: profile.attackInterval,
      lastShot: 0,
      lastAttackTime: 0,
      lastStrike: 0,
      lastTackle: 0,
      alive: true,
      maxHealth: baseHealth,
      health: baseHealth,
      hitFlashUntil: 0,
      aggressive: overrides.aggressive || false
    };
    const availablePlatforms = platforms.filter((platform) => platform.y < CANVAS_HEIGHT - 20);
    const basePlatform = overrides.basePlatform || (availablePlatforms.length ? availablePlatforms[Math.floor(Math.random() * availablePlatforms.length)] : null);
    if (basePlatform) {
      guard.basePlatform = basePlatform;
      guard.position.y = basePlatform.y - guard.height;
      const min = basePlatform.x + 12;
      const max = basePlatform.x + basePlatform.width - guard.width - 12;
      guard.patrol = {
        min: Math.max(12, min),
        max: Math.max(min + 40, max)
      };
    }
    guard.flashlight = { x: guard.position.x, y: guard.position.y, length: FLASHLIGHT_RANGE, direction: guard.direction };
    guard.projectiles = [];
    guard.chasing = false;
    guard.chaseTimer = 0;
    guard.lastKnownPlayerX = guard.position.x;
    return guard;
  }

  generateWorkers(platforms) {
    const workers = [];
    const suitable = platforms.filter((p) => p.y < CANVAS_HEIGHT - 60);
    const workerPlatforms = suitable.length ? suitable : [{ x: 40, y: CANVAS_HEIGHT - 60, width: CANVAS_WIDTH - 80, height: 12 }];
    const count = Math.min(6, Math.max(2, workerPlatforms.length * 2));
    for (let i = 0; i < count; i += 1) {
      const platform = workerPlatforms[i % workerPlatforms.length];
      const startX = platform.x + Math.random() * Math.max(40, platform.width - 24);
      workers.push({
        type: "worker",
        position: { x: startX, y: platform.y - 44 },
        width: 24,
        height: 44,
        direction: Math.random() > 0.5 ? 1 : -1,
        speed: 28 + (i % 3) * 4,
        patrol: { min: platform.x, max: platform.x + platform.width - 24 },
        alive: true,
        passive: true
      });
    }
    return workers;
  }

  generateManagers(platforms, floorNumber) {
    const managers = [];
    const count = Math.max(1, Math.floor(floorNumber / 6));
    const highPlatforms = platforms.filter((p) => p.y < CANVAS_HEIGHT - 120);
    for (let i = 0; i < count; i += 1) {
      const platform = highPlatforms[i % highPlatforms.length];
      managers.push({
        type: "manager",
        position: { x: platform.x + platform.width / 2, y: platform.y - 52 },
        width: 30,
        height: 52,
        direction: Math.random() > 0.5 ? 1 : -1,
        speed: 20,
        patrol: { min: platform.x, max: platform.x + platform.width - 30 },
        alive: true,
        projectiles: []
      });
    }
    return managers;
  }

  generateBoardMembers(floorNumber, count) {
    const bosses = [];
    const abilityIndex = Math.floor(floorNumber / 4) - 1;
    for (let i = 0; i < count; i += 1) {
      const ability = BOARD_ABILITIES[(abilityIndex + i) % BOARD_ABILITIES.length];
      bosses.push({
        type: "board",
        position: { x: CANVAS_WIDTH / 2 + i * 80 - 40, y: CANVAS_HEIGHT - 180 },
        width: 40,
        height: 80,
        direction: i % 2 === 0 ? -1 : 1,
        speed: 45,
        patrol: { min: 160, max: CANVAS_WIDTH - 200 },
        ability,
        alive: true
      });
    }
    return bosses;
  }

  generateCeo() {
    return {
      type: "ceo",
      position: { x: CANVAS_WIDTH / 2 - 60, y: CANVAS_HEIGHT - 220 },
      width: 120,
      height: 160,
      direction: 1,
      speed: 260,
      state: "idle",
      timer: 0,
      patrol: { min: 80, max: CANVAS_WIDTH - 200 },
      vulnerable: false,
      alive: true,
      backHits: 0
    };
  }

  handleServerExplosives() {
    for (const server of this.floorState.servers) {
      if (!server.destroyed && this.player.intersects({ x: server.x, y: server.y, width: server.width, height: server.height })) {
        server.destroyed = true;
        server.destroyedAt = this.now;
        this.log("Server primed and detonated.");
        this.player.score += 25;
      }
    }
  }

  updateServerProgress() {
    if (!this.floorState) return;
    const destroyed = this.floorState.servers.filter((s) => s.destroyed).length;
    const total = this.floorState.servers.length;
    if (this.hud.servers) {
      const value = `${destroyed} / ${total}`;
      this.hud.servers.textContent = this.hud.servers.id === "servers" ? `Servers: ${value}` : value;
    }
  }

  update(delta) {
    this.player.projectileSpeedModifier = 1;
    this.player.jumpModifier = 1;
    this.player.canHeal = true;
    if (this.disableHealUntil > this.now) {
      this.player.canHeal = false;
    }

    this.floorState.update(delta);
    this.manageVents();
    this.player.update(delta);
    this.floorState.evaluateSpotlights(this.player);
    this.handleAlarmSwitch(delta);
    this.handlePlayerStomps();

    this.handleProjectiles(delta);
    this.handleItems(delta);
    if (this.floorState.type === "server") {
      this.handleServerExplosives();
    }
    this.checkObjectives();
    this.updateServerProgress();
    this.updateHud();
  }
}

const canvasElement = document.getElementById("game-canvas") || document.getElementById("game");
if (canvasElement) {
  const game = new Game(canvasElement);
  window.gameInstance = game;
} else {
  console.error("Unable to initialise game: canvas element missing");
}
