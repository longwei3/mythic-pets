import { getScopedStorageKey } from '@/lib/auth';
import type {
  AdventurePhase,
  AdventureProfile,
  AdventureRunRecord,
  QualityMode,
  RunSummary,
} from '@/features/adventure3d/core/types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const SAVE_VERSION = 2;
const ADVENTURE_PROFILE_KEY = 'adventure3d-save';
const MAX_HISTORY = 20;
const ADVENTURE_BEST_RUN_KEY = 'adventure3d-best-v1';
const ADVENTURE_PRESENCE_KEY = 'adventure3d-presence-v1';
const MAX_CLOUD_SCAN_ROWS = 500;

const DEFAULT_PROFILE: AdventureProfile = {
  version: SAVE_VERSION,
  bestScore: 0,
  totalRuns: 0,
  totalMythEarned: 0,
  highestZone: 1,
  updatedAt: 0,
  runHistory: [],
  settings: {
    quality: 'high',
    musicEnabled: true,
    sfxEnabled: true,
    sensitivity: 1,
  },
};

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

function normalizeQuality(input: unknown): QualityMode {
  return input === 'low' ? 'low' : 'high';
}

function isRunRecord(raw: unknown): raw is AdventureRunRecord {
  if (!raw || typeof raw !== 'object') {
    return false;
  }

  const record = raw as Partial<AdventureRunRecord>;
  return (
    typeof record.id === 'string' &&
    typeof record.playedAt === 'number' &&
    typeof record.completed === 'boolean' &&
    typeof record.score === 'number' &&
    typeof record.durationMs === 'number' &&
    typeof record.zone === 'number' &&
    typeof record.kills === 'number' &&
    typeof record.mythReward === 'number'
  );
}

function normalizeRunHistory(input: unknown): AdventureRunRecord[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((item) => isRunRecord(item))
    .sort((a, b) => b.playedAt - a.playedAt)
    .slice(0, MAX_HISTORY);
}

function migrate(raw: Partial<AdventureProfile> | null | undefined): AdventureProfile {
  const source = raw || {};
  const settings = source.settings || DEFAULT_PROFILE.settings;

  return {
    version: SAVE_VERSION,
    bestScore: typeof source.bestScore === 'number' ? source.bestScore : DEFAULT_PROFILE.bestScore,
    totalRuns: typeof source.totalRuns === 'number' ? source.totalRuns : DEFAULT_PROFILE.totalRuns,
    totalMythEarned:
      typeof source.totalMythEarned === 'number' ? source.totalMythEarned : DEFAULT_PROFILE.totalMythEarned,
    highestZone: typeof source.highestZone === 'number' ? source.highestZone : DEFAULT_PROFILE.highestZone,
    updatedAt: typeof source.updatedAt === 'number' ? source.updatedAt : Date.now(),
    runHistory: normalizeRunHistory(source.runHistory),
    settings: {
      quality: normalizeQuality(settings.quality),
      musicEnabled: typeof settings.musicEnabled === 'boolean' ? settings.musicEnabled : true,
      sfxEnabled: typeof settings.sfxEnabled === 'boolean' ? settings.sfxEnabled : true,
      sensitivity: typeof settings.sensitivity === 'number' ? settings.sensitivity : 1,
    },
  };
}

