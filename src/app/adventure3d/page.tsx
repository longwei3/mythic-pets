'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import AuthStatus from '@/components/AuthStatus';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import RequireAuth from '@/components/RequireAuth';
import { useAuth } from '@/components/AuthProvider';
import { getScopedStorageKey } from '@/lib/auth';
import {
  applyAttack,
  applyGather,
  applyJump,
  applyTick,
  computeRunSummary,
  createInitialWorldState,
  cycleTarget,
  getCheckpointPosition,
  pauseRun,
  resetRun,
  resumeRun,
  startRun,
} from '@/features/adventure3d/core/runStore';
import type {
  AdventureWorldState,
  CameraViewMode,
  EnemyKind,
  RunSummary,
} from '@/features/adventure3d/core/types';
import AdventureScene from '@/features/adventure3d/scene/AdventureScene';
import {
  type AdventurePresenceEntry,
  type GlobalAdventureLeaderboardEntry,
  getAdventurePresenceList,
  getAdventureLeaderboard,
  getGlobalAdventureLeaderboard,
  heartbeatAdventurePresence,
  readAdventureProfile,
  recordAdventureRun,
  syncAdventureBestRun,
  updateAdventureSettings,
} from '@/features/adventure3d/save/profileSave';
import { useAdventureInput } from '@/features/adventure3d/systems/inputSystem';
import { ADVENTURE_MAP_BOUNDARY, DEFAULT_PLAYER_STATE } from '@/features/adventure3d/config/gameBalance';
import { grantMyth, readMythBalance } from '@/lib/economy';
import { BATTLE_COOLDOWN_MS, formatCooldownTimer } from '@/lib/battleCooldown';
import { localizePetName } from '@/lib/petNames';
import {
  consumeHealthPotion,
  consumeMagicPotion,
  readHealthPotionCount,
  readMagicPotionCount,
} from '@/lib/magicPotions';
import {
  playAdventureActionSfx,
  playAdventureCreatureSfx,
  playAdventureEdgeWaveSfx,
  startAdventureBgm,
  startAdventureWaterAmbience,
  stopAdventureBgm,
  stopAdventureWaterAmbience,
} from '@/lib/sounds';
import type { AdventureProfile } from '@/features/adventure3d/core/types';

const ADVENTURE_COOLDOWN_KEY = 'mythicpets-adventure3d-fail-cooldown';
const COOLDOWN_TICK_MS = 1000;
const ONLINE_HEARTBEAT_MS = 20_000;
const LEADERBOARD_REFRESH_MS = 45_000;
const ADVENTURE_MAGIC_POTION_RECOVERY = 100;
const ADVENTURE_HEALTH_POTION_RECOVERY = 100;
const PET_SYNC_INTERVAL_MS = 1000;

type PetElement = 'gold' | 'wood' | 'water' | 'fire' | 'earth';
type PetGender = 'male' | 'female';

interface AdventureOwnedPet {
  id: number;
  name?: string;
  nameKey?: string;
  element: PetElement[];
  gender: PetGender;
  level: number;
  exp: number;
  maxExp: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  attack: number;
  defense: number;
  image: string;
}

const VALID_ELEMENTS: PetElement[] = ['gold', 'wood', 'water', 'fire', 'earth'];

function normalizeElements(raw: unknown): PetElement[] {
  const list = Array.isArray(raw) ? raw : [raw];
  const normalized = list.filter(
    (value): value is PetElement => typeof value === 'string' && VALID_ELEMENTS.includes(value as PetElement),
  );
  return normalized.length > 0 ? normalized : ['water'];
}

function normalizeOwnedPet(rawPet: any, index: number): AdventureOwnedPet {
  const level = typeof rawPet?.level === 'number' && rawPet.level > 0 ? Math.floor(rawPet.level) : 1;
  const maxHp =
    typeof rawPet?.maxHp === 'number' && rawPet.maxHp > 0
      ? Math.floor(rawPet.maxHp)
      : typeof rawPet?.hp === 'number' && rawPet.hp > 0
        ? Math.floor(rawPet.hp)
        : 60;
  const maxMp =
    typeof rawPet?.maxMp === 'number' && rawPet.maxMp > 0
      ? Math.floor(rawPet.maxMp)
      : typeof rawPet?.mp === 'number' && rawPet.mp > 0
        ? Math.floor(rawPet.mp)
        : 40;
  const exp =
    typeof rawPet?.exp === 'number' && rawPet.exp >= 0
      ? Math.floor(rawPet.exp)
      : 0;
  const maxExp =
    typeof rawPet?.maxExp === 'number' && rawPet.maxExp > 0
      ? Math.floor(rawPet.maxExp)
      : Math.max(100, level * 100);

  return {
    id: typeof rawPet?.id === 'number' && Number.isFinite(rawPet.id) ? rawPet.id : index + 1,
    name: typeof rawPet?.name === 'string' ? rawPet.name : undefined,
    nameKey: typeof rawPet?.nameKey === 'string' ? rawPet.nameKey : undefined,
    element: normalizeElements(rawPet?.element),
    gender: rawPet?.gender === 'female' ? 'female' : 'male',
    level,
    exp: Math.min(exp, maxExp),
    maxExp,
    hp:
      typeof rawPet?.hp === 'number' && rawPet.hp >= 0
        ? Math.min(Math.floor(rawPet.hp), maxHp)
        : maxHp,
    maxHp,
    mp:
      typeof rawPet?.mp === 'number' && rawPet.mp >= 0
        ? Math.min(Math.floor(rawPet.mp), maxMp)
        : maxMp,
    maxMp,
    attack: typeof rawPet?.attack === 'number' && rawPet.attack > 0 ? Math.floor(rawPet.attack) : 20,
    defense: typeof rawPet?.defense === 'number' && rawPet.defense > 0 ? Math.floor(rawPet.defense) : 10,
    image: typeof rawPet?.image === 'string' ? rawPet.image : '🦞',
  };
}

