import CryptoJS from 'crypto-js';
import { migrateToEncrypted, patchLocalStorage } from './secureStorage';
import { isSupabaseConfigured, supabase } from './supabase';

export const AUTH_USERS_KEY = 'mythicpets-auth-users';
export const AUTH_USERS_BACKUP_KEY = 'mythicpets-auth-users-backup';
export const AUTH_SESSION_KEY = 'mythicpets-auth-session';
export const MAX_PLAYER_ID = 10000;
const ENCRYPTION_KEY_PREFIX = 'mythic-pets-secure-v1';
const AUTH_CLOUD_KEY = 'auth-user-v1';
const AUTH_PLAYER_ID_COUNTER_USER = '__system__';
const AUTH_PLAYER_ID_COUNTER_KEY = 'auth-player-id-counter-v1';
const STARTER_ELEMENTS = ['gold', 'wood', 'water', 'fire', 'earth'] as const;
type StarterElement = (typeof STARTER_ELEMENTS)[number];

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
  | 'wrong-password'
  | 'cloud-unavailable';

export interface AuthActionResult {
  ok: boolean;
  code?: AuthActionCode;
  username?: string;
}

interface CloudAuthRecord {
  username: string;
  passwordHash: string;
  createdAt: number;
  playerId?: number;
  updatedAt: number;
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

function shuffleArray<T>(items: readonly T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function createStarterPets(): Array<Record<string, unknown>> {
  const shuffled = shuffleArray(STARTER_ELEMENTS);
  const maleElements: StarterElement[] = [shuffled[0], shuffled[1], shuffled[2]];
  const femaleElements: StarterElement[] = [shuffled[2], shuffled[3], shuffled[4]];

  return [
    {
      id: 1,
      name: 'Lobster One',
      element: maleElements,
      gender: 'male',
      level: 1,
      exp: 0,
      maxExp: 100,
      attack: 20,
      defense: 10,
      hp: 50,
      maxHp: 50,
      mp: 40,
      maxMp: 40,
      rarity: 'common',
      generation: 1,
    },
    {
      id: 2,
      name: 'Lobster Two',
      element: femaleElements,
      gender: 'female',
      level: 1,
      exp: 0,
      maxExp: 100,
      attack: 18,
      defense: 12,
      hp: 55,
      maxHp: 55,
      mp: 45,
      maxMp: 45,
      rarity: 'common',
      generation: 1,
    },
  ];
}

export function ensureStarterPetsForUser(username: string): void {
  if (!hasWindow()) {
    return;
  }

  const normalized = normalizeUsername(username);
  if (!normalized || normalized === 'guest') {
    return;
  }

  const myPetsKey = getScopedStorageKey('myPets', normalized);
  const existing = localStorage.getItem(myPetsKey);
  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return;
      }
    } catch {
      // invalid existing value: overwrite with starter pets
    }
  }

  localStorage.setItem(myPetsKey, JSON.stringify(createStarterPets()));
  const generationKey = getScopedStorageKey('generation1Count', normalized);
  const currentCount = Number.parseInt(localStorage.getItem(generationKey) || '0', 10);
  const nextCount = Number.isFinite(currentCount) && currentCount >= 0 ? currentCount + 1 : 1;
  localStorage.setItem(generationKey, String(nextCount));
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

function parseCloudAuthRecord(value: unknown, usernameHint: string): CloudAuthRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const parsed = value as Record<string, unknown>;
  if (typeof parsed.passwordHash !== 'string') {
    return null;
  }

  const username = typeof parsed.username === 'string' ? normalizeUsername(parsed.username) : usernameHint;
  if (!username || username !== usernameHint) {
    return null;
  }

  const createdAtRaw = parsed.createdAt;
  const createdAt = typeof createdAtRaw === 'number' && Number.isFinite(createdAtRaw)
    ? createdAtRaw
    : Date.now();

  const updatedAtRaw = parsed.updatedAt;
  const updatedAt = typeof updatedAtRaw === 'number' && Number.isFinite(updatedAtRaw)
    ? updatedAtRaw
    : Date.now();
  const playerId = isValidPlayerId(parsed.playerId) ? parsed.playerId : undefined;

  return {
    username,
    passwordHash: parsed.passwordHash,
    createdAt,
    playerId,
    updatedAt,
  };
}

