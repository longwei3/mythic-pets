'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import AuthStatus from '@/components/AuthStatus';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import RequireAuth from '@/components/RequireAuth';
import { useAuth } from '@/components/AuthProvider';
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
  AdventureRunRecord,
  AdventureWorldState,
  CameraViewMode,
  EnemyKind,
  RunSummary,
} from '@/features/adventure3d/core/types';
import AdventureScene from '@/features/adventure3d/scene/AdventureScene';
import {
  getAdventureLeaderboard,
  readAdventureProfile,
  recordAdventureRun,
  updateAdventureSettings,
} from '@/features/adventure3d/save/profileSave';
import { useAdventureInput } from '@/features/adventure3d/systems/inputSystem';
import { ADVENTURE_MAP_BOUNDARY, DEFAULT_PLAYER_STATE } from '@/features/adventure3d/config/gameBalance';
import { grantMyth, readMythBalance } from '@/lib/economy';
import { computeExpProgressFromTotalExp, scaleBaseStatByLevel } from '@/lib/petProgression';
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

  const input = useAdventureInput(world.run.phase === 'running' && isAuthenticated && isGameMode);
  const lastTickRef = useRef<number>(0);
  const cameraYawRef = useRef(0.78);
  const enemyPulseRef = useRef<Map<string, { attack: number; hit: number; kind: EnemyKind }>>(new Map());
  const edgeWaveSfxNextAtRef = useRef(0);

  const quality = profile?.settings.quality ?? 'high';
  const musicEnabled = profile?.settings.musicEnabled ?? true;
  const sfxEnabled = profile?.settings.sfxEnabled ?? true;

  useEffect(() => {
    if (!username) {
      setProfile(null);
      setMythBalance(0);
      setSummary(null);
      setRewardClaimed(false);
      setIsGameMode(false);
      setViewMode('tps');
      cameraYawRef.current = 0.78;
      setWorld(createInitialWorldState());
      return;
    }

    setProfile(readAdventureProfile(username));
    setMythBalance(readMythBalance(username));
    setWorld(createInitialWorldState());
    setSummary(null);
    setRewardClaimed(false);
    setIsGameMode(false);
    setViewMode('tps');
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
    if (world.run.phase !== 'failed' && world.run.phase !== 'completed') {
      setSummary(null);
      setRewardClaimed(false);
      return;
    }

    setSummary(computeRunSummary(world, Date.now()));
  }, [world]);

  const playerHpRatio = useMemo(() => Math.max(0, world.player.hp / world.player.maxHp), [world.player.hp, world.player.maxHp]);
  const playerEnergyRatio = useMemo(() => Math.max(0, world.player.energy / world.player.maxEnergy), [world.player.energy, world.player.maxEnergy]);
  const adventureExpTotal = useMemo(
    () =>
      world.run.kills * 28 +
      world.loot.shell * 6 +
      world.loot.essence * 10 +
      world.loot.relic * 18 +
      world.loot.myth * 4 +
      Math.round(world.run.score * 0.2),
    [world.run.kills, world.loot.shell, world.loot.essence, world.loot.relic, world.loot.myth, world.run.score],
  );
  const expProgress = useMemo(() => computeExpProgressFromTotalExp(adventureExpTotal), [adventureExpTotal]);
  const expRatio = useMemo(() => Math.max(0, Math.min(1, expProgress.current / expProgress.next)), [expProgress.current, expProgress.next]);
  const scaledMaxHp = useMemo(
    () => scaleBaseStatByLevel(DEFAULT_PLAYER_STATE.maxHp, expProgress.level),
    [expProgress.level],
  );
  const scaledMaxEnergy = useMemo(
    () => scaleBaseStatByLevel(DEFAULT_PLAYER_STATE.maxEnergy, expProgress.level),
    [expProgress.level],
  );

  useEffect(() => {
    setWorld((prev) => {
      const hpNeedsSync = prev.player.maxHp !== scaledMaxHp;
      const energyNeedsSync = prev.player.maxEnergy !== scaledMaxEnergy;
      const levelNeedsSync = prev.player.level !== expProgress.level;

      if (!hpNeedsSync && !energyNeedsSync && !levelNeedsSync) {
        return prev;
      }

      const hpRatio = prev.player.maxHp > 0 ? prev.player.hp / prev.player.maxHp : 1;
      const energyRatio = prev.player.maxEnergy > 0 ? prev.player.energy / prev.player.maxEnergy : 1;
      const syncedHp = Math.max(1, Math.min(scaledMaxHp, Math.round(scaledMaxHp * hpRatio)));
      const syncedEnergy = Math.max(0, Math.min(scaledMaxEnergy, Math.round(scaledMaxEnergy * energyRatio)));

      return {
        ...prev,
        player: {
          ...prev.player,
          level: expProgress.level,
          maxHp: scaledMaxHp,
          hp: syncedHp,
          maxEnergy: scaledMaxEnergy,
          energy: syncedEnergy,
        },
      };
    });
  }, [expProgress.level, scaledMaxEnergy, scaledMaxHp]);

  const leaderboard: AdventureRunRecord[] = useMemo(() => {
    if (!profile) {
      return [];
    }
    return getAdventureLeaderboard(profile, 6);
  }, [profile]);

  const handleRunStart = () => {
    setSummary(null);
    setRewardClaimed(false);
    setIsGameMode(true);
    setWorld(startRun(Date.now()));
  };

  const handleEngageGameMode = () => {
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
      return startRun(Date.now());
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

    const nextProfile = recordAdventureRun(summary, username);
    setProfile(nextProfile);

    setRewardClaimed(true);
    if (sfxEnabled) {
      playAdventureActionSfx(summary.completed ? 'victory' : 'defeat');
    }
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

  const handleMusicToggle = () => {
    if (!username || !profile) {
      return;
    }
    const next = updateAdventureSettings(
      {
        musicEnabled: !profile.settings.musicEnabled,
      },
      username,
    );
    setProfile(next);
  };

  const handleSfxToggle = () => {
    if (!username || !profile) {
      return;
    }
    const next = updateAdventureSettings(
      {
        sfxEnabled: !profile.settings.sfxEnabled,
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
                    {username ?? '-'} · Lv.{expProgress.level}
                  </span>
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
                    <span className="text-slate-300">{t('adventure3d.energy')}</span>
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
                      {expProgress.current}/{expProgress.next}
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
          </div>

          <aside className="rounded-2xl border border-cyan-500/30 bg-slate-900/70 p-4 space-y-4">
            <div>
              <p className="text-xs text-slate-400">{t('adventure3d.balance')}</p>
              <p className="text-xl font-bold text-emerald-300">{mythBalance} $MYTH</p>
              <p className="mt-1 text-xs text-cyan-300">
                {isGameMode ? t('adventure3d.gameModeOn') : t('adventure3d.gameModeOff')}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {viewMode === 'tps' ? t('adventure3d.viewThird') : t('adventure3d.viewFirst')}
              </p>
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

            <div className="rounded-lg border border-slate-700 p-3 text-sm">
              <p className="text-slate-300 mb-1">{t('adventure3d.loot')}</p>
              <p className="text-slate-400">MYTH +{world.loot.myth}</p>
              <p className="text-slate-400">Shell x{world.loot.shell}</p>
              <p className="text-slate-400">Essence x{world.loot.essence}</p>
              <p className="text-slate-400">Relic x{world.loot.relic}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleRunStart}
                className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold"
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
                  setWorld(resetRun());
                }}
                className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm font-semibold"
              >
                {t('adventure3d.reset')}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <button type="button" onClick={handleQualityToggle} className="px-2 py-2 rounded bg-slate-800 hover:bg-slate-700">
                {quality === 'high' ? t('adventure3d.qualityHigh') : t('adventure3d.qualityLow')}
              </button>
              <button type="button" onClick={handleMusicToggle} className="px-2 py-2 rounded bg-slate-800 hover:bg-slate-700">
                {musicEnabled ? t('adventure3d.musicOn') : t('adventure3d.musicOff')}
              </button>
              <button type="button" onClick={handleSfxToggle} className="px-2 py-2 rounded bg-slate-800 hover:bg-slate-700">
                {sfxEnabled ? t('adventure3d.sfxOn') : t('adventure3d.sfxOff')}
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

        <section className="rounded-xl border border-slate-700/70 bg-slate-900/55 px-4 py-3 text-sm text-slate-300">
          <p>{t('adventure3d.controls')}</p>
          <p className="text-xs text-slate-400 mt-1">{t('adventure3d.controlsHint')}</p>
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
                <div key={record.id} className="grid grid-cols-[28px,1fr,80px,90px,95px] items-center gap-2 rounded-lg bg-slate-900/70 px-3 py-2 text-xs">
                  <span className="font-semibold text-amber-300">#{index + 1}</span>
                  <span className="text-slate-300">
                    {t('adventure3d.zone')} {record.zone} · {t('adventure3d.kills')} {record.kills}
                  </span>
                  <span className="text-slate-200">{formatDurationMs(record.durationMs)}</span>
                  <span className="font-semibold text-cyan-200">{record.score}</span>
                  <span className="text-slate-400">{formatShortDate(record.playedAt)}</span>
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
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-semibold"
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
