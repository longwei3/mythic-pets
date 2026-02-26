import { getScopedStorageKey } from '@/lib/auth';
import type {
  AdventureProfile,
  AdventureRunRecord,
  QualityMode,
  RunSummary,
} from '@/features/adventure3d/core/types';

const SAVE_VERSION = 2;
const ADVENTURE_PROFILE_KEY = 'adventure3d-save';
const MAX_HISTORY = 20;

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
