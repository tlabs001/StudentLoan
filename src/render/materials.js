import * as THREE from 'three';

const DEFAULT_MATERIAL_CACHE = new WeakMap();

export function createLevel19Materials(options = {}) {
  if (DEFAULT_MATERIAL_CACHE.has(options)) {
    return DEFAULT_MATERIAL_CACHE.get(options);
  }

  const palette = {
    carpet: options.carpet || 0xd9cfa0,
    wall: options.wall || 0xe7dfc6,
    ceiling: options.ceiling || 0xf6f1e2,
    trim: options.trim || 0xb5aa87,
    door: options.door || 0x968770,
    desk: options.desk || 0x7d6b57,
    chair: options.chair || 0x3f3a35,
    murderWall: options.murderWall || 0x3a1212,
    murderAccent: options.murderAccent || 0x6b1b1b,
    elevator: options.elevator || 0xb5c7ff,
    pistol: options.pistol || 0x2f2f33,
    pistolGrip: options.pistolGrip || 0x1d1d22,
    bodyPart: options.bodyPart || 0x7f1e1e,
    executiveSuit: options.executiveSuit || 0x111111,
    executiveHead: options.executiveHead || 0xf7f3e8
  };

  const materials = {
    floor: new THREE.MeshStandardMaterial({ color: palette.carpet, roughness: 0.8, metalness: 0.05 }),
    wall: new THREE.MeshStandardMaterial({ color: palette.wall, roughness: 0.9, metalness: 0.02 }),
    ceiling: new THREE.MeshStandardMaterial({ color: palette.ceiling, roughness: 0.85, metalness: 0.01 }),
    trim: new THREE.MeshStandardMaterial({ color: palette.trim, roughness: 0.7, metalness: 0.04 }),
    door: new THREE.MeshStandardMaterial({ color: palette.door, roughness: 0.65, metalness: 0.08 }),
    desk: new THREE.MeshStandardMaterial({ color: palette.desk, roughness: 0.6, metalness: 0.12 }),
    chair: new THREE.MeshStandardMaterial({ color: palette.chair, roughness: 0.6, metalness: 0.15 }),
    murderWall: new THREE.MeshStandardMaterial({
      color: palette.murderWall,
      roughness: 0.7,
      metalness: 0.02,
      emissive: new THREE.Color(palette.murderAccent),
      emissiveIntensity: 0.25
    }),
    elevator: new THREE.MeshStandardMaterial({
      color: palette.elevator,
      metalness: 0.4,
      roughness: 0.2,
      emissive: new THREE.Color(0x3a4a88),
      emissiveIntensity: 0.45
    }),
    pistolBody: new THREE.MeshStandardMaterial({
      color: palette.pistol,
      metalness: 0.55,
      roughness: 0.25
    }),
    pistolGrip: new THREE.MeshStandardMaterial({
      color: palette.pistolGrip,
      metalness: 0.25,
      roughness: 0.55
    }),
    bodyPart: new THREE.MeshStandardMaterial({
      color: palette.bodyPart,
      metalness: 0.1,
      roughness: 0.6,
      emissive: new THREE.Color(0x360505),
      emissiveIntensity: 0.3
    }),
    executiveSuit: new THREE.MeshStandardMaterial({
      color: palette.executiveSuit,
      roughness: 0.7,
      metalness: 0.08
    }),
    executiveHead: new THREE.MeshStandardMaterial({
      color: palette.executiveHead,
      roughness: 0.45,
      metalness: 0.05
    })
  };

  DEFAULT_MATERIAL_CACHE.set(options, materials);
  return materials;
}

export function disposeMaterials(materials) {
  if (!materials) return;
  for (const key of Object.keys(materials)) {
    const material = materials[key];
    if (material && typeof material.dispose === 'function') {
      material.dispose();
    }
  }
}