function compareByCreatedAtAndUsername(a: Pick<AuthUser, 'createdAt' | 'username'>, b: Pick<AuthUser, 'createdAt' | 'username'>): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt - b.createdAt;
  }
  return a.username.localeCompare(b.username);
}

function isValidPlayerId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_PLAYER_ID;
}

function getNextAvailablePlayerId(users: Array<Pick<AuthUser, 'playerId'>>): number | null {
  const used = new Set<number>();
  users.forEach((user) => {
    if (isValidPlayerId(user.playerId)) {
      used.add(user.playerId);
    }
  });

  for (let id = 1; id <= MAX_PLAYER_ID; id += 1) {
    if (!used.has(id)) {
      return id;
    }
  }

  return null;
}

function normalizeAndAssignPlayerIds(users: Omit<AuthUser, 'playerId'>[] | AuthUser[]): AuthUser[] {
  const sorted = [...users].sort(compareByCreatedAtAndUsername);

  const deduped: (Omit<AuthUser, 'playerId'> | AuthUser)[] = [];
  const seen = new Set<string>();
  for (const user of sorted) {
    const key = normalizeUsername(user.username);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push({
      ...user,
      username: key,
    });
  }

  const usedIds = new Set<number>();
  deduped.forEach((user) => {
    if (isValidPlayerId((user as Partial<AuthUser>).playerId)) {
      usedIds.add((user as AuthUser).playerId);
    }
  });

  let nextCandidate = 1;

  return deduped.map((user) => {
    let playerId = isValidPlayerId((user as Partial<AuthUser>).playerId)
      ? (user as AuthUser).playerId
      : null;

    if (!playerId) {
      while (usedIds.has(nextCandidate) && nextCandidate <= MAX_PLAYER_ID) {
        nextCandidate += 1;
      }
      playerId = nextCandidate <= MAX_PLAYER_ID ? nextCandidate : MAX_PLAYER_ID;
      usedIds.add(playerId);
      nextCandidate += 1;
    }

    return {
      username: user.username,
      passwordHash: user.passwordHash,
      createdAt: user.createdAt,
      playerId,
    };
  });
}

function normalizeAuthUserRecord(raw: unknown): Omit<AuthUser, 'playerId'> | AuthUser | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const item = raw as Record<string, unknown>;
  if (typeof item.username !== 'string' || typeof item.passwordHash !== 'string') {
    return null;
  }

  let createdAt: number | null = null;
  if (typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)) {
    createdAt = item.createdAt;
  } else if (typeof item.createdAt === 'string') {
    const parsed = Number.parseInt(item.createdAt, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      createdAt = parsed;
    }
  }

  if (!createdAt) {
    return null;
  }

  if (isValidPlayerId(item.playerId)) {
    return {
      username: item.username,
      passwordHash: item.passwordHash,
      createdAt,
      playerId: item.playerId,
    };
  }

  return {
    username: item.username,
    passwordHash: item.passwordHash,
    createdAt,
  };
}

function parseAuthUsersPayload(raw: string): (Omit<AuthUser, 'playerId'> | AuthUser)[] | null {
  const parsed = JSON.parse(raw) as unknown;
  let list: unknown[] | null = null;

  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const maybeObject = parsed as { users?: unknown[]; username?: unknown; passwordHash?: unknown };
    if (Array.isArray(maybeObject.users)) {
      list = maybeObject.users;
    } else if (typeof maybeObject.username === 'string' && typeof maybeObject.passwordHash === 'string') {
      list = [maybeObject];
    } else {
      const values = Object.values(parsed as Record<string, unknown>);
      if (values.length > 0) {
        list = values;
      }
    }
  }

  if (!list) {
    return null;
  }

  const users = list
    .map((item) => normalizeAuthUserRecord(item))
    .filter((item): item is Omit<AuthUser, 'playerId'> | AuthUser => Boolean(item));
  return users;
}

