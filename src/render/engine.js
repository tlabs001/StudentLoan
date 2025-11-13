import * as THREE from 'three';

const DEFAULT_BACKGROUND = 0xf5f1dd;
const DEFAULT_FOG_DENSITY = 0.018;

function ensureCanvas(canvas) {
  if (canvas instanceof HTMLCanvasElement) return canvas;
  if (typeof canvas === 'string') {
    return document.querySelector(canvas);
  }
  return document.getElementById('game');
}

export function createRenderEngine({
  canvas,
  fov = 75,
  near = 0.1,
  far = 1000,
  background = DEFAULT_BACKGROUND,
  fogDensity = DEFAULT_FOG_DENSITY
} = {}) {
  const domCanvas = ensureCanvas(canvas);
  if (!domCanvas) {
    throw new Error('createRenderEngine: unable to locate canvas element');
  }

  const renderer = new THREE.WebGLRenderer({
    canvas: domCanvas,
    antialias: true,
    alpha: false
  });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.autoClear = true;

  const scene = new THREE.Scene();
  const backgroundColor = new THREE.Color(background);
  scene.background = backgroundColor;
  scene.fog = new THREE.FogExp2(backgroundColor, fogDensity);

  const camera = new THREE.PerspectiveCamera(
    fov,
    domCanvas.clientWidth / domCanvas.clientHeight || window.innerWidth / window.innerHeight || 1,
    near,
    far
  );
  camera.position.set(0, 1.7, 0);
  camera.lookAt(new THREE.Vector3(0, 1.7, -1));

  const hemisphere = new THREE.HemisphereLight(0xfef8e4, 0x1b1b21, 0.8);
  scene.add(hemisphere);

  const directional = new THREE.DirectionalLight(0xffffff, 0.35);
  directional.position.set(24, 32, 12);
  scene.add(directional);

  function resize(width = window.innerWidth, height = window.innerHeight) {
    const targetWidth = width || domCanvas.clientWidth || domCanvas.width || 1280;
    const targetHeight = height || domCanvas.clientHeight || domCanvas.height || 720;
    renderer.setSize(targetWidth, targetHeight, false);
    camera.aspect = targetWidth / targetHeight;
    camera.updateProjectionMatrix();
  }

  resize();

  let resizeObserver = null;
  let onWindowResize = null;
  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const box = entry.contentBoxSize?.[0] || entry.contentRect;
        if (!box) continue;
        resize(box.inlineSize, box.blockSize);
      }
    });
    resizeObserver.observe(domCanvas);
  } else {
    onWindowResize = () => resize();
    window.addEventListener('resize', onWindowResize, { passive: true });
  }

  return {
    renderer,
    scene,
    camera,
    resize,
    dispose() {
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      if (onWindowResize) {
        window.removeEventListener('resize', onWindowResize);
        onWindowResize = null;
      }
      renderer.dispose();
    }
  };
}

export function renderFrame(engine, updateFn) {
  if (!engine || !engine.renderer || !engine.scene || !engine.camera) {
    throw new Error('renderFrame requires a valid engine created via createRenderEngine');
  }
  if (typeof updateFn === 'function') {
    updateFn();
  }
  engine.renderer.render(engine.scene, engine.camera);
}
