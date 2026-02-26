'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import AuthStatus from '@/components/AuthStatus';
import RequireAuth from '@/components/RequireAuth';
import { useAuth } from '@/components/AuthProvider';
import { getScopedStorageKey } from '@/lib/auth';
import { playBreedSound } from '@/lib/sounds';
import { localizePetName } from '@/lib/petNames';
import { readActiveGatherTask } from '@/lib/magicPotions';
import { normalizePetRarity, type PetRarity } from '@/lib/petRarity';

type Element = 'gold' | 'wood' | 'water' | 'fire' | 'earth';
type Gender = 'male' | 'female';

interface Pet {
  id: number;
  name: string;
  element: Element[];
  gender: Gender;
  level: number;
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

const genderColors: Record<Gender, { text: string; bg: string }> = {
  male: { text: 'text-red-400', bg: 'bg-red-500/30' },
  female: { text: 'text-pink-400', bg: 'bg-pink-500/30' },
};

const BREEDING_TIME_SECONDS = 4 * 60 * 60;
const DEMO_MODE = true;
const DEMO_BREEDING_TIME = 10;

export default function Breed() {
  const { t, i18n } = useTranslation();
  const { ready, isAuthenticated, username } = useAuth();
  const [selectedPets, setSelectedPets] = useState<number[]>([]);
  const [breeding, setBreeding] = useState(false);
  const [breedStartTime, setBreedStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [result, setResult] = useState<{
    name: string;
    element: Element[];
    gender: Gender;
    level: number;
    attack: number;
    defense: number;
    hp: number;
    maxHp: number;
    mp: number;
    maxMp: number;
    rarity: PetRarity;
    generation?: number;
  } | null>(null);
  const [gatherBusyPetId, setGatherBusyPetId] = useState<number | null>(null);
  const [gatherRemainingMs, setGatherRemainingMs] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const normalizeElements = (element: Element[] | Element | undefined): Element[] => {
    const source = Array.isArray(element) ? element : [element];
    const normalized = source.filter(
      (value): value is Element => typeof value === 'string' && VALID_ELEMENTS.includes(value as Element),
    );
    return normalized.length > 0 ? normalized : ['water'];
  };

  const readLocalPets = (): Pet[] => {
    const myPetsKey = getScopedStorageKey('myPets', username || undefined);
    try {
      const raw = localStorage.getItem(myPetsKey);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        localStorage.removeItem(myPetsKey);
        return [];
      }
      return parsed.map((p: any) => ({
        ...p,
        element: normalizeElements(p.element),
        rarity: normalizePetRarity(p.rarity),
        level: typeof p.level === 'number' && p.level > 0 ? p.level : 1,
        attack: typeof p.attack === 'number' && p.attack > 0 ? p.attack : 15,
        defense: typeof p.defense === 'number' && p.defense > 0 ? p.defense : 10,
        maxHp:
          typeof p.maxHp === 'number' && p.maxHp > 0
            ? p.maxHp
            : typeof p.hp === 'number' && p.hp > 0
              ? p.hp
              : 50,
        hp:
          typeof p.hp === 'number' && p.hp >= 0
            ? p.hp
            : typeof p.maxHp === 'number' && p.maxHp > 0
              ? p.maxHp
              : 50,
        maxMp:
          typeof p.maxMp === 'number' && p.maxMp > 0
            ? p.maxMp
            : typeof p.mp === 'number' && p.mp > 0
              ? p.mp
              : 30 + (typeof p.level === 'number' && p.level > 0 ? p.level : 1) * 5,
        mp:
          typeof p.mp === 'number' && p.mp >= 0
            ? p.mp
            : typeof p.maxMp === 'number' && p.maxMp > 0
              ? p.maxMp
              : 30 + (typeof p.level === 'number' && p.level > 0 ? p.level : 1) * 5,
      }));
    } catch {
      localStorage.removeItem(myPetsKey);
      return [];
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !username) {
      return;
    }

    const syncGatherState = () => {
      const activeTask = readActiveGatherTask(Date.now(), username);
      if (activeTask) {
        setGatherBusyPetId(activeTask.petId);
        setGatherRemainingMs(Math.max(0, activeTask.endsAt - Date.now()));
      } else {
        setGatherBusyPetId(null);
        setGatherRemainingMs(0);
      }
    };

    syncGatherState();
    const timer = setInterval(syncGatherState, 1000);
    return () => clearInterval(timer);
  }, [isAuthenticated, username]);

