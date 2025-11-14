import { createLevel21TopDown } from '../levels/level21_topdown.js';

const registry = new Map();

export function registerLevel(descriptor) {
  registry.set(descriptor.id, descriptor);
}

export function getLevelDescriptor(id) {
  return registry.get(id);
}

export function listLevels() {
  return Array.from(registry.values());
}

registerLevel({
  id: 'level21_corporate_labyrinth',
  name: 'Level 21 – Corporate Labyrinth',
  create: () => createLevel21TopDown(),
  mode: 'top-down-dungeon'
});

export default registry;
