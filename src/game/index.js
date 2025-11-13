import { createLevel19 } from '../levels/level19.js';
import { renderLevel19Scene } from '../levels/level19_render.js';

const runtime = {
  active: false,
  finishing: false,
  level: null,
  renderer: null,
  player: null,
  rafId: 0,
  lastFrame: 0,
  runStats: null,
  lastResult: null,
  disposables: [],
  timers: [],
  pointerHint: null
};

let stylesInjected = false;

function ensureCanvas() {
  const canvas = document.getElementById('game');
  if (!canvas) {
    throw new Error('LoanTower: unable to locate <canvas id="game"> element.');
  }
  return canvas;
}

function ensureHudStyles() {
  if (stylesInjected) return;
  const style = document.createElement('style');
  style.textContent = `
    .pointer-hint {
      position: fixed;
      left: 50%;
      bottom: 8%;
      transform: translateX(-50%);
      padding: 0.75rem 1.25rem;
      background: rgba(12, 16, 28, 0.72);
      border: 1px solid rgba(180, 220, 255, 0.35);
      border-radius: 12px;
      font: 0.85rem 'JetBrains Mono', monospace;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #f6faff;
      pointer-events: none;
      opacity: 1;
      transition: opacity 180ms ease;
      z-index: 80;
    }
    .run-end-banner {
      position: fixed;
      top: 18%;
      left: 50%;
      transform: translateX(-50%);
      padding: 1rem 1.6rem;
      background: rgba(14, 18, 30, 0.9);
      border: 1px solid rgba(210, 180, 255, 0.45);
      border-radius: 16px;
      font: 1rem 'Press Start 2P', monospace;
      letter-spacing: 0.1em;
      text-align: center;
      color: #f5edff;
      z-index: 85;
      opacity: 1;
      transition: opacity 320ms ease-out;
    }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function hideLegacyHud() {
  const hud = document.querySelector('.hudBox');
  if (hud) {
    hud.style.display = 'none';
  }
  const center = document.querySelector('.center');
  if (center) {
    center.style.display = 'none';
  }
}

function trackDisposable(dispose) {
  if (typeof dispose === 'function') {
    runtime.disposables.push(dispose);
  }
}

function addEvent(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  trackDisposable(() => target.removeEventListener(type, handler, options));
}

function addTimer(fn, delay) {
  const id = window.setTimeout(fn, delay);
  runtime.timers.push(id);
  return id;
}

function clearTimers() {
  for (const id of runtime.timers) {
    window.clearTimeout(id);
  }
  runtime.timers.length = 0;
}

function createPlayer(name) {
  const playerName = name && name.trim() ? name.trim() : 'Runner';
  const player = {
    name: playerName,
    health: 100,
    maxHealth: 100,
    loanBalance: 120000,
    debt: 120000,
    hasElevatorKey: false,
    position: { x: 0, y: 0, z: 0 },
    viewDirection: { x: 0, y: -1, z: 0 },
    applyDamage(amount) {
      if (!Number.isFinite(amount) || amount <= 0) return;
      this.health = Math.max(0, this.health - amount);
      if (this.health === 0) {
        handlePlayerDefeated();
      }
    },
    addDebt(amount) {
      if (!Number.isFinite(amount) || amount <= 0) return;
      this.debt = (this.debt ?? this.loanBalance ?? 0) + amount;
      this.loanBalance = this.debt;
    }
  };
  return player;
}

function handlePlayerDefeated() {
  if (!runtime.active || runtime.finishing) return;
  runtime.runStats.deaths = (runtime.runStats.deaths || 0) + 1;
  endRun('death', 'You were consumed by the executives.');
}

function updatePointerHint() {
  if (!runtime.pointerHint) return;
  const canvas = document.pointerLockElement;
  const locked = canvas === ensureCanvas();
  runtime.pointerHint.style.opacity = locked ? '0' : '1';
}

function removePointerHint() {
  if (runtime.pointerHint && runtime.pointerHint.parentNode) {
    runtime.pointerHint.parentNode.removeChild(runtime.pointerHint);
  }
  runtime.pointerHint = null;
}

function createPointerHint() {
  ensureHudStyles();
  removePointerHint();
  const hint = document.createElement('div');
  hint.className = 'pointer-hint';
  hint.textContent = 'Click to focus • WASD move • Mouse look • E interact • Click shoot';
  document.body.appendChild(hint);
  runtime.pointerHint = hint;
  updatePointerHint();
}

function showEndBanner(message, duration = 2600) {
  if (!message) return;
  ensureHudStyles();
  const banner = document.createElement('div');
  banner.className = 'run-end-banner';
  banner.textContent = message;
  document.body.appendChild(banner);
  addTimer(() => {
    banner.style.opacity = '0';
    addTimer(() => {
      if (banner.parentNode) {
        banner.parentNode.removeChild(banner);
      }
    }, 420);
  }, duration);
}

function tryInteract() {
  if (!runtime.level || !runtime.renderer) return;
  runtime.level.interact({
    player: runtime.player,
    performRaycast: runtime.renderer.performRaycast,
    hasLineOfSight: runtime.renderer.hasLineOfSight
  });
}

function handleKeyDown(event) {
  if (!runtime.active) return;
  if (event.code === 'KeyE') {
    event.preventDefault();
    tryInteract();
  }
}

function handleMouseDown(event) {
  if (!runtime.active || event.button !== 0) return;
  if (!runtime.renderer || !runtime.renderer.controls?.isLocked?.()) return;
  const hit = runtime.renderer.shoot();
  if (hit && (hit.type === 'executive' || hit.type === 'enemy')) {
    runtime.runStats.kills = (runtime.runStats.kills || 0) + 1;
  }
}

function animationLoop(timestamp) {
  if (!runtime.active) return;
  if (!runtime.lastFrame) {
    runtime.lastFrame = timestamp;
  }
  const dt = Math.min(0.1, (timestamp - runtime.lastFrame) / 1000);
  runtime.lastFrame = timestamp;

  runtime.renderer?.render(dt);
  runtime.level?.update(dt, {
    player: runtime.player,
    performRaycast: runtime.renderer?.performRaycast,
    hasLineOfSight: runtime.renderer?.hasLineOfSight
  });

  runtime.rafId = window.requestAnimationFrame(animationLoop);
}

function cleanup() {
  if (runtime.rafId) {
    window.cancelAnimationFrame(runtime.rafId);
    runtime.rafId = 0;
  }
  runtime.lastFrame = 0;
  clearTimers();
  while (runtime.disposables.length) {
    const dispose = runtime.disposables.pop();
    try {
      dispose();
    } catch (err) {
      console.warn('LoanTower cleanup error', err);
    }
  }
  runtime.level?.destroy?.();
  runtime.renderer?.dispose?.();
  runtime.level = null;
  runtime.renderer = null;
  runtime.player = null;
  removePointerHint();
  runtime.active = false;
}

function buildRunDetail(outcome) {
  const now = performance.now();
  const stats = runtime.runStats || {};
  const duration = stats.start ? Math.max(0, now - stats.start) : 0;
  const player = runtime.player || {};
  return {
    outcome: outcome || 'unknown',
    name: player.name || 'Runner',
    timeMs: Math.round(duration),
    loanRemaining: Math.round(player.loanBalance ?? player.debt ?? 0),
    kills: stats.kills || 0,
    deaths: stats.deaths || (outcome === 'death' ? 1 : 0),
    refinances: stats.refinances || 0,
    score: 0,
    floor: 19
  };
}

function endRun(outcome, message) {
  if (runtime.finishing) return;
  runtime.finishing = true;
  if (document.pointerLockElement === ensureCanvas()) {
    document.exitPointerLock();
  }
  const detail = buildRunDetail(outcome);
  runtime.lastResult = detail;
  cleanup();
  if (message) {
    showEndBanner(message);
  }
  window.dispatchEvent(new CustomEvent('loanTower:end', { detail }));
  runtime.finishing = false;
}

function startRun(name) {
  ensureHudStyles();
  hideLegacyHud();
  cleanup();
  runtime.lastResult = null;
  runtime.finishing = false;

  const canvas = ensureCanvas();
  const player = createPlayer(name);
  const level = createLevel19({
    seed: 'level19',
    player,
    onLevelComplete: () => {
      endRun('victory', 'Elevator unlocked. You escaped Level 19.');
    }
  });
  level.initialise({ player });
  const renderer = renderLevel19Scene(level.layout, player, {
    canvas,
    executiveController: level.executives,
    movementSpeed: 4.6,
    visibilityRadius: 12
  });
  level.crosshair?.showToast('Find the elevator key. Search the cubicles.');

  runtime.active = true;
  runtime.level = level;
  runtime.renderer = renderer;
  runtime.player = player;
  runtime.runStats = { start: performance.now(), kills: 0, deaths: 0, refinances: 0 };
  runtime.lastFrame = 0;

  createPointerHint();
  addEvent(document, 'pointerlockchange', updatePointerHint, false);
  addEvent(window, 'keydown', handleKeyDown, false);
  addEvent(window, 'mousedown', handleMouseDown, false);
  addEvent(window, 'blur', () => {
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
  }, false);

  try {
    canvas.focus({ preventScroll: true });
  } catch {
    canvas.focus();
  }

  runtime.rafId = window.requestAnimationFrame(animationLoop);
}

window.LoanTowerBridge = {
  startRun,
  isRunning: () => runtime.active,
  getLastResult: () => runtime.lastResult
};

function onReady() {
  hideLegacyHud();
  window.dispatchEvent(new Event('loanTowerReady'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', onReady);
} else {
  onReady();
}
