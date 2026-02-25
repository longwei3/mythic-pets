export const MYTH_BALANCE_KEY = 'mythicpets-token-balance';
export const MYTH_DAILY_CLAIM_DAY_KEY = 'mythicpets-token-daily-claim-day';
export const MYTH_TX_LOG_KEY = 'mythicpets-token-transactions';

export const DAILY_CHECKIN_REWARD = 5;
export const BATTLE_VICTORY_REWARD = 10;

export type EconomyReason = 'daily-checkin' | 'battle-victory' | 'market-purchase' | 'system';

export interface MythTransaction {
  id: string;
  amount: number;
  reason: EconomyReason;
  at: number;
  balanceAfter: number;
}

interface ClaimDailyResult {
  claimed: boolean;
  amount: number;
  balance: number;
}

interface GrantMythResult {
  amount: number;
  balance: number;
  tx: MythTransaction | null;
}

interface SpendMythResult {
  success: boolean;
  amount: number;
  balance: number;
  tx: MythTransaction | null;
  code?: 'invalid-amount' | 'insufficient-balance';
}

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

function sanitizeProfileKey(profileKey?: string): string {
  const normalized = profileKey?.trim().toLowerCase();
  return normalized || 'default';
}

function scopedKey(base: string, profileKey?: string): string {
  return `${base}:${sanitizeProfileKey(profileKey)}`;
}

function toLocalDayStamp(timestamp = Date.now()): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseNonNegativeInteger(raw: string | null): number | null {
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function isValidTx(raw: unknown): raw is MythTransaction {
  if (!raw || typeof raw !== 'object') {
    return false;
  }

  const tx = raw as Partial<MythTransaction>;
  return (
    typeof tx.id === 'string' &&
    typeof tx.amount === 'number' &&
    (tx.reason === 'daily-checkin' ||
      tx.reason === 'battle-victory' ||
      tx.reason === 'market-purchase' ||
      tx.reason === 'system') &&
    typeof tx.at === 'number' &&
    typeof tx.balanceAfter === 'number'
  );
}

export function readMythBalance(profileKey?: string): number {
  if (!hasWindow()) {
    return 0;
  }

  const key = scopedKey(MYTH_BALANCE_KEY, profileKey);
  const parsed = parseNonNegativeInteger(localStorage.getItem(key));
  if (parsed === null) {
    localStorage.removeItem(key);
    return 0;
  }

  return parsed;
}

export function writeMythBalance(balance: number, profileKey?: string): number {
  if (!hasWindow()) {
    return 0;
  }

  const next = Math.max(0, Math.floor(balance));
  localStorage.setItem(scopedKey(MYTH_BALANCE_KEY, profileKey), String(next));
  return next;
}

export function readMythTransactions(profileKey?: string): MythTransaction[] {
  if (!hasWindow()) {
    return [];
  }

  const key = scopedKey(MYTH_TX_LOG_KEY, profileKey);
  const raw = localStorage.getItem(key);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(key);
      return [];
    }

    const valid = parsed.filter((item) => isValidTx(item));
    if (valid.length !== parsed.length) {
      localStorage.setItem(key, JSON.stringify(valid));
    }
    return valid;
  } catch {
    localStorage.removeItem(key);
    return [];
  }
}

function writeMythTransactions(transactions: MythTransaction[], profileKey?: string): void {
  if (!hasWindow()) {
    return;
  }
  localStorage.setItem(scopedKey(MYTH_TX_LOG_KEY, profileKey), JSON.stringify(transactions));
}

export function grantMyth(amount: number, reason: EconomyReason, profileKey?: string, at = Date.now()): GrantMythResult {
  const normalizedAmount = Math.max(0, Math.floor(amount));
  const current = readMythBalance(profileKey);

  if (normalizedAmount <= 0) {
    return {
      amount: 0,
      balance: current,
      tx: null,
    };
  }

  const nextBalance = writeMythBalance(current + normalizedAmount, profileKey);
  const tx: MythTransaction = {
    id: `${at}-${Math.random().toString(36).slice(2, 8)}`,
    amount: normalizedAmount,
    reason,
    at,
    balanceAfter: nextBalance,
  };

  const currentTx = readMythTransactions(profileKey);
  const nextTx = [tx, ...currentTx].slice(0, 100);
  writeMythTransactions(nextTx, profileKey);

  return {
    amount: normalizedAmount,
    balance: nextBalance,
    tx,
  };
}

export function spendMyth(amount: number, reason: EconomyReason, profileKey?: string, at = Date.now()): SpendMythResult {
  const normalizedAmount = Math.max(0, Math.floor(amount));
  const current = readMythBalance(profileKey);

  if (normalizedAmount <= 0) {
    return {
      success: false,
      amount: 0,
      balance: current,
      tx: null,
      code: 'invalid-amount',
    };
  }

  if (current < normalizedAmount) {
    return {
      success: false,
      amount: 0,
      balance: current,
      tx: null,
      code: 'insufficient-balance',
    };
  }

  const nextBalance = writeMythBalance(current - normalizedAmount, profileKey);
  const tx: MythTransaction = {
    id: `${at}-${Math.random().toString(36).slice(2, 8)}`,
    amount: -normalizedAmount,
    reason,
    at,
    balanceAfter: nextBalance,
  };

  const currentTx = readMythTransactions(profileKey);
  const nextTx = [tx, ...currentTx].slice(0, 100);
  writeMythTransactions(nextTx, profileKey);

  return {
    success: true,
    amount: normalizedAmount,
    balance: nextBalance,
    tx,
  };
}

export function hasClaimedDailyCheckIn(profileKey?: string, now = Date.now()): boolean {
  if (!hasWindow()) {
    return true;
  }

  const currentDay = toLocalDayStamp(now);
  const claimedDay = localStorage.getItem(scopedKey(MYTH_DAILY_CLAIM_DAY_KEY, profileKey));
  return claimedDay === currentDay;
}

export function claimDailyCheckIn(profileKey?: string, now = Date.now()): ClaimDailyResult {
  if (!hasWindow()) {
    return {
      claimed: false,
      amount: 0,
      balance: 0,
    };
  }

  if (hasClaimedDailyCheckIn(profileKey, now)) {
    return {
      claimed: false,
      amount: 0,
      balance: readMythBalance(profileKey),
    };
  }

  const day = toLocalDayStamp(now);
  localStorage.setItem(scopedKey(MYTH_DAILY_CLAIM_DAY_KEY, profileKey), day);

  const result = grantMyth(DAILY_CHECKIN_REWARD, 'daily-checkin', profileKey, now);
  return {
    claimed: true,
    amount: result.amount,
    balance: result.balance,
  };
}
