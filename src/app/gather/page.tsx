'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import AuthStatus from '@/components/AuthStatus';
import RequireAuth from '@/components/RequireAuth';
import GlobalMythChip from '@/components/GlobalMythChip';
import { useAuth } from '@/components/AuthProvider';
import { getScopedStorageKey } from '@/lib/auth';
import { localizePetName } from '@/lib/petNames';
import { formatCooldownTimer } from '@/lib/battleCooldown';
import {
  GATHER_DURATION_MS,
  addHealthPotion,
  addMagicPotion,
  clearGatherTask,
  readGatherTask,
  readHealthPotionCount,
  readMagicPotionCount,
  writeGatherTask,
  type GatherTask,
} from '@/lib/magicPotions';
import { grantMyth, readMythBalance } from '@/lib/economy';
import {
  playGatherReadySound,
  playGatherStartSound,
  startGatherAmbience,
  stopGatherAmbience,
} from '@/lib/sounds';
import {
  applyExpGain,
  applyStatGrowthByLevels,
  getExpThresholdForLevel,
  resolveExpProgress,
  scaleBaseStatByLevel,
} from '@/lib/petProgression';

type Element = 'gold' | 'wood' | 'water' | 'fire' | 'earth';
type Gender = 'male' | 'female';

interface Pet {
  id: number;
  name: string;
  element: Element[];
  gender: Gender;
  level: number;
  exp?: number;
  maxExp?: number;
  attack: number;
  defense: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  generation?: number;
}

const VALID_ELEMENTS: Element[] = ['gold', 'wood', 'water', 'fire', 'earth'];

const elementIcons: Record<Element, string> = {
  gold: '🪙',
  wood: '🪵',
  water: '💧',
  fire: '🔥',
  earth: '🪨',
};

const GATHER_BASE_EXP_REWARD = 20;
const GATHER_BASE_MYTH_REWARD = 20;
const GATHER_LEVEL_BONUS_PER_LEVEL = 0.1;
const GATHER_LEVELUP_ATTACK_GAIN = 2;
const GATHER_LEVELUP_DEFENSE_GAIN = 2;

