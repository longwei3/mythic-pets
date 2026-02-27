import { supabase, isSupabaseConfigured } from './supabase';
import { getActiveProfileKey, getScopedStorageKey } from './auth';

const SYNC_INTERVAL_MS = 30_000;
const SYNC_KEY_PREFIX = 'mythicpets-last-sync';
const GAME_STATE_SNAPSHOT_KEY = 'snapshot-v1';

let isSyncing = false;
let syncIntervalId: ReturnType<typeof setInterval> | null = null;

interface CloudSyncResult {
  ok: boolean;
  error?: string;
  skipped?: boolean;
}

interface SnapshotPayload {
  version: 1;
  savedAt: number;
  username: string;
  data: Record<string, string>;
}

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

function getUserId(): string | null {
  const username = getActiveProfileKey();
  return username && username !== 'guest' ? username : null;
}

function shouldSyncStorageKey(key: string, username: string): boolean {
  if (!key || !key.endsWith(`:${username}`)) {
    return false;
  }

  if (key.startsWith('mythicpets-auth-') || key.startsWith(SYNC_KEY_PREFIX)) {
    return false;
  }

  return (
    key.startsWith('myPets:') ||
    key.startsWith('myListedPets:') ||
    key.startsWith('generation1Count:') ||
    key.startsWith('adventure3d-save:') ||
    key.startsWith('mythicpets-')
  );
}

function collectUserStorage(username: string): Record<string, string> {
  const data: Record<string, string> = {};
  if (!hasWindow()) {
    return data;
  }

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !shouldSyncStorageKey(key, username)) {
      continue;
    }

    const value = localStorage.getItem(key);
    if (value !== null) {
      data[key] = value;
    }
  }

  return data;
}

function restoreUserStorage(data: Record<string, string>): void {
  if (!hasWindow()) {
    return;
  }

  for (const [key, value] of Object.entries(data)) {
    localStorage.setItem(key, value);
  }
}

function getSyncMarkerKey(username: string): string {
  return `${SYNC_KEY_PREFIX}:${username}`;
}

function readLocalSyncTime(username: string): number {
  if (!hasWindow()) {
    return 0;
  }

  const raw = localStorage.getItem(getSyncMarkerKey(username));
  if (!raw) {
    return 0;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return 0;
  }

  return parsed;
}

function writeLocalSyncTime(username: string, timestamp: number): void {
  if (!hasWindow()) {
    return;
  }

  localStorage.setItem(getSyncMarkerKey(username), String(timestamp));
}

function buildSnapshot(username: string): SnapshotPayload {
  return {
    version: 1,
    savedAt: Date.now(),
    username,
    data: collectUserStorage(username),
  };
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseSnapshot(value: unknown): SnapshotPayload | null {
  if (!isObjectLike(value)) {
    return null;
  }

  const version = value.version;
  const savedAt = value.savedAt;
  const username = value.username;
  const data = value.data;

  if (version !== 1 || typeof savedAt !== 'number' || typeof username !== 'string' || !isObjectLike(data)) {
    return null;
  }

  const normalizedData: Record<string, string> = {};
  for (const [key, raw] of Object.entries(data)) {
    if (typeof raw === 'string') {
      normalizedData[key] = raw;
    }
  }

  return {
    version: 1,
    savedAt,
    username,
    data: normalizedData,
  };
}

function parseLegacySnapshot(value: unknown, username: string): SnapshotPayload | null {
  if (!isObjectLike(value)) {
    return null;
  }

  const legacyData: Record<string, string> = {};

  const gatherTask = value['gather-task'];
  if (gatherTask !== undefined) {
    legacyData[getScopedStorageKey('mythicpets-gather-task', username)] = JSON.stringify(gatherTask);
  }

  const battleCooldowns = value['battle-cooldowns'];
  if (isObjectLike(battleCooldowns)) {
    for (const [petId, until] of Object.entries(battleCooldowns)) {
      if (typeof until === 'number' && Number.isFinite(until)) {
        const key = getScopedStorageKey(`mythicpets-battle-cooldown:${petId}`, username);
        legacyData[key] = String(until);
      }
    }
  } else if (typeof battleCooldowns === 'number' && Number.isFinite(battleCooldowns)) {
    legacyData[getScopedStorageKey('mythicpets-battle-cooldown:default', username)] = String(battleCooldowns);
  }

  if (Object.keys(legacyData).length === 0) {
    return null;
  }

  return {
    version: 1,
    savedAt: Date.now(),
    username,
    data: legacyData,
  };
}

export async function syncToCloud(): Promise<CloudSyncResult> {
  if (isSyncing) {
    return { ok: false, error: 'Already syncing' };
  }

  const userId = getUserId();
  if (!userId) {
    return { ok: false, error: 'Not logged in' };
  }

  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, error: 'Cloud not configured' };
  }

  isSyncing = true;
  try {
    const snapshot = buildSnapshot(userId);

    const { error } = await supabase.from('game_state').upsert(
      {
        user_id: userId,
        key: GAME_STATE_SNAPSHOT_KEY,
        value: snapshot,
        updated_at: new Date(snapshot.savedAt).toISOString(),
      },
      { onConflict: 'user_id,key' },
    );

    if (error) {
      console.error('Error syncing snapshot:', error);
      return { ok: false, error: error.message };
    }

    writeLocalSyncTime(userId, snapshot.savedAt);
    return { ok: true };
  } catch (error) {
    console.error('Sync error:', error);
    return { ok: false, error: String(error) };
  } finally {
    isSyncing = false;
  }
}

export async function loadFromCloud(): Promise<CloudSyncResult> {
  const userId = getUserId();
  if (!userId) {
    return { ok: false, error: 'Not logged in' };
  }

  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, error: 'Cloud not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('game_state')
      .select('value')
      .eq('user_id', userId)
      .eq('key', GAME_STATE_SNAPSHOT_KEY)
      .maybeSingle();

    if (error) {
      console.error('Load error:', error);
      return { ok: false, error: error.message };
    }

    if (!data?.value) {
      return { ok: true, skipped: true };
    }

    const snapshot = parseSnapshot(data.value) ?? parseLegacySnapshot(data.value, userId);
    if (!snapshot) {
      return { ok: false, error: 'Invalid cloud snapshot' };
    }

    // Prevent older cloud data from overriding fresher local progress.
    const localSyncTime = readLocalSyncTime(userId);
    if (localSyncTime > snapshot.savedAt) {
      return { ok: true, skipped: true };
    }

    restoreUserStorage(snapshot.data);
    writeLocalSyncTime(userId, snapshot.savedAt);
    return { ok: true };
  } catch (error) {
    console.error('Load error:', error);
    return { ok: false, error: String(error) };
  }
}

export function startAutoSync(): void {
  if (syncIntervalId) {
    return;
  }

  // Persist quickly once sync is enabled, then continue periodic snapshots.
  void syncToCloud();

  syncIntervalId = setInterval(() => {
    const userId = getUserId();
    if (userId) {
      void syncToCloud();
    }
  }, SYNC_INTERVAL_MS);
}

export function stopAutoSync(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
}

export function triggerSync(): void {
  void syncToCloud();
}
