import * as THREE from 'three';

const DEFAULT_OPTIONS = {
  speed: 4.2,
  eyeHeight: 1.7,
  lookSpeed: 0.002,
  collisionRadius: 0.6
};

const MOVEMENT_KEYS = {
  forward: new Set(['KeyW', 'ArrowUp']),
  backward: new Set(['KeyS', 'ArrowDown']),
  left: new Set(['KeyA', 'ArrowLeft']),
  right: new Set(['KeyD', 'ArrowRight'])
};

function isMovementKey(code) {
  return MOVEMENT_KEYS.forward.has(code)
    || MOVEMENT_KEYS.backward.has(code)
    || MOVEMENT_KEYS.left.has(code)
    || MOVEMENT_KEYS.right.has(code);
}

export function initPointerLockControls(camera, domElement, options = {}) {
  if (!camera) throw new Error('Pointer lock controls require a camera instance.');
  const targetElement = domElement || (camera && camera.domElement) || document.body;
  const settings = { ...DEFAULT_OPTIONS, ...options };

  const state = {
    isLocked: false,
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    velocity: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
    yaw: 0,
    pitch: 0,
    colliders: [],
    radius: settings.collisionRadius,
    eyeHeight: settings.eyeHeight,
    lookSpeed: settings.lookSpeed,
    speed: settings.speed,
    swayAmount: new THREE.Vector2(0, 0)
  };

  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const pointer = { movementX: 0, movementY: 0 };

  function clampPitch(value) {
    const limit = THREE.MathUtils.degToRad(85);
    return Math.max(-limit, Math.min(limit, value));
  }

  function onMouseMove(event) {
    if (!state.isLocked) return;
    const movementX = event.movementX || event.mozMovementX || 0;
    const movementY = event.movementY || event.mozMovementY || 0;
    pointer.movementX += movementX;
    pointer.movementY += movementY;
  }

  function requestLock() {
    if (targetElement.requestPointerLock) {
      targetElement.requestPointerLock();
    }
  }

  function onPointerLockChange() {
    state.isLocked = document.pointerLockElement === targetElement;
    if (!state.isLocked) {
      state.velocity.set(0, 0, 0);
    }
  }

  function onPointerLockError() {
    console.warn('[fpsControls] Pointer lock request was denied.');
  }

  function handleKeyChange(event, pressed) {
    if (!isMovementKey(event.code)) return;
    if (MOVEMENT_KEYS.forward.has(event.code)) state.moveForward = pressed;
    if (MOVEMENT_KEYS.backward.has(event.code)) state.moveBackward = pressed;
    if (MOVEMENT_KEYS.left.has(event.code)) state.moveLeft = pressed;
    if (MOVEMENT_KEYS.right.has(event.code)) state.moveRight = pressed;
  }

  function onKeyDown(event) {
    if (event.repeat) return;
    handleKeyChange(event, true);
  }

  function onKeyUp(event) {
    handleKeyChange(event, false);
  }

  function collides(position) {
    if (!state.colliders || state.colliders.length === 0) return false;
    const { radius, eyeHeight } = state;
    for (const box of state.colliders) {
      if (!box) continue;
      const minX = box.min.x - radius;
      const maxX = box.max.x + radius;
      const minZ = box.min.z - radius;
      const maxZ = box.max.z + radius;
      const minY = box.min.y - eyeHeight * 0.25;
      const maxY = box.max.y + eyeHeight * 0.25;
      if (
        position.x >= minX && position.x <= maxX &&
        position.y >= minY && position.y <= maxY &&
        position.z >= minZ && position.z <= maxZ
      ) {
        return true;
      }
    }
    return false;
  }

  function updateOrientation() {
    state.yaw -= pointer.movementX * state.lookSpeed;
    state.pitch -= pointer.movementY * state.lookSpeed;
    state.pitch = clampPitch(state.pitch);
    pointer.movementX = 0;
    pointer.movementY = 0;

    euler.set(state.pitch, state.yaw, 0);
    camera.quaternion.setFromEuler(euler);
  }

  function updateMovement(delta) {
    if (!state.isLocked) return;

    const moveVector = new THREE.Vector3();
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 0) forward.normalize();

    const right = new THREE.Vector3().crossVectors(forward, state.up).normalize();

    if (state.moveForward) moveVector.add(forward);
    if (state.moveBackward) moveVector.sub(forward);
    if (state.moveLeft) moveVector.sub(right);
    if (state.moveRight) moveVector.add(right);

    if (moveVector.lengthSq() > 0) {
      moveVector.normalize();
      moveVector.multiplyScalar(state.speed * delta);
    }

    const newPosition = camera.position.clone();
    newPosition.y = state.eyeHeight;

    if (moveVector.x !== 0) {
      newPosition.x += moveVector.x;
      if (collides(newPosition)) {
        newPosition.x -= moveVector.x;
      }
    }

    if (moveVector.z !== 0) {
      newPosition.z += moveVector.z;
      if (collides(newPosition)) {
        newPosition.z -= moveVector.z;
      }
    }

    camera.position.copy(newPosition);
    camera.position.y = state.eyeHeight;

    // Update sway for weapon animations
    state.swayAmount.x = THREE.MathUtils.lerp(state.swayAmount.x, moveVector.x, 0.1);
    state.swayAmount.y = THREE.MathUtils.lerp(state.swayAmount.y, moveVector.z, 0.1);
  }

  function update(delta) {
    updateOrientation();
    updateMovement(delta);
  }

  function dispose() {
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    document.removeEventListener('pointerlockerror', onPointerLockError);
    targetElement.removeEventListener('click', requestLock);
    targetElement.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  }

  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('pointerlockerror', onPointerLockError);
  targetElement.addEventListener('click', requestLock);
  targetElement.addEventListener('mousemove', onMouseMove);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  camera.position.y = state.eyeHeight;

  return {
    lock: requestLock,
    unlock() {
      if (document.exitPointerLock) {
        document.exitPointerLock();
      }
    },
    isLocked: () => state.isLocked,
    update,
    dispose,
    setMovementSpeed(speed) {
      if (Number.isFinite(speed) && speed > 0) {
        state.speed = speed;
      }
    },
    setEyeHeight(height) {
      if (Number.isFinite(height) && height > 0) {
        state.eyeHeight = height;
        camera.position.y = height;
      }
    },
    setColliders(colliders) {
      state.colliders = Array.isArray(colliders) ? colliders : [];
    },
    getColliders() {
      return state.colliders;
    },
    getSwayAmount() {
      return state.swayAmount;
    }
  };
}
