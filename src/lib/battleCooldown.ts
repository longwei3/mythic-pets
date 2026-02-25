import { getScopedStorageKey } from '@/lib/auth';

export const BATTLE_COOLDOWN_MS = 10 * 60 * 1000;

export function getBattleCooldownKey(petId?: number, profileKey?: string): string {
  return getScopedStorageKey(`mythicpets-battle-cooldown:${petId ?? 'default'}`, profileKey);
}

export function readBattleCooldownUntil(petId?: number, profileKey?: string): number | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const key = getBattleCooldownKey(petId, profileKey);
  const raw = localStorage.getItem(key);
  if (!raw) {
    return null;
  }

  const until = Number.parseInt(raw, 10);
  if (Number.isNaN(until)) {
    localStorage.removeItem(key);
    return null;
  }

  if (until <= Date.now()) {
    localStorage.removeItem(key);
    return null;
  }

  return until;
}

export function getBattleCooldownRemainingMs(petId?: number, now = Date.now(), profileKey?: string): number {
  const until = readBattleCooldownUntil(petId, profileKey);
  if (!until) {
    return 0;
  }
  return Math.max(0, until - now);
}

export function setBattleCooldownUntil(until: number, petId?: number, profileKey?: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(getBattleCooldownKey(petId, profileKey), String(until));
}

export function clearBattleCooldown(petId?: number, profileKey?: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem(getBattleCooldownKey(petId, profileKey));
}

export function formatCooldownTimer(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
