export const PET_LEVEL1_EXP_THRESHOLD = 100;
export const PET_EXP_GROWTH_RATE = 1.2;
export const PET_STAT_GROWTH_RATE = 1.05;
export const PET_MAX_LEVEL = 99;

export interface PetExpProgress {
  level: number;
  current: number;
  next: number;
}

function normalizeLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return 1;
  }
  return Math.max(1, Math.min(PET_MAX_LEVEL, Math.floor(level)));
}

function normalizeThreshold(value: number): number {
  return Math.max(1, Math.round(value));
}

export function getExpThresholdForLevel(level: number): number {
  const safeLevel = normalizeLevel(level);
  let threshold = PET_LEVEL1_EXP_THRESHOLD;
  for (let current = 1; current < safeLevel; current += 1) {
    threshold = normalizeThreshold(threshold * PET_EXP_GROWTH_RATE);
  }
  return threshold;
}

export function resolveExpProgress(level: number, exp: number): PetExpProgress {
  let nextLevel = normalizeLevel(level);
  let remaining = Math.max(0, Math.floor(exp));
  let threshold = getExpThresholdForLevel(nextLevel);

  while (remaining >= threshold && nextLevel < PET_MAX_LEVEL) {
    remaining -= threshold;
    nextLevel += 1;
    threshold = getExpThresholdForLevel(nextLevel);
  }

  if (nextLevel >= PET_MAX_LEVEL) {
    remaining = Math.min(remaining, threshold);
  }

  return {
    level: nextLevel,
    current: remaining,
    next: threshold,
  };
}

export function computeExpProgressFromTotalExp(totalExp: number): PetExpProgress {
  return resolveExpProgress(1, totalExp);
}

export function applyExpGain(level: number, exp: number, gain: number): {
  level: number;
  exp: number;
  nextExp: number;
  levelUps: number;
} {
  const normalized = resolveExpProgress(level, exp + Math.max(0, Math.floor(gain)));
  return {
    level: normalized.level,
    exp: normalized.current,
    nextExp: normalized.next,
    levelUps: Math.max(0, normalized.level - normalizeLevel(level)),
  };
}

export function applyStatGrowthByLevels(current: number, levelUps: number): number {
  let next = Math.max(1, Math.round(current));
  const safeUps = Math.max(0, Math.floor(levelUps));
  for (let index = 0; index < safeUps; index += 1) {
    next = Math.max(next + 1, Math.round(next * PET_STAT_GROWTH_RATE));
  }
  return next;
}

export function scaleBaseStatByLevel(base: number, level: number): number {
  const safeBase = Math.max(1, Math.round(base));
  const safeLevel = normalizeLevel(level);
  if (safeLevel <= 1) {
    return safeBase;
  }
  return Math.max(1, Math.round(safeBase * Math.pow(PET_STAT_GROWTH_RATE, safeLevel - 1)));
}