function tryDecryptAuthUsers(raw: string, usernameHint?: string): (Omit<AuthUser, 'playerId'> | AuthUser)[] | null {
  const normalizedHint = usernameHint ? normalizeUsername(usernameHint) : '';
  const candidateKeys: string[] = [ENCRYPTION_KEY_PREFIX];
  if (normalizedHint) {
    candidateKeys.push(CryptoJS.SHA256(ENCRYPTION_KEY_PREFIX + normalizedHint).toString());
  }

  for (const key of candidateKeys) {
    try {
      const decrypted = CryptoJS.AES.decrypt(raw, key).toString(CryptoJS.enc.Utf8);
      if (!decrypted) {
        continue;
      }
      const users = parseAuthUsersPayload(decrypted);
      if (users) {
        return users;
      }
    } catch {
      // continue
    }
  }

  return null;
}

function decodeAuthUsersRaw(raw: string, usernameHint?: string): AuthUser[] | null {
  try {
    const users = parseAuthUsersPayload(raw) ?? tryDecryptAuthUsers(raw, usernameHint);
    if (users === null) {
      return null;
    }
    return normalizeAndAssignPlayerIds(users);
  } catch {
    return null;
  }
}

function persistAuthUsers(users: AuthUser[]): void {
  if (!hasWindow()) {
    return;
  }
  const serialized = JSON.stringify(users);
  localStorage.setItem(AUTH_USERS_KEY, serialized);
  localStorage.setItem(AUTH_USERS_BACKUP_KEY, serialized);
}

function readAuthUsers(usernameHint?: string): AuthUser[] {
  if (!hasWindow()) {
    return [];
  }

  const primaryRaw = localStorage.getItem(AUTH_USERS_KEY);
  const backupRaw = localStorage.getItem(AUTH_USERS_BACKUP_KEY);

  const primaryUsers = primaryRaw ? decodeAuthUsersRaw(primaryRaw, usernameHint) : null;
  if (primaryUsers) {
    const backupUsers = backupRaw ? decodeAuthUsersRaw(backupRaw, usernameHint) : null;
    if (!backupUsers || JSON.stringify(backupUsers) !== JSON.stringify(primaryUsers)) {
      persistAuthUsers(primaryUsers);
    }
    return primaryUsers;
  }

  const backupUsers = backupRaw ? decodeAuthUsersRaw(backupRaw, usernameHint) : null;
  if (backupUsers) {
    persistAuthUsers(backupUsers);
    return backupUsers;
  }

  return [];
}

function writeAuthUsers(users: AuthUser[]): void {
  if (!hasWindow()) {
    return;
  }
  persistAuthUsers(users);
}

function validateUsername(raw: string): boolean {
  const normalized = normalizeUsername(raw);
  if (normalized === 'guest') {
    return false;
  }
  return /^[a-zA-Z0-9_]{3,11}$/.test(normalized);
}

function validatePassword(raw: string): boolean {
  return raw.length >= 3 && raw.length <= 11;
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

function parseCloudPlayerCounter(value: unknown): number {
  if (!value || typeof value !== 'object') {
    return 0;
  }
  const parsed = value as Record<string, unknown>;
  const candidate = [parsed.lastAssigned, parsed.current, parsed.next]
    .find((item) => typeof item === 'number' && Number.isFinite(item)) as number | undefined;
  if (!candidate) {
    return 0;
  }
  return Math.max(0, Math.floor(candidate));
}

function parseCloudPlayerId(value: unknown): number | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const parsed = value as Record<string, unknown>;
  return isValidPlayerId(parsed.playerId) ? parsed.playerId : null;
}

