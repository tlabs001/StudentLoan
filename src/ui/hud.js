/**
 * Heads-up display helpers shared by the first-person levels.
 *
 * Level 19 introduces a minimalist crosshair that changes colour when hovering
 * over hostile entities, plus a toast system for loot notifications.
 */

const DEFAULT_CROSSHAIR_OPTIONS = {
  radius: 4,
  neutralColour: 'rgba(255,255,255,0.85)',
  hostileColour: 'rgba(255,64,64,0.95)',
  transitionMs: 80
};

export class CrosshairHUD {
  constructor(options = {}) {
    this.options = { ...DEFAULT_CROSSHAIR_OPTIONS, ...options };
    this.root = options.root || document.body;
    this.element = document.createElement('div');
    this.element.className = 'crosshair-dot';
    this.element.style.position = 'fixed';
    this.element.style.left = '50%';
    this.element.style.top = '50%';
    this.element.style.transform = 'translate(-50%, -50%)';
    this.element.style.width = `${this.options.radius * 2}px`;
    this.element.style.height = `${this.options.radius * 2}px`;
    this.element.style.borderRadius = '999px';
    this.element.style.pointerEvents = 'none';
    this.element.style.zIndex = 60;
    this.element.style.transition = `background-color ${this.options.transitionMs}ms ease-out`;
    this.element.style.background = this.options.neutralColour;
    this.root.appendChild(this.element);

    this.toast = document.createElement('div');
    this.toast.className = 'hud-toast';
    this.toast.style.position = 'fixed';
    this.toast.style.left = '50%';
    this.toast.style.bottom = '12%';
    this.toast.style.transform = 'translateX(-50%)';
    this.toast.style.padding = '10px 16px';
    this.toast.style.borderRadius = '12px';
    this.toast.style.background = 'rgba(0,0,0,0.72)';
    this.toast.style.color = '#f7f7f7';
    this.toast.style.font = '12px monospace';
    this.toast.style.opacity = '0';
    this.toast.style.transition = 'opacity 200ms ease-out';
    this.toast.style.pointerEvents = 'none';
    this.toast.style.zIndex = 60;
    this.root.appendChild(this.toast);

    this.toastTimeout = null;
  }

  setTarget(target) {
    const isHostile = Boolean(target && target.type === 'enemy');
    const colour = isHostile ? this.options.hostileColour : this.options.neutralColour;
    if (this.element.style.background !== colour) {
      this.element.style.background = colour;
    }
  }

  showToast(message, durationMs = 2000) {
    if (!message) return;
    this.toast.textContent = message;
    this.toast.style.opacity = '1';
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toast.style.opacity = '0';
    }, durationMs);
  }

  destroy() {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
      this.toastTimeout = null;
    }
    if (this.toast.parentNode) this.toast.parentNode.removeChild(this.toast);
    if (this.element.parentNode) this.element.parentNode.removeChild(this.element);
  }
}

export function updateCrosshairForRaycast(crosshair, rayResult) {
  if (!crosshair) return;
  if (rayResult && rayResult.type === 'enemy') {
    crosshair.setTarget({ type: 'enemy' });
  } else {
    crosshair.setTarget(null);
  }
}

export const HUD_DEFAULTS = Object.freeze({ ...DEFAULT_CROSSHAIR_OPTIONS });
