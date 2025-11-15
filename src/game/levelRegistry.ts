import { createLevel21TopDown, Level21TopDown } from '../levels/level21_topdown.ts';

export interface LevelDescriptor {
  id: string;
  name: string;
  create: () => Level21TopDown;
  mode: 'top-down-dungeon' | string;
}

const registry = new Map<string, LevelDescriptor>();

export function registerLevel(descriptor: LevelDescriptor) {
  registry.set(descriptor.id, descriptor);
}

export function getLevelDescriptor(id: string) {
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
