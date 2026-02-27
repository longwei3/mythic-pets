import { getScopedStorageKey } from '@/lib/auth';

export const MARKET_POTION_STOCK_MAX = 999;
const MARKET_POTION_STOCK_KEY = 'mythicpets-market-potion-stock';

export type PotionStockType = 'magic' | 'health';

export interface MarketPotionStock {
  magic: number;
  health: number;
  lastResetAt: number;
}

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

function clampStock(value: number): number {
  if (!Number.isFinite(value)) {
    return MARKET_POTION_STOCK_MAX;
  }
  return Math.max(0, Math.min(MARKET_POTION_STOCK_MAX, Math.floor(value)));
}

function getStorageKey(profileKey?: string): string {
  return getScopedStorageKey(MARKET_POTION_STOCK_KEY, profileKey);
}

function getCurrentResetAnchor(now = Date.now()): number {
  const anchor = new Date(now);
  anchor.setHours(8, 0, 0, 0);
  if (now < anchor.getTime()) {
    anchor.setDate(anchor.getDate() - 1);
  }
  return anchor.getTime();
}

export function getNextMarketPotionResetAt(now = Date.now()): number {
  const next = new Date(now);
  next.setHours(8, 0, 0, 0);
  if (next.getTime() <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime();
}

function writeStock(stock: MarketPotionStock, profileKey?: string): void {
  if (!hasWindow()) {
    return;
  }
  localStorage.setItem(getStorageKey(profileKey), JSON.stringify(stock));
}

function normalizeStock(value: unknown, now = Date.now()): MarketPotionStock {
  const resetAnchor = getCurrentResetAnchor(now);
  const base: MarketPotionStock = {
    magic: MARKET_POTION_STOCK_MAX,
    health: MARKET_POTION_STOCK_MAX,
    lastResetAt: resetAnchor,
  };

  if (!value || typeof value !== 'object') {
    return base;
  }

  const source = value as Partial<MarketPotionStock>;
  const candidate: MarketPotionStock = {
    magic: clampStock(typeof source.magic === 'number' ? source.magic : MARKET_POTION_STOCK_MAX),
    health: clampStock(typeof source.health === 'number' ? source.health : MARKET_POTION_STOCK_MAX),
    lastResetAt: typeof source.lastResetAt === 'number' ? source.lastResetAt : 0,
  };

  if (candidate.lastResetAt < resetAnchor) {
    return base;
  }

  return candidate;
}

export function readMarketPotionStock(profileKey?: string): MarketPotionStock {
  if (!hasWindow()) {
    return {
      magic: MARKET_POTION_STOCK_MAX,
      health: MARKET_POTION_STOCK_MAX,
      lastResetAt: getCurrentResetAnchor(),
    };
  }

  const raw = localStorage.getItem(getStorageKey(profileKey));
  if (!raw) {
    const initial = normalizeStock(null);
    writeStock(initial, profileKey);
    return initial;
  }

  try {
    const parsed = JSON.parse(raw);
    const normalized = normalizeStock(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      writeStock(normalized, profileKey);
    }
    return normalized;
  } catch {
    const initial = normalizeStock(null);
    writeStock(initial, profileKey);
    return initial;
  }
}

export function consumeMarketPotionStock(
  type: PotionStockType,
  count: number,
  profileKey?: string,
): { ok: boolean; stock: MarketPotionStock } {
  const stock = readMarketPotionStock(profileKey);
  const qty = Math.max(1, Math.floor(count));
  if (stock[type] < qty) {
    return { ok: false, stock };
  }

  const next: MarketPotionStock = {
    ...stock,
    [type]: stock[type] - qty,
  };
  writeStock(next, profileKey);
  return { ok: true, stock: next };
}
