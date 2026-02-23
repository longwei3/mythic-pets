export const MAGIC_POTION_COUNT_KEY = 'mythicpets-magic-potions';
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

export function readMagicPotionCount(): number {
  if (!hasWindow()) {
    return 0;
  }

  const raw = localStorage.getItem(MAGIC_POTION_COUNT_KEY);
  if (!raw) {
    return 0;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    localStorage.removeItem(MAGIC_POTION_COUNT_KEY);
    return 0;
  }

  return parsed;
}

export function writeMagicPotionCount(count: number): void {
  if (!hasWindow()) {
    return;
  }
  localStorage.setItem(MAGIC_POTION_COUNT_KEY, String(Math.max(0, Math.floor(count))));
}

export function addMagicPotion(count = 1): number {
  const current = readMagicPotionCount();
  const next = current + Math.max(1, Math.floor(count));
  writeMagicPotionCount(next);
  return next;
}

export function consumeMagicPotion(count = 1): number {
  const current = readMagicPotionCount();
  const next = Math.max(0, current - Math.max(1, Math.floor(count)));
  writeMagicPotionCount(next);
  return next;
}

export function readGatherTask(): GatherTask | null {
  if (!hasWindow()) {
    return null;
  }

  const raw = localStorage.getItem(GATHER_TASK_KEY);
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

  localStorage.removeItem(GATHER_TASK_KEY);
  return null;
}

export function writeGatherTask(task: GatherTask): void {
  if (!hasWindow()) {
    return;
  }
  localStorage.setItem(GATHER_TASK_KEY, JSON.stringify(task));
}

export function clearGatherTask(): void {
  if (!hasWindow()) {
    return;
  }
  localStorage.removeItem(GATHER_TASK_KEY);
}

export function isGatherTaskActive(task: GatherTask | null | undefined, now = Date.now()): boolean {
  return Boolean(task && task.endsAt > now);
}

export function readActiveGatherTask(now = Date.now()): GatherTask | null {
  const task = readGatherTask();
  return isGatherTaskActive(task, now) ? task : null;
}
