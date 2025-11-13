import * as THREE from 'three';

const DEFAULT_EXECUTIVE_DIMENSIONS = {
  bodyHeight: 2.6,
  bodyRadiusTop: 0.38,
  bodyRadiusBottom: 0.42,
  headRadius: 0.32
};

function createDefaultMaterials() {
  return {
    suit: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7, metalness: 0.05 }),
    head: new THREE.MeshStandardMaterial({ color: 0xf8f6ef, roughness: 0.45, metalness: 0.1 }),
    tie: new THREE.MeshStandardMaterial({
      color: 0x8b1a1a,
      emissive: new THREE.Color(0x330404),
      emissiveIntensity: 0.25,
      roughness: 0.4,
      metalness: 0.2
    })
  };
}

export function renderExecutive(executiveData = {}, options = {}) {
  const provided = options.materials || {};
  const defaults = createDefaultMaterials();
  const suitMaterial = options.suitMaterial || provided.suit || provided.executiveSuit || defaults.suit;
  const headMaterial = options.headMaterial || provided.head || provided.executiveHead || defaults.head;
  const tieMaterial = options.tieMaterial || provided.tie || defaults.tie;
  const dims = { ...DEFAULT_EXECUTIVE_DIMENSIONS, ...options.dimensions };

  const group = new THREE.Group();
  group.name = `Executive-${executiveData.id || 'unknown'}`;

  const bodyGeometry = new THREE.CylinderGeometry(dims.bodyRadiusTop, dims.bodyRadiusBottom, dims.bodyHeight, 12, 1, true);
  const body = new THREE.Mesh(bodyGeometry, suitMaterial);
  body.position.y = dims.bodyHeight / 2;
  body.castShadow = false;
  body.receiveShadow = false;
  group.add(body);

  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(dims.bodyHeight * 0.45, 0.3, 0.9), suitMaterial);
  shoulders.position.set(0, dims.bodyHeight * 0.75, 0);
  group.add(shoulders);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(dims.headRadius, 16, 16),
    headMaterial
  );
  head.position.y = dims.bodyHeight + dims.headRadius * 1.2;
  head.userData.isHead = true;
  group.add(head);

  const tie = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 10), tieMaterial);
  tie.rotation.x = Math.PI;
  tie.position.set(0, dims.bodyHeight * 0.55, 0.32);
  group.add(tie);

  const ambientEyes = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.02), headMaterial.clone());
  ambientEyes.position.set(0, dims.bodyHeight + dims.headRadius * 1.2, dims.headRadius - 0.05);
  group.add(ambientEyes);

  group.userData.interaction = { type: 'executive', id: executiveData.id };
  group.userData.swayOffset = Math.random() * Math.PI * 2;
  group.userData.bodyHeight = dims.bodyHeight;

  return group;
}

export function updateExecutiveMeshPosition(mesh, executiveData, elapsedTime = 0) {
  if (!mesh || !executiveData) return;
  const execPos = executiveData.position || { x: 0, y: 0, z: 0 };
  const execVel = executiveData.velocity || { x: 0, y: 0, z: 0 };

  const posX = execPos.x ?? 0;
  const posZ = (execPos.y ?? execPos.z) ?? 0;
  mesh.position.set(posX, 0, posZ);

  const velX = execVel.x ?? 0;
  const velZ = (execVel.y ?? execVel.z) ?? 0;
  const velocityMagnitude = Math.hypot(velX, velZ);
  if (velocityMagnitude > 0.0001) {
    mesh.rotation.y = Math.atan2(velX, velZ);
  }

  const swayOffset = mesh.userData.swayOffset || 0;
  const sway = Math.sin(elapsedTime * 1.3 + swayOffset) * 0.08;
  mesh.position.y = sway * 0.2;

  const head = mesh.children.find((child) => child.userData && child.userData.isHead);
  if (head) {
    const baseHeight = mesh.userData.bodyHeight || DEFAULT_EXECUTIVE_DIMENSIONS.bodyHeight;
    const bob = Math.sin(elapsedTime * 2.2 + swayOffset) * 0.05;
    head.position.y = baseHeight + DEFAULT_EXECUTIVE_DIMENSIONS.headRadius * 1.2 + bob;
  }
}

export function createExecutiveRenderManager(scene, options = {}) {
  if (!scene) throw new Error('createExecutiveRenderManager requires a scene to attach to.');
  const group = new THREE.Group();
  group.name = 'ExecutiveContainer';
  scene.add(group);

  const meshLookup = new Map();

  function ensureMesh(executive) {
    if (!executive) return null;
    let mesh = meshLookup.get(executive.id);
    if (!mesh) {
      mesh = renderExecutive(executive, options);
      meshLookup.set(executive.id, mesh);
      group.add(mesh);
    }
    return mesh;
  }

  function syncExecutives(executives = [], elapsedTime = 0) {
    const seen = new Set();
    for (const exec of executives) {
      const mesh = ensureMesh(exec);
      if (!mesh) continue;
      updateExecutiveMeshPosition(mesh, exec, elapsedTime);
      seen.add(exec.id);
    }

    for (const [id, mesh] of meshLookup.entries()) {
      if (!seen.has(id)) {
        group.remove(mesh);
        meshLookup.delete(id);
      }
    }
  }

  return {
    group,
    syncExecutives,
    getMeshes() {
      return Array.from(meshLookup.values());
    },
    dispose() {
      for (const mesh of meshLookup.values()) {
        group.remove(mesh);
      }
      meshLookup.clear();
      if (group.parent) group.parent.remove(group);
    }
  };
}