function readAdventureOwnedPets(profileKey?: string): AdventureOwnedPet[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = localStorage.getItem(getScopedStorageKey('myPets', profileKey));
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((pet, index) => normalizeOwnedPet(pet, index));
  } catch {
    return [];
  }
}

function writeAdventureOwnedPets(pets: AdventureOwnedPet[], profileKey?: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(getScopedStorageKey('myPets', profileKey), JSON.stringify(pets));
}

function getAdventureCooldownKey(profileKey?: string): string {
  return getScopedStorageKey(ADVENTURE_COOLDOWN_KEY, profileKey);
}

function readAdventureCooldownUntil(profileKey?: string): number {
  if (typeof window === 'undefined') {
    return 0;
  }

  const raw = localStorage.getItem(getAdventureCooldownKey(profileKey));
  if (!raw) {
    return 0;
  }

  const until = Number.parseInt(raw, 10);
  if (Number.isNaN(until) || until <= Date.now()) {
    localStorage.removeItem(getAdventureCooldownKey(profileKey));
    return 0;
  }

  return until;
}

function writeAdventureCooldownUntil(until: number, profileKey?: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(getAdventureCooldownKey(profileKey), String(until));
}

function clearAdventureCooldown(profileKey?: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem(getAdventureCooldownKey(profileKey));
}

function formatDurationMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function toMiniMapPercent(value: number): number {
  const normalized = (value + ADVENTURE_MAP_BOUNDARY) / (ADVENTURE_MAP_BOUNDARY * 2);
  return Math.max(3, Math.min(97, normalized * 100));
}