async function reserveNextCloudPlayerId(): Promise<number | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data: counterRow, error: counterError } = await supabase
      .from('game_state')
      .select('value,updated_at')
      .eq('user_id', AUTH_PLAYER_ID_COUNTER_USER)
      .eq('key', AUTH_PLAYER_ID_COUNTER_KEY)
      .maybeSingle();

    if (counterError) {
      console.warn('Cloud player id counter read failed:', counterError.message);
      return null;
    }

    let lastAssigned = parseCloudPlayerCounter(counterRow?.value);
    if (!counterRow) {
      const { data: authRows, error: authRowsError } = await supabase
        .from('game_state')
        .select('value')
        .eq('key', AUTH_CLOUD_KEY);
      if (!authRowsError && authRows) {
        authRows.forEach((row) => {
          const cloudPlayerId = parseCloudPlayerId(row.value);
          if (cloudPlayerId) {
            lastAssigned = Math.max(lastAssigned, cloudPlayerId);
          }
        });
      }
    }

    const nextId = lastAssigned + 1;
    if (nextId > MAX_PLAYER_ID) {
      return null;
    }

    const nowIso = new Date().toISOString();
    const counterValue = { lastAssigned: nextId, updatedAt: Date.now() };

    if (counterRow) {
      const { data: updatedRows, error: updateError } = await supabase
        .from('game_state')
        .update({
          value: counterValue,
          updated_at: nowIso,
        })
        .eq('user_id', AUTH_PLAYER_ID_COUNTER_USER)
        .eq('key', AUTH_PLAYER_ID_COUNTER_KEY)
        .eq('updated_at', counterRow.updated_at)
        .select('id');

      if (updateError) {
        continue;
      }

      if (!updatedRows || updatedRows.length === 0) {
        continue;
      }

      return nextId;
    }

    const { error: insertError } = await supabase.from('game_state').insert({
      user_id: AUTH_PLAYER_ID_COUNTER_USER,
      key: AUTH_PLAYER_ID_COUNTER_KEY,
      value: counterValue,
      updated_at: nowIso,
    });

    if (insertError) {
      continue;
    }

    return nextId;
  }

  return null;
}

function syncLocalPlayerId(username: string, playerId: number, passwordHash?: string, createdAt?: number): void {
  if (!isValidPlayerId(playerId)) {
    return;
  }

  const normalized = normalizeUsername(username);
  const users = readAuthUsers(normalized);
  const existing = users.find((user) => user.username === normalized);
  const password = existing?.passwordHash ?? passwordHash;
  if (!password) {
    return;
  }

  const merged = normalizeAndAssignPlayerIds([
    ...users.filter((user) => user.username !== normalized),
    {
      username: normalized,
      passwordHash: password,
      createdAt: existing?.createdAt ?? createdAt ?? Date.now(),
      playerId,
    },
  ]);
  writeAuthUsers(merged);
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

  const users = readAuthUsers(normalized);
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
  ensureStarterPetsForUser(normalized);
  return { ok: true, username: normalized };
}

export async function loginWithCloudCheck(username: string, password: string): Promise<AuthActionResult> {
  const normalized = normalizeUsername(username);
  if (!validateUsername(normalized)) {
    return { ok: false, code: 'invalid-username' };
  }
  if (!validatePassword(password)) {
    return { ok: false, code: 'invalid-password' };
  }
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, code: 'cloud-unavailable' };
  }

  try {
    const { data, error } = await supabase
      .from('game_state')
      .select('value')
      .eq('user_id', normalized)
      .eq('key', AUTH_CLOUD_KEY)
      .maybeSingle();

    if (error) {
      console.warn('Cloud auth query failed:', error.message);
      return { ok: false, code: 'cloud-unavailable' };
    }

    const record = parseCloudAuthRecord(data?.value, normalized);
    if (!record) {
      return { ok: false, code: 'user-not-found' };
    }

    const passwordHash = hashPassword(normalized, password);
    if (record.passwordHash !== passwordHash) {
      return { ok: false, code: 'wrong-password' };
    }

    const users = readAuthUsers(normalized);
    const existing = users.find((user) => user.username === normalized);
    const fallbackLocalPlayerId = existing?.playerId ?? getNextAvailablePlayerId(users) ?? 1;
    const reservedPlayerId = record.playerId ?? (await reserveNextCloudPlayerId()) ?? fallbackLocalPlayerId;
    const finalPlayerId = isValidPlayerId(reservedPlayerId) ? reservedPlayerId : fallbackLocalPlayerId;

    const merged = normalizeAndAssignPlayerIds([
      ...users.filter((user) => user.username !== normalized),
      {
        username: normalized,
        passwordHash: record.passwordHash,
        createdAt: existing ? Math.min(existing.createdAt, record.createdAt) : record.createdAt,
        playerId: finalPlayerId,
      },
    ]);
    writeAuthUsers(merged);

    if (!record.playerId || record.playerId !== finalPlayerId) {
      const now = Date.now();
      const payload: CloudAuthRecord = {
        username: normalized,
        passwordHash: record.passwordHash,
        createdAt: record.createdAt,
        playerId: finalPlayerId,
        updatedAt: now,
      };
      await supabase.from('game_state').upsert(
        {
          user_id: normalized,
          key: AUTH_CLOUD_KEY,
          value: payload,
          updated_at: new Date(now).toISOString(),
        },
        { onConflict: 'user_id,key' },
      );
    }

    writeSession(normalized);
    migrateLegacyDataIfNeeded(normalized);
    ensureStarterPetsForUser(normalized);
    return { ok: true, username: normalized };
  } catch (error) {
    console.warn('Cloud auth check failed:', error);
    return { ok: false, code: 'cloud-unavailable' };
  }
}