  const myPets: Pet[] =
    typeof window !== 'undefined'
      ? (() => {
          return readLocalPets();
        })()
      : [];

  const selectedPetDetails = selectedPets
    .map((petId) => myPets.find((pet) => pet.id === petId))
    .filter((pet): pet is Pet => Boolean(pet));

  const breedingRuleErrorKey = (() => {
    if (selectedPetDetails.length !== 2) {
      return null;
    }
    const [first, second] = selectedPetDetails;
    if ((gatherBusyPetId && first.id === gatherBusyPetId) || (gatherBusyPetId && second.id === gatherBusyPetId)) {
      return 'breed.ruleGathering';
    }
    if ((first.generation || 1) !== (second.generation || 1)) {
      return 'breed.ruleSameGeneration';
    }
    if (first.gender === second.gender) {
      return 'breed.ruleMaleFemale';
    }
    return null;
  })();

  const canStartBreeding = selectedPets.length === 2 && !breedingRuleErrorKey;

  useEffect(() => {
    if (breeding && breedStartTime) {
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - breedStartTime) / 1000);
        setElapsedTime(elapsed);

        const breedingTime = DEMO_MODE ? DEMO_BREEDING_TIME : BREEDING_TIME_SECONDS;

        if (elapsed >= breedingTime) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
          }
          finishBreeding();
        }
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [breeding, breedStartTime]);

  const finishBreeding = () => {
    playBreedSound();
    const allElements: Element[] = ['gold', 'wood', 'water', 'fire', 'earth'];
    const genders: Gender[] = ['male', 'female'];
    const rarities: PetRarity[] = ['common', 'rare', 'epic', 'legendary'];

    const parent1 = myPets.find((p) => p.id === selectedPets[0])!;
    const parent2 = myPets.find((p) => p.id === selectedPets[1])!;

    const parent1Gen = parent1.generation || 1;
    const parent2Gen = parent2.generation || 1;
    const newGeneration = Math.max(parent1Gen, parent2Gen) + 1;

    let newElements: Element[];
    const fiveElementChance = Math.random() < 0.01;

    if (fiveElementChance) {
      newElements = [...allElements];
    } else {
      const numElements = Math.floor(Math.random() * 4) + 1;
      const parentElements = [...new Set([...parent1.element, ...parent2.element])];
      newElements = [];

      for (let i = 0; i < numElements; i += 1) {
        if (Math.random() < 0.7 && parentElements.length > 0) {
          const idx = Math.floor(Math.random() * parentElements.length);
          newElements.push(parentElements[idx]);
        } else {
          newElements.push(allElements[Math.floor(Math.random() * allElements.length)]);
        }
      }
      newElements = [...new Set(newElements)];
    }

    const babyNumber = Math.floor(Math.random() * 1000);
    const canonicalBabyName = `LobBaby${babyNumber}`;
    const newPetMaxMp = 35 + Math.floor(Math.random() * 10);

    const newPet = {
      element: newElements,
      gender: genders[Math.floor(Math.random() * genders.length)] as Gender,
      rarity: rarities[Math.floor(Math.random() * rarities.length)],
      name: canonicalBabyName,
      level: 1,
      generation: newGeneration,
      exp: 0,
      maxExp: 100,
      attack: 15 + Math.floor(Math.random() * 10),
      defense: 10 + Math.floor(Math.random() * 8),
      hp: 45 + Math.floor(Math.random() * 15),
      maxHp: 45 + Math.floor(Math.random() * 15),
      mp: newPetMaxMp,
      maxMp: newPetMaxMp,
    };

    setResult({
      element: newPet.element,
      gender: newPet.gender,
      level: newPet.level,
      attack: newPet.attack,
      defense: newPet.defense,
      hp: newPet.hp,
      maxHp: newPet.maxHp,
      mp: newPet.mp,
      maxMp: newPet.maxMp,
      rarity: newPet.rarity,
      name: newPet.name,
      generation: newPet.generation,
    });

    const existingPets = readLocalPets();
    const newPetWithId = { ...newPet, id: Date.now() };
    localStorage.setItem(
      getScopedStorageKey('myPets', username || undefined),
      JSON.stringify([...existingPets, newPetWithId]),
    );

    setBreeding(false);
    setBreedStartTime(null);
    setElapsedTime(0);
  };

  const startBreeding = () => {
    if (!canStartBreeding) {
      return;
    }

    setBreeding(true);
    setResult(null);
    setBreedStartTime(Date.now());
    setElapsedTime(0);
  };

  const formatDuration = (seconds: number): string => {
    const isZh = (i18n.resolvedLanguage ?? i18n.language).startsWith('zh');
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (isZh) {
      if (hrs > 0) {
        return `${hrs}小时${mins}分${secs}秒`;
      }
      if (mins > 0) {
        return `${mins}分${secs}秒`;
      }
      return `${secs}秒`;
    }

    if (hrs > 0) {
      return `${hrs}h ${mins}m ${secs}s`;
    }
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const getRemainingTime = (): number => {
    const breedingTime = DEMO_MODE ? DEMO_BREEDING_TIME : BREEDING_TIME_SECONDS;
    return Math.max(0, breedingTime - elapsedTime);
  };

  const getProgress = (): number => {
    const breedingTime = DEMO_MODE ? DEMO_BREEDING_TIME : BREEDING_TIME_SECONDS;
    return Math.min(100, (elapsedTime / breedingTime) * 100);
  };

  const togglePet = (id: number) => {
    if (breeding || gatherBusyPetId === id) {
      return;
    }

    if (selectedPets.includes(id)) {
      setSelectedPets(selectedPets.filter((p) => p !== id));
    } else if (selectedPets.length < 2) {
      setSelectedPets([...selectedPets, id]);
    }
  };

  if (!ready) {
    return <div className="min-h-screen bg-slate-900" />;
  }

  if (!isAuthenticated) {
    return <RequireAuth title={t('auth.loginRequired')} />;
  }

  const demoDurationLabel = formatDuration(DEMO_BREEDING_TIME);
  const liveDurationLabel = formatDuration(BREEDING_TIME_SECONDS);
  const activeDurationLabel = DEMO_MODE ? demoDurationLabel : liveDurationLabel;

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(244,114,182,0.24),transparent_44%),radial-gradient(circle_at_82%_18%,rgba(192,132,252,0.2),transparent_42%),linear-gradient(180deg,#1b1023_0%,#111827_58%,#0b1220_100%)]" />
      <div className="pointer-events-none absolute -top-24 -left-16 h-72 w-72 rounded-full bg-pink-500/25 blur-3xl animate-pulse" />
      <div className="pointer-events-none absolute top-1/3 -right-20 h-80 w-80 rounded-full bg-fuchsia-400/20 blur-3xl animate-pulse [animation-delay:400ms]" />
      <div className="pointer-events-none absolute -bottom-28 left-1/2 h-80 w-[32rem] -translate-x-1/2 rounded-full bg-rose-400/10 blur-3xl" />

      <header className="relative z-10 flex items-center justify-between px-6 py-4 bg-slate-900/45 border-b border-pink-400/15 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🦞</span>
            <span className="text-xl font-bold text-white">{t('common.appName')}</span>
          </Link>
          <nav className="flex gap-4 ml-8">
            <Link href="/dashboard" className="text-slate-400 hover:text-white">
              {t('nav.dashboard')}
            </Link>
            <Link href="/battle" className="text-slate-400 hover:text-white">
              {t('nav.battle')}
            </Link>
            <Link href="/breed" className="text-indigo-400 hover:text-indigo-300">
              {t('nav.breed')}
            </Link>
            <Link href="/gather" className="text-slate-400 hover:text-white">
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

      <main className="relative z-10 container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white text-center mb-8">🐣 {t('breed.title')}</h1>

        {DEMO_MODE && (
          <div className="text-center mb-4">
            <span className="px-4 py-2 bg-yellow-500/20 text-yellow-400 rounded-full text-sm">
              {t('breed.demoWarning', { demo: demoDurationLabel, live: liveDurationLabel })}
            </span>
          </div>
        )}

        <div className="max-w-2xl mx-auto">
          <p className="text-center text-slate-400 mb-8">
            {t('breed.selectTwoWithTime', { time: activeDurationLabel })}
          </p>

          <div className="grid grid-cols-3 gap-4 mb-8">
            {myPets.map((pet) => (
              <button
                key={pet.id}
                onClick={() => togglePet(pet.id)}
                disabled={breeding || gatherBusyPetId === pet.id}
                className={`p-4 rounded-xl border-2 transition-all ${
                  selectedPets.includes(pet.id)
                    ? 'border-indigo-500 bg-indigo-500/20'
                    : `border-slate-600 bg-slate-800 hover:border-slate-500 ${elementColors[pet.element[0]].bg}`
                } ${breeding || gatherBusyPetId === pet.id ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xl">{elementColors[pet.element[0]].icon}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs ${genderColors[pet.gender].bg} ${genderColors[pet.gender].text}`}
                  >
                    {pet.gender === 'male' ? '♂' : '♀'}
                  </span>
                </div>
                <div className="text-center mb-2">
                  <span
                    className={`inline-block text-4xl p-2 rounded-full ${genderColors[pet.gender].bg} ${
                      pet.gender === 'female'
                        ? 'ring-2 ring-purple-400/80 ring-offset-1 ring-offset-slate-900'
                        : 'ring-2 ring-red-400/80 ring-offset-1 ring-offset-slate-900'
                    }`}
                  >
                    <span className={pet.gender === 'female' ? 'female-lobster-body' : ''}>🦞</span>
                  </span>
                </div>
                <div className="text-white font-medium text-center">{localizePetName(pet.name, t)}</div>
                <div className={`text-center text-xs mt-1 ${elementColors[pet.element[0]].text}`}>
                  {pet.element.map((element) => t(`dashboard.element.${element}`)).join('/')}
                </div>
                <div className="text-center text-xs mt-1 text-slate-300">
                  {t('dashboard.pet.level')} {pet.level} • {pet.attack}⚔️ {pet.defense}🛡️
                </div>
                <div className="text-center text-xs mt-1 text-slate-400">
                  {t('dashboard.pet.hp')} {pet.hp}/{pet.maxHp} • {t('dashboard.pet.mp')} {pet.mp}/{pet.maxMp}
                </div>
                {gatherBusyPetId === pet.id && (
                  <div className="text-center text-xs mt-2 text-blue-300">
                    🌊 {t('gather.busyBadge', { time: formatDuration(Math.ceil(gatherRemainingMs / 1000)) })}
                  </div>
                )}
              </button>
            ))}
          </div>

          {breeding && (
            <div className="mb-8 text-center">
              <div className="text-6xl mb-4 animate-pulse">🥚</div>
              <h3 className="text-xl text-white mb-4">{t('breed.hatching')}</h3>

              <div className="bg-slate-800 rounded-2xl p-6 max-w-sm mx-auto mb-4">
                <p className="text-slate-400 text-sm mb-2">{t('breed.remainingTime')}</p>
                <p className="text-4xl font-bold text-indigo-400">{formatDuration(getRemainingTime())}</p>
              </div>

              <div className="w-full max-w-md mx-auto h-4 bg-slate-700 rounded-full overflow-hidden mb-4">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all"
                  style={{ width: `${getProgress()}%` }}
                />
              </div>

              <p className="text-sm text-slate-500">
                {DEMO_MODE ? t('breed.demoModeAccelerated') : t('breed.blockchainConfirm')}
              </p>
            </div>
          )}

          {!breeding && (
            <div className="text-center">
              <button
                onClick={startBreeding}
                disabled={!canStartBreeding}
                className={`px-8 py-4 rounded-full text-xl font-semibold transition-all ${
                  canStartBreeding
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 transform hover:scale-105'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                🐣 {t('breed.startBreeding')}
              </button>
              {selectedPets.length === 2 && breedingRuleErrorKey && (
                <p className="mt-3 text-sm text-red-400">{t(breedingRuleErrorKey)}</p>
              )}
              <p className="mt-3 text-xs text-slate-400">{t('breed.ruleHint')}</p>
            </div>
          )}

          {result && !breeding && (
            <div className="mt-12 text-center animate-fade-in relative">
              {result.element.length === 5 && (
                <div className="mb-4">
                  <span className="text-4xl animate-pulse">✨</span>
                  <span className="text-4xl animate-pulse mx-2">🌟</span>
                  <span className="text-4xl animate-pulse">✨</span>
                </div>
              )}

              <div
                className={`inline-block text-9xl p-8 rounded-full ${
                  result.gender === 'female' ? genderColors.female.bg : elementColors[result.element[0]].bg
                } ${
                  result.gender === 'female'
                    ? 'ring-2 ring-purple-400/80 ring-offset-2 ring-offset-slate-900'
                    : 'ring-2 ring-red-400/80 ring-offset-2 ring-offset-slate-900'
                } animate-bounce hover:scale-110 transition-transform`}
              >
                <span
                  className={`animate-wiggle inline-block ${result.gender === 'female' ? 'female-lobster-body' : ''}`}
                >
                  🦞
                </span>
              </div>

              {result.element.length === 5 && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-yellow-500/30 via-amber-500/20 to-yellow-500/30 animate-pulse" />
                </div>
              )}

              <h3 className="text-3xl font-bold text-white mt-4">{localizePetName(result.name, t)}</h3>

              <p className="text-lg text-indigo-400 mt-1">
                {t('breed.generation', { gen: result.generation || 1 })}
              </p>

              <div className="flex justify-center items-center gap-2 mt-2">
                {result.element.map((el, idx) => (
                  <span
                    key={idx}
                    className="text-3xl animate-bounce"
                    style={{ animationDelay: `${idx * 0.1}s` }}
                    title={t(`dashboard.element.${el}`)}
                  >
                    {elementColors[el].icon}
                  </span>
                ))}
              </div>
              <p className={`text-sm mt-1 ${elementColors[result.element[0]].text}`}>
                {result.element.map((e) => t(`dashboard.element.${e}`)).join('/')} ({t('breed.elementCount', {
                  count: result.element.length,
                })})
              </p>

              {result.element.length === 5 && (
                <p className="text-amber-400 font-bold mt-3 text-xl animate-pulse">{t('breed.fiveElementLegend')}</p>
              )}

              <span
                className={`inline-block mt-3 px-4 py-2 rounded-full text-lg ${genderColors[result.gender].bg} ${genderColors[result.gender].text}`}
              >
                {result.gender === 'male'
                  ? `♂ ${t('dashboard.gender.male')}`
                  : `♀ ${t('dashboard.gender.female')}`}
              </span>

              <p className="text-sm mt-3 text-slate-300">
                {t('dashboard.pet.level')} {result.level} • {result.attack}⚔️ {result.defense}🛡️
              </p>
              <p className="text-sm mt-1 text-slate-400">
                {t('dashboard.pet.hp')} {result.hp}/{result.maxHp} • {t('dashboard.pet.mp')} {result.mp}/{result.maxMp}
              </p>

              <p
                className={`text-xl mt-4 ${
                  result.rarity === 'legendary'
                    ? 'text-amber-400'
                    : result.rarity === 'epic'
                      ? 'text-purple-400'
                      : result.rarity === 'rare'
                        ? 'text-blue-400'
                        : 'text-slate-400'
                }`}
              >
                {t(`dashboard.rarity.${result.rarity}`, { defaultValue: result.rarity })}
              </p>
              <p className="text-slate-400 mt-2">{t('breed.newBabyAdded')}</p>

              <div className="mt-6">
                <Link href="/dashboard" className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-medium">
                  {t('breed.viewMyPets')} 🐠
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