export function readAdventureProfile(username?: string | null): AdventureProfile {
  if (!hasWindow()) {
    return { ...DEFAULT_PROFILE };
  }

  const key = getScopedStorageKey(ADVENTURE_PROFILE_KEY, username || undefined);
  const raw = localStorage.getItem(key);
  if (!raw) {
    return {
      ...DEFAULT_PROFILE,
      updatedAt: Date.now(),
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AdventureProfile>;
    const migrated = migrate(parsed);
    localStorage.setItem(key, JSON.stringify(migrated));
    return migrated;
  } catch {
    const fallback = {
      ...DEFAULT_PROFILE,
      updatedAt: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }
}

export function writeAdventureProfile(profile: AdventureProfile, username?: string | null): AdventureProfile {
  if (!hasWindow()) {
    return profile;
  }

  const key = getScopedStorageKey(ADVENTURE_PROFILE_KEY, username || undefined);
  const normalized = migrate({
    ...profile,
    updatedAt: Date.now(),
  });
  localStorage.setItem(key, JSON.stringify(normalized));
  return normalized;
}

export function updateAdventureSettings(
  settingsPatch: Partial<AdventureProfile['settings']>,
  username?: string | null,
): AdventureProfile {
  const current = readAdventureProfile(username);
  return writeAdventureProfile(
    {
      ...current,
      settings: {
        ...current.settings,
        ...settingsPatch,
        quality: normalizeQuality(settingsPatch.quality ?? current.settings.quality),
      },
    },
    username,
  );
}

export function recordAdventureRun(summary: RunSummary, username?: string | null, playedAt = Date.now()): AdventureProfile {
  const current = readAdventureProfile(username);

  const record: AdventureRunRecord = {
    ...summary,
    playedAt,
    id: `${playedAt}-${Math.random().toString(36).slice(2, 8)}`,
  };

  const next: AdventureProfile = {
    ...current,
    totalRuns: current.totalRuns + 1,
    totalMythEarned: current.totalMythEarned + Math.max(0, summary.mythReward),
    highestZone: Math.max(current.highestZone, summary.zone),
    bestScore: Math.max(current.bestScore, summary.score),
    runHistory: [record, ...current.runHistory].slice(0, MAX_HISTORY),
  };

  return writeAdventureProfile(next, username);
}

export function getAdventureLeaderboard(profile: AdventureProfile, limit = 5): AdventureRunRecord[] {
  return [...profile.runHistory]
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (b.zone !== a.zone) {
        return b.zone - a.zone;
      }
      return a.durationMs - b.durationMs;
    })
    .slice(0, Math.max(1, limit));
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function compareRunScore(a: Pick<AdventureRunRecord, 'score' | 'zone' | 'durationMs' | 'playedAt'>, b: Pick<AdventureRunRecord, 'score' | 'zone' | 'durationMs' | 'playedAt'>): number {
  if (b.score !== a.score) {
    return b.score - a.score;
  }
  if (b.zone !== a.zone) {
    return b.zone - a.zone;
  }
  if (a.durationMs !== b.durationMs) {
    return a.durationMs - b.durationMs;
  }
  return b.playedAt - a.playedAt;
}

function toRunRecord(summary: RunSummary, playedAt: number): AdventureRunRecord {
  return {
    ...summary,
    playedAt,
    id: `${playedAt}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

function parseCloudRunRecord(value: unknown): AdventureRunRecord | null {
  if (!isObjectLike(value)) {
    return null;
  }

  const id = value.id;
  const playedAt = value.playedAt;
  const completed = value.completed;
  const score = value.score;
  const durationMs = value.durationMs;
  const zone = value.zone;
  const kills = value.kills;
  const mythReward = value.mythReward;

  if (
    typeof id !== 'string' ||
    !isFiniteNumber(playedAt) ||
    typeof completed !== 'boolean' ||
    !isFiniteNumber(score) ||
    !isFiniteNumber(durationMs) ||
    !isFiniteNumber(zone) ||
    !isFiniteNumber(kills) ||
    !isFiniteNumber(mythReward)
  ) {
    return null;
  }

  return {
    id,
    playedAt,
    completed,
    score,
    durationMs,
    zone,
    kills,
    mythReward,
  };
}

export interface GlobalAdventureLeaderboardEntry extends AdventureRunRecord {
  username: string;
}

export async function syncAdventureBestRun(
  summary: RunSummary,
  username?: string | null,
  playedAt = Date.now(),
): Promise<void> {
  if (!username || !isSupabaseConfigured || !supabase) {
    return;
  }

  const nextBest = toRunRecord(summary, playedAt);

  try {
    const { data: existingRow, error: existingError } = await supabase
      .from('game_state')
      .select('value')
      .eq('user_id', username)
      .eq('key', ADVENTURE_BEST_RUN_KEY)
      .maybeSingle();

    if (existingError) {
      console.warn('Read adventure best run failed:', existingError.message);
      return;
    }

    const existingBest = parseCloudRunRecord(existingRow?.value);
    const shouldUpdate = !existingBest || compareRunScore(nextBest, existingBest) < 0;
    if (!shouldUpdate) {
      return;
    }

    const { error: upsertError } = await supabase.from('game_state').upsert(
      {
        user_id: username,
        key: ADVENTURE_BEST_RUN_KEY,
        value: nextBest,
        updated_at: new Date(playedAt).toISOString(),
      },
      { onConflict: 'user_id,key' },
    );

    if (upsertError) {
      console.warn('Sync adventure best run failed:', upsertError.message);
    }
  } catch (error) {
    console.warn('Sync adventure best run error:', error);
  }
}

export async function getGlobalAdventureLeaderboard(limit = 20): Promise<GlobalAdventureLeaderboardEntry[]> {
  if (!isSupabaseConfigured || !supabase) {
    return [];
  }

  try {
    const scanLimit = Math.max(limit, MAX_CLOUD_SCAN_ROWS);
    const { data, error } = await supabase
      .from('game_state')
      .select('user_id,value')
      .eq('key', ADVENTURE_BEST_RUN_KEY)
      .limit(scanLimit);

    if (error || !data) {
      if (error) {
        console.warn('Load global adventure leaderboard failed:', error.message);
      }
      return [];
    }

    return data
      .map((row) => {
        const record = parseCloudRunRecord(row.value);
        if (!record) {
          return null;
        }
        return {
          ...record,
          username: row.user_id,
        } satisfies GlobalAdventureLeaderboardEntry;
      })
      .filter((item): item is GlobalAdventureLeaderboardEntry => Boolean(item))
      .sort(compareRunScore)
      .slice(0, Math.max(1, limit));
  } catch (error) {
    console.warn('Load global adventure leaderboard error:', error);
    return [];
  }
}

export interface AdventurePresenceEntry {
  username: string;
  zone: number;
  phase: AdventurePhase;
  level: number;
  mythBalance: number;
  onlineAt: number;
}

interface AdventurePresencePayload {
  zone: number;
  phase: AdventurePhase;
  level: number;
  mythBalance: number;
}

function parseAdventurePhase(value: unknown): AdventurePhase {
  if (
    value === 'idle' ||
    value === 'running' ||
    value === 'paused' ||
    value === 'failed' ||
    value === 'completed'
  ) {
    return value;
  }
  return 'idle';
}

function parseCloudPresence(username: string, value: unknown): AdventurePresenceEntry | null {
  if (!isObjectLike(value)) {
    return null;
  }

  const zone = value.zone;
  const level = value.level;
  const mythBalance = value.mythBalance;
  const onlineAt = value.onlineAt;
  const phase = parseAdventurePhase(value.phase);

  if (!isFiniteNumber(zone) || !isFiniteNumber(level) || !isFiniteNumber(mythBalance) || !isFiniteNumber(onlineAt)) {
    return null;
  }

  return {
    username,
    zone,
    level,
    mythBalance,
    phase,
    onlineAt,
  };
}

export async function heartbeatAdventurePresence(
  username: string,
  payload: AdventurePresencePayload,
): Promise<void> {
  if (!username || !isSupabaseConfigured || !supabase) {
    return;
  }

  const onlineAt = Date.now();
  const value = {
    ...payload,
    onlineAt,
  };

  try {
    const { error } = await supabase.from('game_state').upsert(
      {
        user_id: username,
        key: ADVENTURE_PRESENCE_KEY,
        value,
        updated_at: new Date(onlineAt).toISOString(),
      },
      { onConflict: 'user_id,key' },
    );

    if (error) {
      console.warn('Adventure presence heartbeat failed:', error.message);
    }
  } catch (error) {
    console.warn('Adventure presence heartbeat error:', error);
  }
}

export async function getAdventurePresenceList(
  limit = 12,
  activeWindowMs = 90_000,
): Promise<AdventurePresenceEntry[]> {
  if (!isSupabaseConfigured || !supabase) {
    return [];
  }

  try {
    const scanLimit = Math.max(limit * 5, 60);
    const { data, error } = await supabase
      .from('game_state')
      .select('user_id,value')
      .eq('key', ADVENTURE_PRESENCE_KEY)
      .order('updated_at', { ascending: false })
      .limit(scanLimit);

    if (error || !data) {
      if (error) {
        console.warn('Load adventure presence failed:', error.message);
      }
      return [];
    }

    const now = Date.now();
    return data
      .map((row) => parseCloudPresence(row.user_id, row.value))
      .filter((entry): entry is AdventurePresenceEntry => Boolean(entry))
      .filter((entry) => now - entry.onlineAt <= activeWindowMs)
      .sort((a, b) => b.onlineAt - a.onlineAt)
      .slice(0, Math.max(1, limit));
  } catch (error) {
    console.warn('Load adventure presence error:', error);
    return [];
  }
}
