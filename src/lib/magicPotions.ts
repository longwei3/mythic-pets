import { getScopedStorageKey } from '@/lib/auth';

export const MAGIC_POTION_COUNT_KEY = 'mythicpets-magic-potions';
export const HEALTH_POTION_COUNT_KEY = 'mythicpets-health-potions';
export const GATHER_TASK_KEY = 'mythicpets-gather-task';
export const GATHER_DURATION_MS = 60 * 60 * 1000;

export interface GatherTask {
  petId: number;
  petName?: string;
  startedAt: number;
  endsAt: number;
}

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

function scopedKey(base: string, profileKey?: string): string {
  return getScopedStorageKey(base, profileKey);
}

export function readMagicPotionCount(profileKey?: string): number {
  if (!hasWindow()) {
    return 0;
  }

  const key = scopedKey(MAGIC_POTION_COUNT_KEY, profileKey);
  const raw = localStorage.getItem(key);
  if (!raw) {
    return 0;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    localStorage.removeItem(key);
    return 0;
  }

  return parsed;
}

export function writeMagicPotionCount(count: number, profileKey?: string): void {
  if (!hasWindow()) {
    return;
  }
  localStorage.setItem(scopedKey(MAGIC_POTION_COUNT_KEY, profileKey), String(Math.max(0, Math.floor(count))));
}

export function addMagicPotion(count = 1, profileKey?: string): number {
  const current = readMagicPotionCount(profileKey);
  const next = current + Math.max(1, Math.floor(count));
  writeMagicPotionCount(next, profileKey);
  return next;
}

export function consumeMagicPotion(count = 1, profileKey?: string): number {
  const current = readMagicPotionCount(profileKey);
  const next = Math.max(0, current - Math.max(1, Math.floor(count)));
  writeMagicPotionCount(next, profileKey);
  return next;
}

export function readHealthPotionCount(profileKey?: string): number {
  if (!hasWindow()) {
    return 0;
  }

  const key = scopedKey(HEALTH_POTION_COUNT_KEY, profileKey);
  const raw = localStorage.getItem(key);
  if (!raw) {
    return 0;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    localStorage.removeItem(key);
    return 0;
  }

  return parsed;
}

export function writeHealthPotionCount(count: number, profileKey?: string): void {
  if (!hasWindow()) {
    return;
  }
  localStorage.setItem(scopedKey(HEALTH_POTION_COUNT_KEY, profileKey), String(Math.max(0, Math.floor(count))));
}

export function addHealthPotion(count = 1, profileKey?: string): number {
  const current = readHealthPotionCount(profileKey);
  const next = current + Math.max(1, Math.floor(count));
  writeHealthPotionCount(next, profileKey);
  return next;
}

export function consumeHealthPotion(count = 1, profileKey?: string): number {
  const current = readHealthPotionCount(profileKey);
  const next = Math.max(0, current - Math.max(1, Math.floor(count)));
  writeHealthPotionCount(next, profileKey);
  return next;
}

export function readGatherTask(profileKey?: string): GatherTask | null {
  if (!hasWindow()) {
    return null;
  }

  const key = scopedKey(GATHER_TASK_KEY, profileKey);
  const raw = localStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.petId === 'number' &&
      typeof parsed?.startedAt === 'number' &&
      typeof parsed?.endsAt === 'number'
    ) {
      return parsed as GatherTask;
    }
  } catch {
    // fall through to cleanup
  }

  localStorage.removeItem(key);
  return null;
}

export function writeGatherTask(task: GatherTask, profileKey?: string): void {
  if (!hasWindow()) {
    return;
  }
  localStorage.setItem(scopedKey(GATHER_TASK_KEY, profileKey), JSON.stringify(task));
}

export function clearGatherTask(profileKey?: string): void {
  if (!hasWindow()) {
    return;
  }
  localStorage.removeItem(scopedKey(GATHER_TASK_KEY, profileKey));
}

export function isGatherTaskActive(task: GatherTask | null | undefined, now = Date.now()): boolean {
  return Boolean(task && task.endsAt > now);
}

export function readActiveGatherTask(now = Date.now(), profileKey?: string): GatherTask | null {
  const task = readGatherTask(profileKey);
  return isGatherTaskActive(task, now) ? task : null;
}