export function registerWithPassword(username: string, password: string): AuthActionResult {
  const normalized = normalizeUsername(username);
  if (!validateUsername(normalized)) {
    return { ok: false, code: 'invalid-username' };
  }
  if (!validatePassword(password)) {
    return { ok: false, code: 'invalid-password' };
  }

  const users = readAuthUsers(normalized);
  if (users.some((user) => user.username === normalized)) {
    return { ok: false, code: 'user-exists' };
  }
  const nextPlayerId = getNextAvailablePlayerId(users);
  if (!nextPlayerId) {
    return { ok: false, code: 'user-limit' };
  }

  const createdAt = Date.now();
  const nextUsers: AuthUser[] = normalizeAndAssignPlayerIds([
    {
      username: normalized,
      passwordHash: hashPassword(normalized, password),
      createdAt,
      playerId: nextPlayerId,
    },
    ...users,
  ]);
  writeAuthUsers(nextUsers);
  writeSession(normalized);
  migrateLegacyDataIfNeeded(normalized);
  ensureStarterPetsForUser(normalized);
  return { ok: true, username: normalized };
}

export async function syncAuthUserToCloud(username: string): Promise<void> {
  const normalized = normalizeUsername(username);
  if (!validateUsername(normalized)) {
    return;
  }
  if (!isSupabaseConfigured || !supabase) {
    return;
  }

  const users = readAuthUsers(normalized);
  const found = users.find((user) => user.username === normalized);
  if (!found) {
    return;
  }

  const { data: cloudAuthData, error: cloudAuthError } = await supabase
    .from('game_state')
    .select('value')
    .eq('user_id', normalized)
    .eq('key', AUTH_CLOUD_KEY)
    .maybeSingle();

  if (cloudAuthError) {
    console.warn('Cloud auth read before sync failed:', cloudAuthError.message);
    return;
  }

  const cloudAuth = parseCloudAuthRecord(cloudAuthData?.value, normalized);
  const reservedPlayerId = cloudAuth?.playerId ?? (await reserveNextCloudPlayerId());
  const finalPlayerId = isValidPlayerId(reservedPlayerId)
    ? reservedPlayerId
    : (isValidPlayerId(found.playerId) ? found.playerId : null);

  if (!finalPlayerId) {
    console.warn('Cloud player id allocation failed for:', normalized);
    return;
  }

  syncLocalPlayerId(normalized, finalPlayerId, found.passwordHash, found.createdAt);

  const payload: CloudAuthRecord = {
    username: normalized,
    passwordHash: found.passwordHash,
    createdAt: found.createdAt,
    playerId: finalPlayerId,
    updatedAt: Date.now(),
  };

  const { error } = await supabase.from('game_state').upsert(
    {
      user_id: normalized,
      key: AUTH_CLOUD_KEY,
      value: payload,
      updated_at: new Date(payload.updatedAt).toISOString(),
    },
    { onConflict: 'user_id,key' },
  );

  if (error) {
    console.warn('Cloud auth sync failed:', error.message);
  }
}

export function readPlayerId(username?: string): number | null {
  const normalized = normalizeUsername(username || getActiveProfileKey());
  if (!normalized || normalized === 'guest') {
    return null;
  }
  const users = readAuthUsers(normalized);
  const found = users.find((user) => user.username === normalized);
  return found?.playerId ?? null;
}

export function logoutAuthSession(): void {
  if (!hasWindow()) {
    return;
  }
  localStorage.removeItem(AUTH_SESSION_KEY);
}