function formatShortDate(timestamp: number): string {
  const date = new Date(timestamp);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${month}/${day} ${hour}:${minute}`;
}

function AdventureMiniMap({
  world,
  className,
}: {
  world: AdventureWorldState;
  className?: string;
}) {
  const checkpoint = getCheckpointPosition(world.run.checkpointZone);
  const aliveEnemies = world.enemies.filter((enemy) => enemy.isAlive).slice(0, 18);
  const gatherNodes = world.gatherNodes.filter((node) => !node.collected).slice(0, 18);
  const zoneRings = [33, 56, 82];

  return (
    <div className={`rounded-lg border border-slate-700 bg-slate-900/80 p-2 ${className ?? ''}`}>
      <div className="text-xs text-slate-400 mb-2">Mini Map</div>
      <div className="relative aspect-square w-full rounded-full border border-cyan-500/30 bg-slate-950 overflow-hidden">
        {zoneRings.map((size, index) => (
          <span
            key={`zone-ring-${size}`}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-500/20"
            style={{ width: `${size}%`, height: `${size}%`, opacity: index === 2 ? 0.35 : 0.25 }}
          />
        ))}

        <span
          className="absolute -translate-x-1/2 -translate-y-1/2 text-[10px] text-cyan-200"
          style={{ left: `${toMiniMapPercent(checkpoint.x)}%`, top: `${toMiniMapPercent(checkpoint.z)}%` }}
        >
          ◈
        </span>

        <span
          className="absolute -translate-x-1/2 -translate-y-1/2 text-xs"
          style={{ left: `${toMiniMapPercent(world.player.position.x)}%`, top: `${toMiniMapPercent(world.player.position.z)}%` }}
        >
          🦞
        </span>

        {aliveEnemies.map((enemy) => (
          <span
            key={`enemy-dot-${enemy.id}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-rose-400"
            style={{ left: `${toMiniMapPercent(enemy.position.x)}%`, top: `${toMiniMapPercent(enemy.position.z)}%` }}
          />
        ))}

        {gatherNodes.map((node) => (
          <span
            key={`node-dot-${node.id}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-violet-300"
            style={{ left: `${toMiniMapPercent(node.position.x)}%`, top: `${toMiniMapPercent(node.position.z)}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
        <span>🦞 Player</span>
        <span>◈ Checkpoint</span>
        <span>• Enemy</span>
      </div>
    </div>
  );
}

export default function Adventure3DPage() {
  const { t } = useTranslation();
  const { ready, isAuthenticated, username } = useAuth();

  const [world, setWorld] = useState<AdventureWorldState>(() => createInitialWorldState());
  const [profile, setProfile] = useState<AdventureProfile | null>(null);
  const [mythBalance, setMythBalance] = useState(0);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [rewardClaimed, setRewardClaimed] = useState(false);
  const [isGameMode, setIsGameMode] = useState(false);
  const [viewMode, setViewMode] = useState<CameraViewMode>('tps');
  const [globalLeaderboard, setGlobalLeaderboard] = useState<GlobalAdventureLeaderboardEntry[]>([]);
  const [onlinePlayers, setOnlinePlayers] = useState<AdventurePresenceEntry[]>([]);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownNow, setCooldownNow] = useState(Date.now());
  const [magicPotionCount, setMagicPotionCount] = useState(0);
  const [healthPotionCount, setHealthPotionCount] = useState(0);
  const [potionNotice, setPotionNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [ownedPets, setOwnedPets] = useState<AdventureOwnedPet[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<number | null>(null);

  const input = useAdventureInput(world.run.phase === 'running' && isAuthenticated && isGameMode);
  const lastTickRef = useRef<number>(0);
  const cameraYawRef = useRef(0.78);
  const enemyPulseRef = useRef<Map<string, { attack: number; hit: number; kind: EnemyKind }>>(new Map());
  const edgeWaveSfxNextAtRef = useRef(0);
  const lastFailureAtRef = useRef<number | null>(null);
  const lastPetSyncAtRef = useRef(0);

  const quality = profile?.settings.quality ?? 'high';
  const musicEnabled = profile?.settings.musicEnabled ?? true;
  const sfxEnabled = profile?.settings.sfxEnabled ?? true;
  const audioEnabled = musicEnabled && sfxEnabled;
  const selectedPet = useMemo(
    () => ownedPets.find((pet) => pet.id === selectedPetId) ?? null,
    [ownedPets, selectedPetId],
  );
  const cooldownRemainingMs = Math.max(0, cooldownUntil - cooldownNow);
  const isInCooldown = cooldownRemainingMs > 0;

  useEffect(() => {
    if (!username) {
      setProfile(null);
      setMythBalance(0);
      setMagicPotionCount(0);
      setHealthPotionCount(0);
      setOwnedPets([]);
      setSelectedPetId(null);
      setSummary(null);
      setRewardClaimed(false);
      setIsGameMode(false);
      setViewMode('tps');
      setGlobalLeaderboard([]);
      setOnlinePlayers([]);
      setCooldownUntil(0);
      cameraYawRef.current = 0.78;
      setWorld(createInitialWorldState());
      return;
    }

    setProfile(readAdventureProfile(username));
    setMythBalance(readMythBalance(username));
    setMagicPotionCount(readMagicPotionCount(username));
    setHealthPotionCount(readHealthPotionCount(username));
    const nextPets = readAdventureOwnedPets(username);
    setOwnedPets(nextPets);
    setSelectedPetId(nextPets[0]?.id ?? null);
    setWorld(createInitialWorldState());
    setSummary(null);
    setRewardClaimed(false);
    setIsGameMode(false);
    setViewMode('tps');
    setGlobalLeaderboard([]);
    setOnlinePlayers([]);
    setCooldownUntil(readAdventureCooldownUntil(username));
    setCooldownNow(Date.now());
    lastFailureAtRef.current = null;
    cameraYawRef.current = 0.78;
  }, [username]);

  useEffect(() => {
    if (!isGameMode) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Escape') {
        return;
      }
      setIsGameMode(false);
      setWorld((prev) => (prev.run.phase === 'running' ? pauseRun(prev) : prev));
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isGameMode]);

  useEffect(() => {
    if (world.run.phase !== 'running') {
      stopAdventureBgm();
      return;
    }

    if (musicEnabled) {
      startAdventureBgm();
    } else {
      stopAdventureBgm();
    }

    return () => stopAdventureBgm();
  }, [musicEnabled, world.run.phase]);

  useEffect(() => {
    if (world.run.phase !== 'running' || !musicEnabled) {
      stopAdventureWaterAmbience();
      return;
    }

    startAdventureWaterAmbience();
    return () => stopAdventureWaterAmbience();
  }, [musicEnabled, world.run.phase]);

  useEffect(() => {
    if (world.run.phase !== 'running') {
      return;
    }

    let rafId = 0;

    const tick = (timestamp: number) => {
      if (!lastTickRef.current) {
        lastTickRef.current = timestamp;
      }

      const deltaSec = Math.min(0.05, (timestamp - lastTickRef.current) / 1000);
      lastTickRef.current = timestamp;

      setWorld((prev) =>
        applyTick(prev, {
          deltaSec,
          now: Date.now(),
          input: input.movementRef.current,
          cameraYaw: cameraYawRef.current,
        }),
      );

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
      lastTickRef.current = 0;
    };
  }, [input.movementRef, world.run.phase]);

  useEffect(() => {
    if (input.jumpNonce === 0) {
      return;
    }
    setWorld((prev) => applyJump(prev));
  }, [input.jumpNonce]);

  useEffect(() => {
    if (input.attackNonce === 0) {
      return;
    }
    if (sfxEnabled) {
      playAdventureActionSfx('attack');
    }
    setWorld((prev) => applyAttack(prev, Date.now()));
  }, [input.attackNonce, sfxEnabled]);

  useEffect(() => {
    if (input.gatherNonce === 0) {
      return;
    }
    if (sfxEnabled) {
      playAdventureActionSfx('gather');
    }
    setWorld((prev) => applyGather(prev, Date.now()));
  }, [input.gatherNonce, sfxEnabled]);

  useEffect(() => {
    if (input.targetNonce === 0) {
      return;
    }
    setWorld((prev) => cycleTarget(prev));
  }, [input.targetNonce]);

  useEffect(() => {
    if (input.viewToggleNonce === 0) {
      return;
    }
    setViewMode((prev) => (prev === 'tps' ? 'fps' : 'tps'));
  }, [input.viewToggleNonce]);

  useEffect(() => {
    if (!potionNotice) {
      return;
    }

    const timer = window.setTimeout(() => setPotionNotice(null), 2500);
    return () => window.clearTimeout(timer);
  }, [potionNotice]);

  useEffect(() => {
    const previous = enemyPulseRef.current;
    const next = new Map<string, { attack: number; hit: number; kind: EnemyKind }>();

    world.enemies.forEach((enemy) => {
      const prevPulse = previous.get(enemy.id);
      if (sfxEnabled) {
        if (enemy.attackPulseMs > 0 && (!prevPulse || prevPulse.attack <= 0)) {
          playAdventureCreatureSfx(enemy.kind, 'attack');
        }
        if (enemy.hitPulseMs > 0 && (!prevPulse || prevPulse.hit <= 0)) {
          playAdventureCreatureSfx(enemy.kind, 'hit');
        }
      }
      next.set(enemy.id, {
        attack: enemy.attackPulseMs,
        hit: enemy.hitPulseMs,
        kind: enemy.kind,
      });
    });

    enemyPulseRef.current = next;
  }, [world.enemies, sfxEnabled]);

  useEffect(() => {
    if (!sfxEnabled || !isGameMode || world.run.phase !== 'running') {
      return;
    }

    const playerDistance = Math.hypot(world.player.position.x, world.player.position.z);
    const edgeRatio = playerDistance / ADVENTURE_MAP_BOUNDARY;
    if (edgeRatio < 0.86) {
      return;
    }

    const now = Date.now();
    if (now < edgeWaveSfxNextAtRef.current) {
      return;
    }

    const intensity = Math.max(0.4, Math.min(1.55, (edgeRatio - 0.83) * 3.2));
    playAdventureEdgeWaveSfx(intensity);
    const cooldownMs = edgeRatio > 0.97 ? 360 : edgeRatio > 0.92 ? 520 : 760;
    edgeWaveSfxNextAtRef.current = now + cooldownMs;
  }, [
    world.player.position.x,
    world.player.position.z,
    world.run.phase,
    sfxEnabled,
    isGameMode,
  ]);

  useEffect(() => {
    if (!isInCooldown) {
      return;
    }

    const timer = window.setInterval(() => {
      setCooldownNow(Date.now());
    }, COOLDOWN_TICK_MS);

    return () => window.clearInterval(timer);
  }, [isInCooldown]);

  useEffect(() => {
    if (!username || !cooldownUntil || isInCooldown) {
      return;
    }
    clearAdventureCooldown(username);
    setCooldownUntil(0);
  }, [cooldownUntil, isInCooldown, username]);

  useEffect(() => {
    if (world.run.phase !== 'failed' || !username) {
      return;
    }

    const failureAt = world.run.endedAt ?? Date.now();
    if (lastFailureAtRef.current === failureAt) {
      return;
    }
    lastFailureAtRef.current = failureAt;

    const until = Date.now() + BATTLE_COOLDOWN_MS;
    setCooldownUntil(until);
    setCooldownNow(Date.now());
    writeAdventureCooldownUntil(until, username);
  }, [world.run.phase, world.run.endedAt, username]);

  useEffect(() => {
    if (world.run.phase !== 'failed' && world.run.phase !== 'completed') {
      setSummary(null);
      setRewardClaimed(false);
      return;
    }

    setSummary(computeRunSummary(world, Date.now()));
  }, [world]);

  const playerHpRatio = useMemo(() => Math.max(0, world.player.hp / world.player.maxHp), [world.player.hp, world.player.maxHp]);
  const playerEnergyRatio = useMemo(() => Math.max(0, world.player.energy / world.player.maxEnergy), [world.player.energy, world.player.maxEnergy]);
  const expCurrent = selectedPet?.exp ?? 0;
  const expNext = selectedPet?.maxExp ?? 100;
  const expRatio = useMemo(() => Math.max(0, Math.min(1, expCurrent / Math.max(1, expNext))), [expCurrent, expNext]);

  const refreshGlobalLeaderboard = useCallback(async () => {
    const list = await getGlobalAdventureLeaderboard(12);
    setGlobalLeaderboard(list);
  }, []);

  useEffect(() => {
    if (!username) {
      setGlobalLeaderboard([]);
      return;
    }

    void refreshGlobalLeaderboard();
    const timer = window.setInterval(() => {
      void refreshGlobalLeaderboard();
    }, LEADERBOARD_REFRESH_MS);

    return () => window.clearInterval(timer);
  }, [username, refreshGlobalLeaderboard]);

  useEffect(() => {
    if (!username) {
      setOnlinePlayers([]);
      return;
    }

    let cancelled = false;

    const runPresenceHeartbeat = async () => {
      await heartbeatAdventurePresence(username, {
        zone: world.run.zone,
        phase: world.run.phase,
        level: selectedPet?.level ?? world.player.level,
        mythBalance,
      });

      const presenceList = await getAdventurePresenceList(18);
      if (!cancelled) {
        setOnlinePlayers(presenceList);
      }
    };

    void runPresenceHeartbeat();
    const timer = window.setInterval(() => {
      void runPresenceHeartbeat();
    }, ONLINE_HEARTBEAT_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [mythBalance, selectedPet?.level, username, world.player.level, world.run.phase, world.run.zone]);

  const localLeaderboard = useMemo<GlobalAdventureLeaderboardEntry[]>(() => {
    if (!profile) {
      return [];
    }

    return getAdventureLeaderboard(profile, 6).map((record) => ({
      ...record,
      username: username || '-',
    }));
  }, [profile, username]);

  const leaderboard = useMemo<GlobalAdventureLeaderboardEntry[]>(
    () => (globalLeaderboard.length > 0 ? globalLeaderboard : localLeaderboard),
    [globalLeaderboard, localLeaderboard],
  );

  const applySelectedPetToWorld = useCallback(
    (baseState: AdventureWorldState): AdventureWorldState => {
      if (!selectedPet) {
        return baseState;
      }

      return {
        ...baseState,
        player: {
          ...baseState.player,
          level: selectedPet.level,
          hp: Math.min(selectedPet.hp, selectedPet.maxHp),
          maxHp: selectedPet.maxHp,
          energy: Math.min(selectedPet.mp, selectedPet.maxMp),
          maxEnergy: selectedPet.maxMp,
          attack: selectedPet.attack,
          defense: selectedPet.defense,
        },
      };
    },
    [selectedPet],
  );

  useEffect(() => {
    if (!selectedPet) {
      return;
    }

    setWorld((prev) => {
      if (prev.run.phase !== 'idle') {
        return prev;
      }
      return applySelectedPetToWorld(prev);
    });
  }, [applySelectedPetToWorld, selectedPet]);

  useEffect(() => {
    if (!username || !selectedPetId || world.run.phase === 'idle') {
      return;
    }

    const now = Date.now();
    if (now - lastPetSyncAtRef.current < PET_SYNC_INTERVAL_MS) {
      return;
    }
    lastPetSyncAtRef.current = now;

    setOwnedPets((prev) => {
      const idx = prev.findIndex((pet) => pet.id === selectedPetId);
      if (idx < 0) {
        return prev;
      }

      const current = prev[idx];
      const nextHp = Math.max(0, Math.min(current.maxHp, Math.round(world.player.hp)));
      const nextMp = Math.max(0, Math.min(current.maxMp, Math.round(world.player.energy)));
      const nextLevel = Math.max(1, Math.round(world.player.level));
      const nextAttack = Math.max(1, Math.round(world.player.attack));
      const nextDefense = Math.max(1, Math.round(world.player.defense));
      const nextMaxHp = Math.max(1, Math.round(world.player.maxHp));
      const nextMaxMp = Math.max(1, Math.round(world.player.maxEnergy));

      const unchanged =
        current.hp === nextHp &&
        current.mp === nextMp &&
        current.level === nextLevel &&
        current.attack === nextAttack &&
        current.defense === nextDefense &&
        current.maxHp === nextMaxHp &&
        current.maxMp === nextMaxMp;

      if (unchanged) {
        return prev;
      }

      const updatedPet: AdventureOwnedPet = {
        ...current,
        hp: nextHp,
        mp: nextMp,
        level: nextLevel,
        attack: nextAttack,
        defense: nextDefense,
        maxHp: nextMaxHp,
        maxMp: nextMaxMp,
      };

      const nextPets = [...prev];
      nextPets[idx] = updatedPet;
      writeAdventureOwnedPets(nextPets, username);
      return nextPets;
    });
  }, [
    selectedPetId,
    username,
    world.player.attack,
    world.player.defense,
    world.player.energy,
    world.player.hp,
    world.player.level,
    world.player.maxEnergy,
    world.player.maxHp,
    world.run.phase,
  ]);

  const handleRunStart = () => {
    if (!selectedPet) {
      setWorld((prev) => ({
        ...prev,
        message: t('adventure3d.selectPetFirst'),
      }));
      return;
    }
    if (isInCooldown) {
      setWorld((prev) => ({
        ...prev,
        message: t('adventure3d.cooldownLocked', { time: formatCooldownTimer(cooldownRemainingMs) }),
      }));
      return;
    }
    setSummary(null);
    setRewardClaimed(false);
    setIsGameMode(true);
    setWorld(applySelectedPetToWorld(startRun(Date.now())));
  };

  const handleEngageGameMode = () => {
    if (!selectedPet) {
      setWorld((prev) => ({
        ...prev,
        message: t('adventure3d.selectPetFirst'),
      }));
      return;
    }
    if (isInCooldown) {
      setWorld((prev) => ({
        ...prev,
        message: t('adventure3d.cooldownLocked', { time: formatCooldownTimer(cooldownRemainingMs) }),
      }));
      return;
    }
    setIsGameMode(true);
    setSummary(null);
    setRewardClaimed(false);
    setWorld((prev) => {
      if (prev.run.phase === 'running') {
        return prev;
      }
      if (prev.run.phase === 'paused') {
        return resumeRun(prev);
      }
      return applySelectedPetToWorld(startRun(Date.now()));
    });
  };

  const handleRunPauseToggle = () => {
    setWorld((prev) => {
      if (prev.run.phase === 'running') {
        return pauseRun(prev);
      }
      if (prev.run.phase === 'paused') {
        return resumeRun(prev);
      }
      return prev;
    });
  };

  const handlePrimaryFire = () => {
    if (sfxEnabled) {
      playAdventureActionSfx('attack');
    }
    setWorld((prev) => applyAttack(prev, Date.now()));
  };

  const handleCameraYawChange = useCallback((yaw: number) => {
    cameraYawRef.current = yaw;
  }, []);

  const handleViewModeToggle = () => {
    setViewMode((prev) => (prev === 'tps' ? 'fps' : 'tps'));
  };

  const handleClaimResult = () => {
    if (!username || !summary || rewardClaimed) {
      return;
    }

    const rewardResult = grantMyth(summary.mythReward, 'system', username);
    setMythBalance(rewardResult.balance);

    const playedAt = Date.now();
    const nextProfile = recordAdventureRun(summary, username, playedAt);
    setProfile(nextProfile);
    void syncAdventureBestRun(summary, username, playedAt).then(() => refreshGlobalLeaderboard());

    setRewardClaimed(true);
    if (sfxEnabled) {
      playAdventureActionSfx(summary.completed ? 'victory' : 'defeat');
    }
  };

  const handleUseMagicPotion = () => {
    if (!username) {
      return;
    }
    if (magicPotionCount <= 0) {
      setPotionNotice({ type: 'error', text: t('adventure3d.noMagicPotion') });
      return;
    }
    if (world.player.energy >= world.player.maxEnergy) {
      setPotionNotice({ type: 'error', text: t('adventure3d.magicFull') });
      return;
    }

    const left = consumeMagicPotion(1, username);
    setMagicPotionCount(left);
    setWorld((prev) => ({
      ...prev,
      player: {
        ...prev.player,
        energy: Math.min(prev.player.maxEnergy, prev.player.energy + ADVENTURE_MAGIC_POTION_RECOVERY),
      },
    }));
    setPotionNotice({
      type: 'success',
      text: t('adventure3d.useMagicPotionSuccess', {
        recover: ADVENTURE_MAGIC_POTION_RECOVERY,
        left,
      }),
    });
  };

  const handleUseHealthPotion = () => {
    if (!username) {
      return;
    }
    if (healthPotionCount <= 0) {
      setPotionNotice({ type: 'error', text: t('adventure3d.noHealthPotion') });
      return;
    }
    if (world.player.hp >= world.player.maxHp) {
      setPotionNotice({ type: 'error', text: t('adventure3d.healthFull') });
      return;
    }

    const left = consumeHealthPotion(1, username);
    setHealthPotionCount(left);
    setWorld((prev) => ({
      ...prev,
      player: {
        ...prev.player,
        hp: Math.min(prev.player.maxHp, prev.player.hp + ADVENTURE_HEALTH_POTION_RECOVERY),
      },
    }));
    setPotionNotice({
      type: 'success',
      text: t('adventure3d.useHealthPotionSuccess', {
        recover: ADVENTURE_HEALTH_POTION_RECOVERY,
        left,
      }),
    });
  };

  const handleQualityToggle = () => {
    if (!username || !profile) {
      return;
    }
    const next = updateAdventureSettings(
      {
        quality: profile.settings.quality === 'high' ? 'low' : 'high',
      },
      username,
    );
    setProfile(next);
  };

  const handleAudioToggle = () => {
    if (!username || !profile) {
      return;
    }
    const nextEnabled = !audioEnabled;
    const next = updateAdventureSettings(
      {
        musicEnabled: nextEnabled,
        sfxEnabled: nextEnabled,
      },
      username,
    );
    setProfile(next);
  };

  if (!ready) {
    return <div className="min-h-screen bg-slate-950" />;
  }

  if (!isAuthenticated) {
    return <RequireAuth title={t('adventure3d.authRequired')} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between px-6 py-4 bg-slate-900/80 border-b border-cyan-500/30">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-slate-300 hover:text-white">
            ← {t('common.backHome')}
          </Link>
          <span className="text-cyan-300">🦞</span>
          <h1 className="text-xl md:text-2xl font-semibold text-cyan-200">{t('adventure3d.title')}</h1>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <AuthStatus />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-4">
        <section className="grid lg:grid-cols-[2fr,1fr] gap-4">
          <div className="relative">
            <AdventureScene
              player={world.player}
              enemies={world.enemies}
              enemyProjectionMarks={world.enemyProjectionMarks}
              gatherNodes={world.gatherNodes}
              projectiles={world.projectiles}
              activeTargetId={world.targetEnemyId}
              zone={world.run.zone}
              checkpointZone={world.run.checkpointZone}
              quality={quality}
              cameraSensitivity={profile?.settings.sensitivity ?? 1}
              gameMode={isGameMode}
              viewMode={viewMode}
              engageHint={t('adventure3d.clickToEngage')}
              onEngageGameMode={handleEngageGameMode}
              onPrimaryFire={handlePrimaryFire}
              onCameraYawChange={handleCameraYawChange}
            />
            <div className="pointer-events-none absolute left-3 top-3 z-20 w-56">
              <div className="rounded-lg border border-cyan-500/35 bg-slate-900/82 px-3 py-2 shadow-[0_0_22px_rgba(8,145,178,0.2)]">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="text-slate-400">{t('adventure3d.roleName')}</span>
                  <span className="font-semibold text-cyan-100">
                    {selectedPet ? localizePetName(selectedPet.name || selectedPet.nameKey, t) : username ?? '-'} · Lv.
                    {world.player.level}
                  </span>
                </div>

                <div className="mb-2 flex items-center justify-between text-[11px]">
                  <span className="text-slate-300">{t('adventure3d.balance')}</span>
                  <span className="font-semibold text-emerald-300">{mythBalance} $MYTH</span>
                </div>

                <div className="mb-2">
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-slate-300">{t('adventure3d.hp')}</span>
                    <span className="text-slate-400">
                      {world.player.hp}/{world.player.maxHp}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-rose-500" style={{ width: `${playerHpRatio * 100}%` }} />
                  </div>
                </div>

                <div className="mb-2">
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-slate-300">{t('battle.mp')}</span>
                    <span className="text-slate-400">
                      {Math.round(world.player.energy)}/{world.player.maxEnergy}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-cyan-400" style={{ width: `${playerEnergyRatio * 100}%` }} />
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-slate-300">{t('adventure3d.exp')}</span>
                    <span className="text-slate-400">
                      {expCurrent}/{expNext}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-amber-400" style={{ width: `${expRatio * 100}%` }} />
                  </div>
                </div>
              </div>
            </div>
            <div className="pointer-events-none absolute right-3 top-3 z-20 w-36 sm:w-40 md:w-44">
              <AdventureMiniMap world={world} />
            </div>
            <div className="absolute left-3 bottom-3 z-20 w-60 sm:w-64">
              <div className="rounded-lg border border-slate-700 bg-slate-900/88 p-2.5 shadow-[0_0_18px_rgba(15,23,42,0.45)]">
                <p className="mb-2 text-[11px] text-slate-300">{t('adventure3d.potionBarTitle')}</p>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleUseMagicPotion}
                    disabled={magicPotionCount <= 0 || world.player.energy >= world.player.maxEnergy}
                    className="flex w-full items-center justify-between rounded-md bg-cyan-600/90 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span>🧪 {t('adventure3d.magicPotionLabel', { count: magicPotionCount })}</span>
                    <span>+{ADVENTURE_MAGIC_POTION_RECOVERY}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleUseHealthPotion}
                    disabled={healthPotionCount <= 0 || world.player.hp >= world.player.maxHp}
                    className="flex w-full items-center justify-between rounded-md bg-rose-600/90 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span>❤️ {t('adventure3d.healthPotionLabel', { count: healthPotionCount })}</span>
                    <span>+{ADVENTURE_HEALTH_POTION_RECOVERY}</span>
                  </button>
                </div>
                {potionNotice && (
                  <p
                    className={`mt-2 text-[11px] ${
                      potionNotice.type === 'success' ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {potionNotice.text}
                  </p>
                )}
              </div>
            </div>
          </div>

          <aside className="rounded-2xl border border-cyan-500/30 bg-slate-900/70 p-4 space-y-4">
            <div className="rounded-lg border border-slate-700 bg-slate-800/65 p-3">
              <p className="mb-2 text-sm text-cyan-200">{t('adventure3d.petSelectorTitle')}</p>
              {ownedPets.length === 0 ? (
                <p className="text-xs text-slate-400">{t('adventure3d.petSelectorEmpty')}</p>
              ) : (
                <div className="space-y-2">
                  <select
                    value={selectedPetId ?? ''}
                    onChange={(event) => {
                      const value = Number.parseInt(event.target.value, 10);
                      setSelectedPetId(Number.isNaN(value) ? null : value);
                    }}
                    className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
                  >
                    {ownedPets.map((pet) => (
                      <option key={`adventure-pet-${pet.id}`} value={pet.id}>
                        {localizePetName(pet.name || pet.nameKey, t)} · Lv.{pet.level}
                      </option>
                    ))}
                  </select>
                  {selectedPet && (
                    <p className="text-xs text-slate-400">
                      HP {selectedPet.hp}/{selectedPet.maxHp} · MP {selectedPet.mp}/{selectedPet.maxMp}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-slate-800/80 p-2">
                <p className="text-slate-400">{t('adventure3d.zone')}</p>
                <p className="font-semibold">{world.run.zone}</p>
              </div>
              <div className="rounded-lg bg-slate-800/80 p-2">
                <p className="text-slate-400">{t('adventure3d.kills')}</p>
                <p className="font-semibold">{world.run.kills}</p>
              </div>
              <div className="rounded-lg bg-slate-800/80 p-2">
                <p className="text-slate-400">{t('adventure3d.score')}</p>
                <p className="font-semibold">{world.run.score}</p>
              </div>
              <div className="rounded-lg bg-slate-800/80 p-2">
                <p className="text-slate-400">{t('adventure3d.phase')}</p>
                <p className="font-semibold">{t(`adventure3d.phaseMap.${world.run.phase}`)}</p>
              </div>
            </div>

            {isInCooldown && (
              <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {t('adventure3d.cooldownLocked', { time: formatCooldownTimer(cooldownRemainingMs) })}
              </p>
            )}

            <div className="rounded-lg border border-slate-700 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm text-cyan-200">{t('adventure3d.gatherAreaTitle')}</p>
                <span className="text-xs text-slate-400">{onlinePlayers.length}</span>
              </div>
              {onlinePlayers.length === 0 ? (
                <p className="text-xs text-slate-500">{t('adventure3d.gatherAreaEmpty')}</p>
              ) : (
                <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                  {onlinePlayers.map((player) => (
                    <div
                      key={`online-${player.username}`}
                      className={`flex items-center justify-between rounded px-2 py-1 text-xs ${
                        player.username === username ? 'bg-cyan-500/15 text-cyan-100' : 'bg-slate-800/70 text-slate-300'
                      }`}
                    >
                      <span className="truncate pr-2">
                        {player.username}
                        {player.username === username ? ` ${t('adventure3d.you')}` : ''}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Z{player.zone} · Lv.{player.level}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleRunStart}
                disabled={isInCooldown || !selectedPet}
                className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold"
              >
                {t('adventure3d.start')}
              </button>
              <button
                type="button"
                onClick={handleRunPauseToggle}
                className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold"
                disabled={world.run.phase !== 'running' && world.run.phase !== 'paused'}
              >
                {world.run.phase === 'running' ? t('adventure3d.pause') : t('adventure3d.resume')}
              </button>
              <button
                type="button"
                onClick={handlePrimaryFire}
                className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-sm font-semibold"
              >
                {t('adventure3d.attack')}
              </button>
              <button
                type="button"
                onClick={() => setWorld((prev) => applyGather(prev, Date.now()))}
                className="px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-sm font-semibold"
              >
                {t('adventure3d.gather')}
              </button>
              <button
                type="button"
                onClick={() => setWorld((prev) => cycleTarget(prev))}
                className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-sm font-semibold"
              >
                {t('adventure3d.switchTarget')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSummary(null);
                  setRewardClaimed(false);
                  setIsGameMode(false);
                  setWorld(applySelectedPetToWorld(resetRun()));
                }}
                className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm font-semibold"
              >
                {t('adventure3d.reset')}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <button type="button" onClick={handleQualityToggle} className="px-2 py-2 rounded bg-slate-800 hover:bg-slate-700">
                {quality === 'high' ? t('adventure3d.qualityHigh') : t('adventure3d.qualityLow')}
              </button>
              <button type="button" onClick={handleAudioToggle} className="px-2 py-2 rounded bg-slate-800 hover:bg-slate-700">
                {audioEnabled ? t('adventure3d.audioOn') : t('adventure3d.audioOff')}
              </button>
              <button type="button" onClick={handleViewModeToggle} className="px-2 py-2 rounded bg-slate-800 hover:bg-slate-700">
                {viewMode === 'tps' ? t('adventure3d.viewSwitchToFirst') : t('adventure3d.viewSwitchToThird')}
              </button>
            </div>

            {world.message && (
              <p className="text-xs text-cyan-200 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2">
                {world.message}
              </p>
            )}
          </aside>
        </section>

        <section className="rounded-xl border border-slate-700/70 bg-slate-900/55 px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-cyan-200">{t('adventure3d.leaderboardTitle')}</h2>
            <span className="text-xs text-slate-500">{t('adventure3d.leaderboardHint')}</span>
          </div>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-slate-400">{t('adventure3d.leaderboardEmpty')}</p>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((record, index) => (
                <div
                  key={`${record.username}-${record.id}`}
                  className="grid grid-cols-[28px,88px,1fr,70px,70px] sm:grid-cols-[28px,110px,1fr,80px,90px,95px] items-center gap-2 rounded-lg bg-slate-900/70 px-3 py-2 text-xs"
                >
                  <span className="font-semibold text-amber-300">#{index + 1}</span>
                  <span className="truncate text-cyan-200">{record.username}</span>
                  <span className="text-slate-300">
                    {t('adventure3d.zone')} {record.zone} · {t('adventure3d.kills')} {record.kills}
                  </span>
                  <span className="text-slate-200">{formatDurationMs(record.durationMs)}</span>
                  <span className="font-semibold text-cyan-200">{record.score}</span>
                  <span className="hidden sm:block text-slate-400">{formatShortDate(record.playedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {summary && (
          <section className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-5 space-y-3">
            <h2 className="text-xl font-semibold text-emerald-300">
              {summary.completed ? t('adventure3d.resultWin') : t('adventure3d.resultFail')}
            </h2>
            <div className="grid sm:grid-cols-4 gap-2 text-sm">
              <div className="rounded bg-slate-900/70 px-3 py-2">
                <p className="text-slate-400">{t('adventure3d.score')}</p>
                <p className="font-semibold">{summary.score}</p>
              </div>
              <div className="rounded bg-slate-900/70 px-3 py-2">
                <p className="text-slate-400">{t('adventure3d.kills')}</p>
                <p className="font-semibold">{summary.kills}</p>
              </div>
              <div className="rounded bg-slate-900/70 px-3 py-2">
                <p className="text-slate-400">{t('adventure3d.zone')}</p>
                <p className="font-semibold">{summary.zone}</p>
              </div>
              <div className="rounded bg-slate-900/70 px-3 py-2">
                <p className="text-slate-400">{t('adventure3d.duration')}</p>
                <p className="font-semibold">{formatDurationMs(summary.durationMs)}</p>
              </div>
            </div>
            <p className="text-emerald-200 font-medium">
              {t('adventure3d.estimateReward', { amount: summary.mythReward })}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClaimResult}
                disabled={rewardClaimed}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-semibold"
              >
                {rewardClaimed ? t('adventure3d.claimed') : t('adventure3d.claimReward')}
              </button>
              <button
                type="button"
                onClick={handleRunStart}
                disabled={isInCooldown || !selectedPet}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
              >
                {t('adventure3d.restart')}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
