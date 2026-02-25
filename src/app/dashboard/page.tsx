'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import AuthStatus from '@/components/AuthStatus';
import RequireAuth from '@/components/RequireAuth';
import { useAuth } from '@/components/AuthProvider';
import { getScopedStorageKey } from '@/lib/auth';
import { localizePetName } from '@/lib/petNames';
import { formatCooldownTimer, getBattleCooldownRemainingMs } from '@/lib/battleCooldown';
import { consumeMagicPotion, readGatherTask, readMagicPotionCount, type GatherTask } from '@/lib/magicPotions';
import {
  DAILY_CHECKIN_REWARD,
  claimDailyCheckIn,
  hasClaimedDailyCheckIn,
  readMythBalance,
} from '@/lib/economy';
import { normalizePetRarity, type PetRarity } from '@/lib/petRarity';

type Element = 'gold' | 'wood' | 'water' | 'fire' | 'earth';
type Gender = 'male' | 'female';

interface Pet {
  id: number;
  name: string;
  element: Element[];
  gender: Gender;
  level: number;
  exp: number;
  maxExp: number;
  attack: number;
  defense: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  rarity: PetRarity;
  generation?: number;
}

const VALID_ELEMENTS: Element[] = ['gold', 'wood', 'water', 'fire', 'earth'];

const elementColors: Record<Element, { bg: string; border: string; text: string; icon: string }> = {
  gold: { bg: 'bg-yellow-500/20', border: 'border-yellow-500', text: 'text-yellow-400', icon: '🪙' },
  wood: { bg: 'bg-green-500/20', border: 'border-green-500', text: 'text-green-400', icon: '🪵' },
  water: { bg: 'bg-blue-500/20', border: 'border-blue-500', text: 'text-blue-400', icon: '💧' },
  fire: { bg: 'bg-red-500/20', border: 'border-red-500', text: 'text-red-400', icon: '🔥' },
  earth: { bg: 'bg-amber-700/20', border: 'border-amber-600', text: 'text-amber-500', icon: '🪨' },
};

const genderColors: Record<Gender, { color: string; bg: string }> = {
  male: { color: 'text-red-400', bg: 'bg-red-500/30' },
  female: { color: 'text-pink-400', bg: 'bg-pink-500/30' },
};

function normalizeElements(element: unknown): Element[] {
  const source = Array.isArray(element) ? element : [element];
  const normalized = source.filter(
    (value): value is Element => typeof value === 'string' && VALID_ELEMENTS.includes(value as Element),
  );
  return normalized.length > 0 ? normalized : ['water'];
}

