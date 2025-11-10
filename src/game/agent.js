export class Agent {
  constructor({
    x = 0,
    y = 0,
    w = 20,
    h = 42,
    vx = 0,
    hp = 20,
    maxHp = hp,
    dmg = 10,
    type = 'guard',
    suit = false,
    lastShot = 0,
    weapon = 'pistol',
    attackInterval = 900,
    shotInterval = 700,
    speed = 0,
    direction = 1,
    aggressive = false,
    chaser = false
  } = {}) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.vx = vx;
    this.hp = hp;
    this.maxHp = maxHp;
    this.dmg = dmg;
    this.suit = suit;
    this.lastShot = lastShot;
    this.weapon = weapon;
    this.attackInterval = attackInterval;
    this.shotInterval = shotInterval;
    this.speed = speed;
    this.direction = direction >= 0 ? 1 : -1;
    this.aggressive = aggressive;
    this.projectiles = [];
    this.t = 0;
    this.shoot = true;
    this.hitFlashUntil = 0;
    this.lastAttack = 0;
    this.lastStrike = 0;
    this.lastTackle = 0;
    this.chasing = chaser;
    this.chaseTimer = 0;
    this.spotted = false;
    this.lastKnownX = this.x;
  }

  face(dir) {
    if (dir === 0) return;
    this.direction = dir > 0 ? 1 : -1;
  }

  takeDamage(amount) {
    const dmg = Number.isFinite(amount) ? amount : 0;
    if (dmg <= 0) return false;
    this.hp = Math.max(0, this.hp - dmg);
    if (this.hp === 0) {
      this.projectiles.length = 0;
      return true;
    }
    return false;
  }

  heal(amount) {
    const val = Number.isFinite(amount) ? amount : 0;
    if (val <= 0) return;
    this.hp = Math.min(this.maxHp, this.hp + val);
  }

  readyToShoot(now) {
    if (this.shotInterval <= 0) return true;
    if (!this.lastShot) return true;
    return now - this.lastShot >= this.shotInterval;
  }

  markShot(now) {
    this.lastShot = now;
  }

  readyToAttack(now) {
    if (this.attackInterval <= 0) return true;
    if (!this.lastAttack) return true;
    return now - this.lastAttack >= this.attackInterval;
  }

  markAttack(now) {
    this.lastAttack = now;
  }
}