export default function GatherPage() {
  const { t } = useTranslation();
  const { ready, isAuthenticated, username } = useAuth();
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<number | null>(null);
  const [task, setTask] = useState<GatherTask | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [magicPotionCount, setMagicPotionCount] = useState(0);
  const [healthPotionCount, setHealthPotionCount] = useState(0);
  const [mythBalance, setMythBalance] = useState(0);
  const [claimNotice, setClaimNotice] = useState<string | null>(null);
  const [readySoundPlayed, setReadySoundPlayed] = useState(false);

  const normalizeElements = (element: Element[] | Element | undefined): Element[] => {
    const source = Array.isArray(element) ? element : [element];
    const normalized = source.filter(
      (value): value is Element => typeof value === 'string' && VALID_ELEMENTS.includes(value as Element),
    );
    return normalized.length > 0 ? normalized : ['water'];
  };

  const normalizeStoredPet = (pet: any): Pet => {
    const expProgress = resolveExpProgress(
      typeof pet.level === 'number' && pet.level > 0 ? pet.level : 1,
      typeof pet.exp === 'number' ? pet.exp : 0,
    );
    const maxHp =
      typeof pet.maxHp === 'number' && pet.maxHp > 0
        ? pet.maxHp
        : typeof pet.hp === 'number' && pet.hp > 0
          ? pet.hp
          : scaleBaseStatByLevel(50, expProgress.level);
    const maxMp =
      typeof pet.maxMp === 'number' && pet.maxMp > 0
        ? pet.maxMp
        : typeof pet.mp === 'number' && pet.mp > 0
          ? pet.mp
          : scaleBaseStatByLevel(35, expProgress.level);

    return {
      ...pet,
      element: normalizeElements(pet.element),
      level: expProgress.level,
      exp: expProgress.current,
      maxExp: getExpThresholdForLevel(expProgress.level),
      attack: typeof pet.attack === 'number' && pet.attack > 0 ? pet.attack : 15,
      defense: typeof pet.defense === 'number' && pet.defense > 0 ? pet.defense : 10,
      hp: typeof pet.hp === 'number' && pet.hp > 0 ? Math.min(pet.hp, maxHp) : maxHp,
      maxHp,
      mp: typeof pet.mp === 'number' && pet.mp >= 0 ? Math.min(pet.mp, maxMp) : maxMp,
      maxMp,
    } as Pet;
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !username) {
      return;
    }

    try {
      const rawPets = localStorage.getItem(getScopedStorageKey('myPets', username || undefined));
      if (rawPets) {
        const parsed = JSON.parse(rawPets);
        if (Array.isArray(parsed)) {
          const normalizedPets = parsed.map((pet: any) => normalizeStoredPet(pet));
          setPets(normalizedPets);
          if (!selectedPetId && normalizedPets.length > 0) {
            setSelectedPetId(normalizedPets[0].id);
          }
        }
      }
    } catch {
      // Ignore invalid local data.
    }

    setMagicPotionCount(readMagicPotionCount(username));
    setHealthPotionCount(readHealthPotionCount(username));
    setMythBalance(readMythBalance(username));
    setTask(readGatherTask(username));
  }, [isAuthenticated, selectedPetId, username]);

  const selectedPet = useMemo(
    () => pets.find((pet) => pet.id === selectedPetId) || null,
    [pets, selectedPetId],
  );
  const activeTaskPet = useMemo(
    () => (task ? pets.find((pet) => pet.id === task.petId) || null : null),
    [pets, task],
  );

  const remainingMs = task ? Math.max(0, task.endsAt - nowMs) : 0;
  const isTaskReady = Boolean(task && remainingMs <= 0);

  useEffect(() => {
    if (task && !isTaskReady) {
      startGatherAmbience();
      setReadySoundPlayed(false);
    } else {
      if (task && isTaskReady && !readySoundPlayed) {
        playGatherReadySound();
        setReadySoundPlayed(true);
      }
      stopGatherAmbience();
    }

    return () => {
      stopGatherAmbience();
    };
  }, [isTaskReady, readySoundPlayed, task]);

  useEffect(() => {
    if (!claimNotice) {
      return;
    }
    const timer = setTimeout(() => setClaimNotice(null), 3200);
    return () => clearTimeout(timer);
  }, [claimNotice]);

  const applyGatherRewardsToPet = (petId: number, expGain: number) => {
    if (!username) {
      return;
    }
    const key = getScopedStorageKey('myPets', username);
    const raw = localStorage.getItem(key);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return;
      }

      const nextPets = parsed.map((pet: any) => {
        if (Number(pet?.id) !== petId) {
          return pet;
        }

        const level = typeof pet.level === 'number' && pet.level > 0 ? pet.level : 1;
        const currentExp = typeof pet.exp === 'number' && pet.exp >= 0 ? pet.exp : 0;
        const gained = applyExpGain(level, currentExp, expGain);

        let nextAttack = typeof pet.attack === 'number' && pet.attack > 0 ? pet.attack : 15;
        let nextDefense = typeof pet.defense === 'number' && pet.defense > 0 ? pet.defense : 10;
        let nextMaxHp =
          typeof pet.maxHp === 'number' && pet.maxHp > 0
            ? pet.maxHp
            : typeof pet.hp === 'number' && pet.hp > 0
              ? pet.hp
              : scaleBaseStatByLevel(50, gained.level);
        let nextMaxMp =
          typeof pet.maxMp === 'number' && pet.maxMp > 0
            ? pet.maxMp
            : typeof pet.mp === 'number' && pet.mp > 0
              ? pet.mp
              : scaleBaseStatByLevel(35, gained.level);
        let nextHp = typeof pet.hp === 'number' && pet.hp >= 0 ? Math.min(pet.hp, nextMaxHp) : nextMaxHp;
        let nextMp = typeof pet.mp === 'number' && pet.mp >= 0 ? Math.min(pet.mp, nextMaxMp) : nextMaxMp;

        if (gained.levelUps > 0) {
          nextAttack += GATHER_LEVELUP_ATTACK_GAIN * gained.levelUps;
          nextDefense += GATHER_LEVELUP_DEFENSE_GAIN * gained.levelUps;

          const previousMaxHp = nextMaxHp;
          const previousMaxMp = nextMaxMp;
          nextMaxHp = applyStatGrowthByLevels(nextMaxHp, gained.levelUps);
          nextMaxMp = applyStatGrowthByLevels(nextMaxMp, gained.levelUps);
          nextHp = Math.min(nextMaxHp, nextHp + Math.max(0, nextMaxHp - previousMaxHp));
          nextMp = Math.min(nextMaxMp, nextMp + Math.max(0, nextMaxMp - previousMaxMp));
        }

        return {
          ...pet,
          level: gained.level,
          exp: gained.exp,
          maxExp: gained.nextExp,
          attack: nextAttack,
          defense: nextDefense,
          hp: nextHp,
          maxHp: nextMaxHp,
          mp: nextMp,
          maxMp: nextMaxMp,
        };
      });

      localStorage.setItem(key, JSON.stringify(nextPets));
      setPets(nextPets.map((pet: any) => normalizeStoredPet(pet)));
    } catch {
      // Ignore invalid local data.
    }
  };

  const handleStartGather = () => {
    if (!username) {
      return;
    }
    if (!selectedPet || task) {
      return;
    }

    const startedAt = Date.now();
    const nextTask: GatherTask = {
      petId: selectedPet.id,
      petName: selectedPet.name,
      startedAt,
      endsAt: startedAt + GATHER_DURATION_MS,
    };
    writeGatherTask(nextTask, username);
    setTask(nextTask);
    playGatherStartSound();
    startGatherAmbience();
  };

  const handleClaimPotion = () => {
    if (!username) {
      return;
    }
    if (!task || !isTaskReady) {
      return;
    }

    const rewardPet = pets.find((pet) => pet.id === task.petId) || activeTaskPet;
    const petLevel = Math.max(1, rewardPet?.level || 1);
    const levelMultiplier = 1 + (petLevel - 1) * GATHER_LEVEL_BONUS_PER_LEVEL;
    const expReward = Math.max(1, Math.round(GATHER_BASE_EXP_REWARD * levelMultiplier));
    const mythReward = Math.max(1, Math.round(GATHER_BASE_MYTH_REWARD * levelMultiplier));

    const nextMagicPotionCount = addMagicPotion(1, username);
    const nextHealthPotionCount = addHealthPotion(1, username);
    setMagicPotionCount(nextMagicPotionCount);
    setHealthPotionCount(nextHealthPotionCount);
    applyGatherRewardsToPet(task.petId, expReward);
    const mythResult = grantMyth(mythReward, 'system', username);
    setMythBalance(mythResult.balance);
    setClaimNotice(
      t('gather.claimSummary', {
        exp: expReward,
        myth: mythReward,
        magicPotions: 1,
        healthPotions: 1,
      }),
    );
    clearGatherTask(username);
    setTask(null);
    setReadySoundPlayed(false);
    stopGatherAmbience();
  };

  if (!ready) {
    return <div className="min-h-screen bg-slate-900" />;
  }

  if (!isAuthenticated) {
    return <RequireAuth title={t('auth.loginRequired')} />;
  }

  return (
    <div className="min-h-screen bg-slate-900 relative overflow-hidden">
      <div className="ocean-backdrop" />
      <div className="ocean-surface-wave" />
      {[...Array(14)].map((_, index) => (
        <span
          key={index}
          className="ocean-bubble"
          style={{
            left: `${(index + 1) * 7}%`,
            animationDelay: `${(index % 7) * 0.7}s`,
            animationDuration: `${6 + (index % 5)}s`,
          }}
        />
      ))}
      <header className="flex items-start justify-between px-6 py-4 bg-slate-800/50 backdrop-blur-sm">
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-start gap-2">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-2xl">🦞</span>
              <span className="text-xl font-bold text-white">{t('common.appName')}</span>
            </Link>
            <GlobalMythChip floating={false} />
          </div>
          <nav className="flex gap-4 ml-4 mt-1">
            <Link href="/dashboard" className="text-slate-400 hover:text-white">
              {t('nav.dashboard')}
            </Link>
            <Link href="/battle" className="text-slate-400 hover:text-white">
              {t('nav.battle')}
            </Link>
            <Link href="/breed" className="text-slate-400 hover:text-white">
              {t('nav.breed')}
            </Link>
            <Link href="/gather" className="text-indigo-400 hover:text-indigo-300">
              {t('nav.gather')}
            </Link>
            <Link href="/adventure3d" className="text-slate-400 hover:text-white">
              🌊 {t('nav.adventure')}
            </Link>
            <Link href="/market" className="text-slate-400 hover:text-white">
              🏪 {t('nav.market')}
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          <AuthStatus />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 relative z-10">
        <h1 className="text-3xl font-bold text-white text-center mb-4">🌊 {t('gather.title')}</h1>
        <p className="text-center text-slate-400 mb-6">{t('gather.subtitle')}</p>

        <div className="flex justify-center gap-3 mb-8 flex-wrap">
          <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-sm">
            🧪 {t('dashboard.magicPotions', { count: magicPotionCount })}
          </span>
          <span className="px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 text-sm">
            ❤️ {t('dashboard.healthPotions', { count: healthPotionCount })}
          </span>
          {claimNotice && (
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-sm">{claimNotice}</span>
          )}
        </div>

        {pets.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-slate-300 mb-4">{t('gather.noPets')}</p>
            <Link href="/dashboard" className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-medium">
              {t('gather.goDashboard')}
            </Link>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            {!task && (
              <>
                <h2 className="text-xl text-white font-semibold mb-3">{t('gather.choosePet')}</h2>
                <div className="grid md:grid-cols-3 gap-3 mb-6">
                  {pets.map((pet) => (
                    <button
                      key={pet.id}
                      onClick={() => setSelectedPetId(pet.id)}
                      className={`p-3 rounded-xl border transition-all ${
                        selectedPetId === pet.id
                          ? 'border-indigo-500 bg-indigo-500/20'
                          : 'border-slate-600 bg-slate-800 hover:border-slate-500'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-white font-medium">{localizePetName(pet.name, t)}</span>
                        <span className={pet.gender === 'male' ? 'text-red-400' : 'text-pink-400'}>
                          {pet.gender === 'male' ? '♂' : '♀'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-300 mt-2">
                        <div>
                          {pet.element.map((element) => elementIcons[element]).join(' ')} • {t('dashboard.pet.level')}{' '}
                          {pet.level}
                        </div>
                        <div className="text-slate-400 mt-1">
                          {pet.attack}⚔️ {pet.defense}🛡️ • {t('dashboard.pet.hp')} {pet.hp}/{pet.maxHp}
                        </div>
                        <div className="text-slate-400 mt-1">
                          {t('dashboard.pet.mp')} {pet.mp}/{pet.maxMp}
                        </div>
                        {pet.generation && (
                          <div className="text-slate-400 mt-1">{t('breed.generation', { gen: pet.generation })}</div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="text-center">
                  <button
                    onClick={handleStartGather}
                    disabled={!selectedPet}
                    className={`px-8 py-4 rounded-xl text-lg font-semibold ${
                      selectedPet
                        ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500'
                        : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    ⛏️ {t('gather.start')}
                  </button>
                  <p className="text-sm text-slate-400 mt-3">{t('gather.durationHint')}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {t('gather.scalingHint', {
                      exp: GATHER_BASE_EXP_REWARD,
                      myth: GATHER_BASE_MYTH_REWARD,
                    })}
                  </p>
                </div>
              </>
            )}

            {task && (
              <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 text-center">
                <div className="text-6xl mb-4">🐚</div>
                <h2 className="text-xl font-semibold text-white mb-2">
                  {isTaskReady ? t('gather.readyTitle') : t('gather.progressTitle')}
                </h2>
                <p className="text-slate-300 mb-4">
                  {t('gather.activePet', { name: localizePetName(task.petName, t) || `#${task.petId}` })}
                </p>
                {activeTaskPet && (
                  <div className="text-xs text-slate-300 mb-4 space-y-1">
                    <p>
                      {activeTaskPet.gender === 'male'
                        ? `♂ ${t('dashboard.gender.male')}`
                        : `♀ ${t('dashboard.gender.female')}`}{' '}
                      • {activeTaskPet.element.map((element) => t(`dashboard.element.${element}`)).join('/')}
                    </p>
                    <p>
                      {t('dashboard.pet.level')} {activeTaskPet.level} • {activeTaskPet.attack}⚔️ {activeTaskPet.defense}
                      🛡️
                    </p>
                    <p>
                      {t('dashboard.pet.hp')} {activeTaskPet.hp}/{activeTaskPet.maxHp} • {t('dashboard.pet.mp')}{' '}
                      {activeTaskPet.mp}/{activeTaskPet.maxMp}
                    </p>
                  </div>
                )}

                {isTaskReady ? (
                  <button
                    onClick={handleClaimPotion}
                    className="px-8 py-4 bg-cyan-600 hover:bg-cyan-500 rounded-xl text-lg font-semibold"
                  >
                    🧪 {t('gather.claimOne')}
                  </button>
                ) : (
                  <>
                    <p className="text-slate-400 mb-1">{t('gather.remaining')}</p>
                    <p className="text-4xl font-bold text-cyan-300">{formatCooldownTimer(remainingMs)}</p>
                    <p className="text-xs text-blue-300 mt-2">{t('gather.syncHintInPage')}</p>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
