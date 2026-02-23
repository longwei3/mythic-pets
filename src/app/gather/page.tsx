'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { localizePetName } from '@/lib/petNames';
import { formatCooldownTimer } from '@/lib/battleCooldown';
import {
  GATHER_DURATION_MS,
  addMagicPotion,
  clearGatherTask,
  readGatherTask,
  readMagicPotionCount,
  writeGatherTask,
  type GatherTask,
} from '@/lib/magicPotions';
import {
  playGatherReadySound,
  playGatherStartSound,
  startGatherAmbience,
  stopGatherAmbience,
} from '@/lib/sounds';

type Element = 'gold' | 'wood' | 'water' | 'fire' | 'earth';
type Gender = 'male' | 'female';

interface Pet {
  id: number;
  name: string;
  element: Element[];
  gender: Gender;
  level: number;
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

export default function GatherPage() {
  const { t } = useTranslation();
  const { isConnected } = useAccount();
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<number | null>(null);
  const [task, setTask] = useState<GatherTask | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [potionCount, setPotionCount] = useState(0);
  const [readySoundPlayed, setReadySoundPlayed] = useState(false);

  const normalizeElements = (element: Element[] | Element | undefined): Element[] => {
    const source = Array.isArray(element) ? element : [element];
    const normalized = source.filter(
      (value): value is Element => typeof value === 'string' && VALID_ELEMENTS.includes(value as Element),
    );
    return normalized.length > 0 ? normalized : ['water'];
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isConnected) {
      return;
    }

    try {
      const rawPets = localStorage.getItem('myPets');
      if (rawPets) {
        const parsed = JSON.parse(rawPets);
        if (Array.isArray(parsed)) {
          const normalizedPets = parsed.map((pet: any) => ({
            ...pet,
            element: normalizeElements(pet.element),
            level: typeof pet.level === 'number' && pet.level > 0 ? pet.level : 1,
          })) as Pet[];
          setPets(normalizedPets);
          if (!selectedPetId && normalizedPets.length > 0) {
            setSelectedPetId(normalizedPets[0].id);
          }
        }
      }
    } catch {
      // Ignore invalid local data.
    }

    setPotionCount(readMagicPotionCount());
    setTask(readGatherTask());
  }, [isConnected, selectedPetId]);

  const selectedPet = useMemo(
    () => pets.find((pet) => pet.id === selectedPetId) || null,
    [pets, selectedPetId],
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

  const handleStartGather = () => {
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
    writeGatherTask(nextTask);
    setTask(nextTask);
    playGatherStartSound();
    startGatherAmbience();
  };

  const handleClaimPotion = () => {
    if (!task || !isTaskReady) {
      return;
    }

    const nextCount = addMagicPotion(1);
    setPotionCount(nextCount);
    clearGatherTask();
    setTask(null);
    setReadySoundPlayed(false);
    stopGatherAmbience();
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl text-white mb-4">{t('gather.connectWallet')}</h2>
          <ConnectButton />
        </div>
      </div>
    );
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
      <header className="flex items-center justify-between px-6 py-4 bg-slate-800/50 backdrop-blur-sm">
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
            <Link href="/breed" className="text-slate-400 hover:text-white">
              {t('nav.breed')}
            </Link>
            <Link href="/gather" className="text-indigo-400 hover:text-indigo-300">
              {t('nav.gather')}
            </Link>
            <Link href="/market" className="text-slate-400 hover:text-white">
              🏪 {t('nav.market')}
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          <ConnectButton />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 relative z-10">
        <h1 className="text-3xl font-bold text-white text-center mb-4">🌊 {t('gather.title')}</h1>
        <p className="text-center text-slate-400 mb-6">{t('gather.subtitle')}</p>

        <div className="flex justify-center mb-8">
          <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-sm">
            🧪 {t('dashboard.magicPotions', { count: potionCount })}
          </span>
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
                        {pet.element.map((element) => elementIcons[element]).join(' ')} • {t('dashboard.pet.level')}{' '}
                        {pet.level}
                        {pet.generation ? ` • ${t('breed.generation', { gen: pet.generation })}` : ''}
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
