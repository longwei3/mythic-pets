import { migrateToEncrypted, patchLocalStorage } from './secureStorage';

export const AUTH_USERS_KEY = 'mythicpets-auth-users';
export const AUTH_SESSION_KEY = 'mythicpets-auth-session';
export const MAX_PLAYER_ID = 10000;

export interface AuthUser {
  username: string;
  passwordHash: string;
  createdAt: number;
  playerId: number;
}

export interface AuthSession {
  username: string;
  loggedInAt: number;
}

export type AuthActionCode =
  | 'invalid-username'
  | 'invalid-password'
  | 'user-exists'
  | 'user-limit'
  | 'user-not-found'
  | 'wrong-password';

export interface AuthActionResult {
  ok: boolean;
  code?: AuthActionCode;
  username?: string;
}

const LEGACY_DATA_KEYS = [
  'myPets',
  'generation1Count',
  'myListedPets',
  'mythicpets-magic-potions',
  'mythicpets-health-potions',
  'mythicpets-gather-task',
];

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

function hashPassword(username: string, password: string): string {
  const value = `${normalizeUsername(username)}:${password}`;
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function compareByCreatedAtAndUsername(a: Pick<AuthUser, 'createdAt' | 'username'>, b: Pick<AuthUser, 'createdAt' | 'username'>): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt - b.createdAt;
  }
  return a.username.localeCompare(b.username);
}

function normalizeAndAssignPlayerIds(users: Omit<AuthUser, 'playerId'>[] | AuthUser[]): AuthUser[] {
  const sorted = [...users].sort(compareByCreatedAtAndUsername);
  return sorted.map((user, index) => ({
    username: user.username,
    passwordHash: user.passwordHash,
    createdAt: user.createdAt,
    playerId: index + 1,
  }));
}

function readAuthUsers(): AuthUser[] {
  if (!hasWindow()) {
    return [];
  }

  const raw = localStorage.getItem(AUTH_USERS_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(AUTH_USERS_KEY);
      return [];
    }

    const users = parsed.filter(
      (item): item is Omit<AuthUser, 'playerId'> | AuthUser =>
        item &&
        typeof item === 'object' &&
        typeof item.username === 'string' &&
        typeof item.passwordHash === 'string' &&
        typeof item.createdAt === 'number',
    );

    const normalizedUsers = normalizeAndAssignPlayerIds(users);
    if (users.length !== parsed.length || JSON.stringify(parsed) !== JSON.stringify(normalizedUsers)) {
      localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(normalizedUsers));
    }
    return normalizedUsers;
  } catch {
    localStorage.removeItem(AUTH_USERS_KEY);
    return [];
  }
}

function writeAuthUsers(users: AuthUser[]): void {
  if (!hasWindow()) {
    return;
  }
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users));
}

function validateUsername(raw: string): boolean {
  return /^[a-zA-Z0-9_]{3,20}$/.test(raw.trim());
}

function validatePassword(raw: string): boolean {
  return raw.length >= 6 && raw.length <= 64;
}

function writeSession(username: string): void {
  if (!hasWindow()) {
    return;
  }

  const normalized = normalizeUsername(username);
  const session: AuthSession = {
    username: normalized,
    loggedInAt: Date.now(),
  };
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

function migrateLegacyDataIfNeeded(username: string): void {
  if (!hasWindow()) {
    return;
  }

  LEGACY_DATA_KEYS.forEach((legacyKey) => {
    const targetKey = getScopedStorageKey(legacyKey, username);
    const scopedValue = localStorage.getItem(targetKey);
    if (scopedValue !== null) {
      return;
    }
    const legacyValue = localStorage.getItem(legacyKey);
    if (legacyValue !== null) {
      localStorage.setItem(targetKey, legacyValue);
    }
  });
}

export function readAuthSession(): AuthSession | null {
  if (!hasWindow()) {
    return null;
  }

  const raw = localStorage.getItem(AUTH_SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.username === 'string' &&
      typeof parsed.loggedInAt === 'number'
    ) {
      return {
        username: normalizeUsername(parsed.username),
        loggedInAt: parsed.loggedInAt,
      };
    }
  } catch {
    // fall through
  }

  localStorage.removeItem(AUTH_SESSION_KEY);
  return null;
}

export function getActiveProfileKey(): string {
  return readAuthSession()?.username || 'guest';
}

export function getScopedStorageKey(base: string, profileKey?: string): string {
  const normalized = normalizeUsername(profileKey || getActiveProfileKey()) || 'guest';
  return `${base}:${normalized}`;
}

export function loginWithPassword(username: string, password: string): AuthActionResult {
  const normalized = normalizeUsername(username);
  if (!validateUsername(normalized)) {
    return { ok: false, code: 'invalid-username' };
  }
  if (!validatePassword(password)) {
    return { ok: false, code: 'invalid-password' };
  }

  const users = readAuthUsers();
  const found = users.find((user) => user.username === normalized);
  if (!found) {
    return { ok: false, code: 'user-not-found' };
  }

  const passwordHash = hashPassword(normalized, password);
  if (found.passwordHash !== passwordHash) {
    return { ok: false, code: 'wrong-password' };
  }

  writeSession(normalized);
  migrateLegacyDataIfNeeded(normalized);
  return { ok: true, username: normalized };
}

export function registerWithPassword(username: string, password: string): AuthActionResult {
  const normalized = normalizeUsername(username);
  if (!validateUsername(normalized)) {
    return { ok: false, code: 'invalid-username' };
  }
  if (!validatePassword(password)) {
    return { ok: false, code: 'invalid-password' };
  }

  const users = readAuthUsers();
  if (users.some((user) => user.username === normalized)) {
    return { ok: false, code: 'user-exists' };
  }
  if (users.length >= MAX_PLAYER_ID) {
    return { ok: false, code: 'user-limit' };
  }

  const createdAt = Date.now();
  const nextUsers: AuthUser[] = normalizeAndAssignPlayerIds([
    {
      username: normalized,
      passwordHash: hashPassword(normalized, password),
      createdAt,
      playerId: users.length + 1,
    },
    ...users,
  ]);
  writeAuthUsers(nextUsers);
  writeSession(normalized);
  migrateLegacyDataIfNeeded(normalized);
  return { ok: true, username: normalized };
}

export function readPlayerId(username?: string): number | null {
  const normalized = normalizeUsername(username || getActiveProfileKey());
  if (!normalized || normalized === 'guest') {
    return null;
  }
  const users = readAuthUsers();
  const found = users.find((user) => user.username === normalized);
  return found?.playerId ?? null;
}

export function logoutAuthSession(): void {
  if (!hasWindow()) {
    return;
  }
  localStorage.removeItem(AUTH_SESSION_KEY);
}