function normalizePet(rawPet: any): Pet {
  const level = typeof rawPet.level === 'number' && rawPet.level > 0 ? rawPet.level : 1;
  const maxHp =
    typeof rawPet.maxHp === 'number' && rawPet.maxHp > 0
      ? rawPet.maxHp
      : typeof rawPet.hp === 'number' && rawPet.hp > 0
        ? rawPet.hp
        : 50;
  const hp = typeof rawPet.hp === 'number' && rawPet.hp >= 0 ? Math.min(rawPet.hp, maxHp) : maxHp;
  const maxMp =
    typeof rawPet.maxMp === 'number' && rawPet.maxMp > 0
      ? rawPet.maxMp
      : typeof rawPet.mp === 'number' && rawPet.mp > 0
        ? rawPet.mp
        : 30 + level * 5;
  const mp = typeof rawPet.mp === 'number' && rawPet.mp >= 0 ? Math.min(rawPet.mp, maxMp) : maxMp;

  return {
    id: typeof rawPet.id === 'number' ? rawPet.id : Date.now(),
    name: typeof rawPet.name === 'string' ? rawPet.name : 'Lobster',
    element: normalizeElements(rawPet.element),
    gender: rawPet.gender === 'female' ? 'female' : 'male',
    level,
    exp: typeof rawPet.exp === 'number' && rawPet.exp >= 0 ? rawPet.exp : 0,
    maxExp: typeof rawPet.maxExp === 'number' && rawPet.maxExp > 0 ? rawPet.maxExp : 100,
    attack: typeof rawPet.attack === 'number' && rawPet.attack > 0 ? rawPet.attack : 15,
    defense: typeof rawPet.defense === 'number' && rawPet.defense > 0 ? rawPet.defense : 10,
    hp,
    maxHp,
    mp,
    maxMp,
    rarity: normalizePetRarity(rawPet.rarity),
    generation: typeof rawPet.generation === 'number' && rawPet.generation > 0 ? rawPet.generation : 1,
  };
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { ready, isAuthenticated, username } = useAuth();
  const [pets, setPets] = useState<Pet[]>([]);
  const [nowMs, setNowMs] = useState(Date.now());
  const [potionCount, setPotionCount] = useState(0);
  const [gatherTask, setGatherTask] = useState<GatherTask | null>(null);
  const [mythBalance, setMythBalance] = useState(0);
  const [dailyClaimed, setDailyClaimed] = useState(true);
  const [checkInNotice, setCheckInNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !username) {
      return;
    }

    const myPetsKey = getScopedStorageKey('myPets', username);
    const generationKey = getScopedStorageKey('generation1Count', username);
    const savedPets = localStorage.getItem(myPetsKey);
    const generation1Count = Number.parseInt(localStorage.getItem(generationKey) || '0', 10);

    if (savedPets) {
      try {
        const parsed = JSON.parse(savedPets);
        const migratedPets = Array.isArray(parsed) ? parsed.map((pet) => normalizePet(pet)) : [];
        setPets(migratedPets);
        localStorage.setItem(myPetsKey, JSON.stringify(migratedPets));
      } catch {
        localStorage.removeItem(myPetsKey);
        localStorage.removeItem(generationKey);
      }
    } else {
      if (generation1Count >= 200) {
        alert(t('dashboard.starterSoldOut'));
        return;
      }

      const starterPets: Pet[] = [
        {
          id: 1,
          name: 'Fire Lob',
          element: ['fire', 'water', 'earth'],
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
          name: 'Water Lob',
          element: ['water', 'fire', 'wood'],
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

      setPets(starterPets);
      localStorage.setItem(myPetsKey, JSON.stringify(starterPets));
      localStorage.setItem(generationKey, String(generation1Count + 1));
    }

    setPotionCount(readMagicPotionCount(username));
    setGatherTask(readGatherTask(username));
    setMythBalance(readMythBalance(username));
    setDailyClaimed(hasClaimedDailyCheckIn(username));
  }, [isAuthenticated, t, username]);

  useEffect(() => {
    if (!isAuthenticated || !username) {
      return;
    }

    const timer = setInterval(() => {
      setNowMs(Date.now());
      setGatherTask(readGatherTask(username));
      setPotionCount(readMagicPotionCount(username));
      setMythBalance(readMythBalance(username));
      setDailyClaimed(hasClaimedDailyCheckIn(username));
    }, 1000);
    return () => clearInterval(timer);
  }, [isAuthenticated, username]);

  useEffect(() => {
    if (!checkInNotice) {
      return;
    }
    const timer = setTimeout(() => setCheckInNotice(null), 2800);
    return () => clearTimeout(timer);
  }, [checkInNotice]);

  const gatherPetStatus = useMemo<'idle' | 'gathering' | 'ready'>(() => {
    if (!gatherTask) {
      return 'idle';
    }
    return gatherTask.endsAt > nowMs ? 'gathering' : 'ready';
  }, [gatherTask, nowMs]);

  const gatherPetId = useMemo(() => {
    if (!gatherTask) {
      return null;
    }
    return gatherTask.petId;
  }, [gatherTask]);

  const handleUsePotion = (petId: number) => {
    if (!username) {
      return;
    }
    if (potionCount <= 0 || (gatherPetStatus === 'gathering' && gatherPetId === petId)) {
      return;
    }

    const target = pets.find((pet) => pet.id === petId);
    if (!target || target.mp >= target.maxMp) {
      return;
    }

    const updatedPets = pets.map((pet) => (pet.id === petId ? { ...pet, mp: pet.maxMp } : pet));
    setPets(updatedPets);
    localStorage.setItem(getScopedStorageKey('myPets', username || undefined), JSON.stringify(updatedPets));
    const nextPotionCount = consumeMagicPotion(1, username);
    setPotionCount(nextPotionCount);
  };

  const handleDailyCheckIn = () => {
    if (!username) {
      return;
    }
    if (dailyClaimed) {
      return;
    }

    const result = claimDailyCheckIn(username);
    setMythBalance(result.balance);
    setDailyClaimed(hasClaimedDailyCheckIn(username));
    if (result.claimed) {
      setCheckInNotice(t('dashboard.dailyClaimSuccess', { amount: result.amount }));
    }
  };

  if (!ready) {
    return <div className="min-h-screen bg-slate-900" />;
  }

  if (!isAuthenticated) {
    return <RequireAuth title={t('auth.loginRequired')} />;
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="flex items-center justify-between px-6 py-4 bg-slate-800/50 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🦞</span>
            <span className="text-xl font-bold text-white">{t('common.appName')}</span>
          </Link>
          <nav className="flex gap-4 ml-8">
            <Link href="/dashboard" className="text-indigo-400 hover:text-indigo-300">
              {t('nav.dashboard')}
            </Link>
            <Link href="/battle" className="text-slate-400 hover:text-white">
              {t('nav.battle')}
            </Link>
            <Link href="/breed" className="text-slate-400 hover:text-white">
              {t('nav.breed')}
            </Link>
            <Link href="/gather" className="text-slate-400 hover:text-white">
              {t('nav.gather')}
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

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-4">{t('dashboard.title')}</h1>

        <div className="mb-8 flex flex-wrap items-center gap-3">
          <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-sm">
            🧪 {t('dashboard.magicPotions', { count: potionCount })}
          </span>
          <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-sm">
            💰 {t('dashboard.mythBalance', { amount: mythBalance })}
          </span>
          <button
            onClick={handleDailyCheckIn}
            disabled={dailyClaimed}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              dailyClaimed
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-amber-600 hover:bg-amber-500 text-white'
            }`}
          >
            {dailyClaimed
              ? `✅ ${t('dashboard.dailyClaimed')}`
              : `🎁 ${t('dashboard.dailyCheckIn', { amount: DAILY_CHECKIN_REWARD })}`}
          </button>
          <Link href="/gather" className="px-3 py-1 rounded-full bg-blue-600 hover:bg-blue-500 text-sm font-medium">
            🌊 {t('dashboard.goGather')}
          </Link>
          {checkInNotice && (
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-sm">{checkInNotice}</span>
          )}
          {gatherTask && gatherPetId && gatherPetStatus === 'gathering' && (
            <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-sm">
              {t('gather.syncHint', {
                name: localizePetName(gatherTask.petName, t) || `#${gatherTask.petId}`,
                time: formatCooldownTimer(Math.max(0, gatherTask.endsAt - nowMs)),
              })}
            </span>
          )}
          {gatherTask && gatherPetId && gatherPetStatus === 'ready' && (
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-sm">
              {t('gather.readySyncHint', {
                name: localizePetName(gatherTask.petName, t) || `#${gatherTask.petId}`,
              })}
            </span>
          )}
        </div>

        {pets.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-8xl mb-4">🦞</div>
            <p className="text-xl text-slate-400 mb-8">{t('dashboard.noPets')}</p>
            <button className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full text-xl font-semibold">
              🆓 {t('dashboard.claimFree')}
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pets.map((pet) => {
              const cooldownRemainingMs = getBattleCooldownRemainingMs(pet.id, nowMs);
              const isCooldownActive = cooldownRemainingMs > 0;
              const isGathering = gatherPetStatus === 'gathering' && gatherPetId === pet.id;
              const isGatherReady = gatherPetStatus === 'ready' && gatherPetId === pet.id;

              return (
                <div
                  key={pet.id}
                  className={`bg-slate-800 rounded-2xl p-6 border-2 ${elementColors[pet.element[0]].border}`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {pet.element.map((el, idx) => (
                          <span key={idx} className="text-xl" title={t(`dashboard.element.${el}`)}>
                            {elementColors[el].icon}
                          </span>
                        ))}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white">{localizePetName(pet.name, t)}</h3>
                        <span className={`text-sm ${elementColors[pet.element[0]].text}`}>
                          {pet.element.map((e) => t(`dashboard.element.${e}`)).join('/')}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${genderColors[pet.gender].bg} ${genderColors[pet.gender].color}`}
                    >
                      {pet.gender === 'male'
                        ? `♂ ${t('dashboard.gender.male')}`
                        : `♀ ${t('dashboard.gender.female')}`}
                    </span>
                  </div>

                  <div className="text-center mb-4">
                    <div
                      className={`inline-block text-8xl p-4 rounded-full ${genderColors[pet.gender].bg} ${
                        pet.gender === 'female'
                          ? 'ring-2 ring-purple-400/80 ring-offset-2 ring-offset-slate-900'
                          : 'ring-2 ring-red-400/80 ring-offset-2 ring-offset-slate-900'
                      } hover:scale-110 transition-transform cursor-pointer animate-bounce-slow`}
                    >
                      <span className={`animate-wiggle inline-block ${pet.gender === 'female' ? 'female-lobster-body' : ''}`}>
                        🦞
                      </span>
                    </div>
                    {pet.rarity !== 'common' && (
                      <div className="flex justify-center gap-1 mt-2">
                        {[...Array(pet.rarity === 'legendary' ? 4 : pet.rarity === 'epic' ? 3 : 2)].map((_, i) => (
                          <span key={i} className="text-amber-400 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }}>
                            ✨
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="text-center mb-4">
                    <span className="text-2xl font-bold text-white">
                      {t('dashboard.pet.level')} {pet.level}
                    </span>
                    {pet.generation && (
                      <span className="ml-2 px-2 py-1 bg-indigo-500/30 rounded text-sm text-indigo-300">
                        {t('breed.generation', { gen: pet.generation })}
                      </span>
                    )}
                    <span className="ml-2 px-2 py-1 bg-slate-700 rounded text-sm text-slate-300">
                      {t(`dashboard.rarity.${pet.rarity}`)}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-400">{t('dashboard.pet.exp')}</span>
                        <span className="text-indigo-400">
                          {pet.exp}/{pet.maxExp}
                        </span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                          style={{ width: `${(pet.exp / pet.maxExp) * 100}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-400">{t('dashboard.pet.hp')}</span>
                        <span className="text-green-400">
                          {pet.hp}/{pet.maxHp}
                        </span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500" style={{ width: `${(pet.hp / pet.maxHp) * 100}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-400">{t('dashboard.pet.mp')}</span>
                        <span className="text-cyan-400">
                          {pet.mp}/{pet.maxMp}
                        </span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-500" style={{ width: `${(pet.mp / pet.maxMp) * 100}%` }} />
                      </div>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-400">{t('dashboard.attack')}</span>
                      <span className="text-red-400 font-bold">{pet.attack}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">{t('dashboard.defense')}</span>
                      <span className="text-blue-400 font-bold">{pet.defense}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-6">
                    {isGathering ? (
                      <button
                        disabled
                        className="flex-1 px-4 py-2 bg-slate-700 text-slate-500 rounded-lg text-center font-medium cursor-not-allowed"
                      >
                        🌊 {t('gather.busyButton')}
                      </button>
                    ) : isCooldownActive ? (
                      <button
                        disabled
                        className="flex-1 px-4 py-2 bg-slate-700 text-slate-500 rounded-lg text-center font-medium cursor-not-allowed"
                      >
                        ⏳ {t('battle.cooldownButton', { time: formatCooldownTimer(cooldownRemainingMs) })}
                      </button>
                    ) : (
                      <Link
                        href={`/battle?petId=${pet.id}`}
                        className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-center font-medium"
                      >
                        ⚔️ {t('nav.battle')}
                      </Link>
                    )}

                    {isGathering ? (
                      <button
                        disabled
                        className="flex-1 px-4 py-2 bg-slate-700 text-slate-500 rounded-lg text-center font-medium cursor-not-allowed"
                      >
                        🐣 {t('gather.busyBreed')}
                      </button>
                    ) : (
                      <Link
                        href="/breed"
                        className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-center font-medium"
                      >
                        🐣 {t('nav.breed')}
                      </Link>
                    )}
                  </div>

                  <button
                    onClick={() => handleUsePotion(pet.id)}
                    disabled={potionCount <= 0 || pet.mp >= pet.maxMp || isGathering}
                    className={`mt-2 w-full px-4 py-2 rounded-lg text-center font-medium ${
                      potionCount <= 0 || pet.mp >= pet.maxMp || isGathering
                        ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                        : 'bg-cyan-600 hover:bg-cyan-500'
                    }`}
                  >
                    {isGathering
                      ? `🌊 ${t('gather.busyPotion')}`
                      : pet.mp >= pet.maxMp
                        ? `✨ ${t('dashboard.magicFull')}`
                        : `🧪 ${t('dashboard.usePotion')}`}
                  </button>

                  {isGathering && gatherTask && (
                    <p className="mt-2 text-xs text-blue-300 text-center">
                      {t('gather.busyBadge', { time: formatCooldownTimer(Math.max(0, gatherTask.endsAt - nowMs)) })}
                    </p>
                  )}
                  {isGatherReady && (
                    <p className="mt-2 text-xs text-emerald-300 text-center">
                      {t('gather.readyBadge')}
                    </p>
                  )}
                  {!isGathering && isCooldownActive && (
                    <p className="mt-2 text-xs text-slate-300 text-center">
                      {t('battle.cooldownNotice', { time: formatCooldownTimer(cooldownRemainingMs) })}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
