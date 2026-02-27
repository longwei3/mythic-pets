'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import AuthStatus from '@/components/AuthStatus';
import GlobalMythChip from '@/components/GlobalMythChip';
import { useAuth } from '@/components/AuthProvider';
import {
  playAuthUiEffect,
  playClickSound,
  playSound,
  startAuthShowcaseEffects,
  startAuthShowcaseMusic,
  stopAuthShowcaseEffects,
  stopAuthShowcaseMusic,
} from '@/lib/sounds';
import { localizePetName } from '@/lib/petNames';
import { formatCooldownTimer } from '@/lib/battleCooldown';
import { readActiveGatherTask, type GatherTask } from '@/lib/magicPotions';

type Element = 'gold' | 'wood' | 'water' | 'fire' | 'earth';
type Gender = 'male' | 'female';

interface ShowcasePet {
  id: string;
  nameKey: 'dashboard.starterPets.fire' | 'dashboard.starterPets.water';
  element: Element[];
  gender: Gender;
  level: number;
  attack: number;
  defense: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
}

const elementStyles: Record<Element, { icon: string; text: string }> = {
  gold: { icon: '🪙', text: 'text-yellow-300' },
  wood: { icon: '🪵', text: 'text-green-300' },
  water: { icon: '💧', text: 'text-blue-300' },
  fire: { icon: '🔥', text: 'text-red-300' },
  earth: { icon: '🪨', text: 'text-amber-300' },
};

const genderStyles: Record<Gender, { badge: string; text: string }> = {
  male: { badge: 'bg-red-500/25', text: 'text-red-300' },
  female: { badge: 'bg-pink-500/25', text: 'text-pink-300' },
};

const showcasePets: ShowcasePet[] = [
  {
    id: 'starter-fire',
    nameKey: 'dashboard.starterPets.fire',
    element: ['fire', 'water', 'earth'],
    gender: 'male',
    level: 1,
    attack: 20,
    defense: 10,
    hp: 50,
    maxHp: 50,
    mp: 40,
    maxMp: 40,
  },
  {
    id: 'starter-water',
    nameKey: 'dashboard.starterPets.water',
    element: ['water', 'fire', 'wood'],
    gender: 'female',
    level: 1,
    attack: 18,
    defense: 12,
    hp: 55,
    maxHp: 55,
    mp: 45,
    maxMp: 45,
  },
];

const homeShowcaseOrbs = [
  {
    left: '10%',
    top: '16%',
    size: 260,
    duration: 16,
    pulse: 5.4,
    delay: 0,
    color: 'rgba(56, 189, 248, 0.24)',
    glow: 'rgba(56, 189, 248, 0.34)',
  },
  {
    left: '75%',
    top: '14%',
    size: 230,
    duration: 14,
    pulse: 4.8,
    delay: 1.2,
    color: 'rgba(167, 139, 250, 0.22)',
    glow: 'rgba(167, 139, 250, 0.3)',
  },
  {
    left: '18%',
    top: '72%',
    size: 220,
    duration: 17,
    pulse: 5.7,
    delay: 0.8,
    color: 'rgba(45, 212, 191, 0.18)',
    glow: 'rgba(45, 212, 191, 0.28)',
  },
  {
    left: '82%',
    top: '68%',
    size: 260,
    duration: 15,
    pulse: 5.2,
    delay: 2.1,
    color: 'rgba(59, 130, 246, 0.16)',
    glow: 'rgba(99, 102, 241, 0.26)',
  },
];

const homeFloatingLobsters = [
  { left: '12%', top: '30%', size: 44, duration: 9.4, delay: 0.2 },
  { left: '86%', top: '28%', size: 36, duration: 10.1, delay: 1.2 },
  { left: '20%', top: '80%', size: 32, duration: 11.2, delay: 0.7 },
  { left: '80%', top: '74%', size: 46, duration: 8.8, delay: 2.2 },
];

export default function Home() {
  const { t } = useTranslation();
  const { isAuthenticated, username } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [gatherTask, setGatherTask] = useState<GatherTask | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [audioEnabled, setAudioEnabled] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !isAuthenticated) {
      setGatherTask(null);
      return;
    }

    const syncGatherTask = () => {
      setNowMs(Date.now());
      setGatherTask(readActiveGatherTask(Date.now(), username || undefined));
    };

    syncGatherTask();
    const timer = setInterval(syncGatherTask, 1000);
    return () => clearInterval(timer);
  }, [isAuthenticated, mounted, username]);

  useEffect(() => {
    const unlockAudio = () => {
      if (audioEnabled) {
        startAuthShowcaseMusic();
        startAuthShowcaseEffects();
      }
    };

    if (audioEnabled) {
      startAuthShowcaseMusic();
      startAuthShowcaseEffects();
    } else {
      stopAuthShowcaseMusic();
      stopAuthShowcaseEffects();
    }

    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio);

    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      stopAuthShowcaseMusic();
      stopAuthShowcaseEffects();
    };
  }, [audioEnabled]);

  const playHoverFx = () => {
    if (!audioEnabled) {
      return;
    }
    playSound('hover');
  };

  const playSwitchFx = () => {
    if (!audioEnabled) {
      return;
    }
    playClickSound();
    playAuthUiEffect('switch');
  };

  const renderHomeShowcaseBackground = () => (
    <>
      <div className="auth-showcase-bg pointer-events-none" />
      <div className="auth-grid-overlay pointer-events-none" />
      <div className="auth-scanline pointer-events-none" />
      {homeShowcaseOrbs.map((orb, index) => (
        <span
          key={`home-orb-${index}`}
          className="auth-orb"
          style={{
            left: orb.left,
            top: orb.top,
            width: `${orb.size}px`,
            height: `${orb.size}px`,
            background: orb.color,
            boxShadow: `0 0 52px ${orb.glow}`,
            animationDuration: `${orb.duration}s, ${orb.pulse}s`,
            animationDelay: `${orb.delay}s, ${orb.delay * 0.45}s`,
          }}
        />
      ))}
      {homeFloatingLobsters.map((item, index) => (
        <span
          key={`home-lobster-${index}`}
          className="auth-lobster-float"
          style={{
            left: item.left,
            top: item.top,
            fontSize: `${item.size}px`,
            animationDuration: `${item.duration}s, 4.4s`,
            animationDelay: `${item.delay}s, ${item.delay * 0.5}s`,
          }}
        >
          🦞
        </span>
      ))}
    </>
  );

  return (
    <div className="min-h-screen relative overflow-hidden bg-slate-950">
      {renderHomeShowcaseBackground()}
      <header className="relative z-10 flex items-start justify-between px-6 py-4">
        <div className="flex flex-col items-start gap-2">
          <div className="flex items-center gap-2">
            <span className="text-3xl drop-shadow-[0_0_14px_rgba(99,102,241,0.65)]">🦞</span>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-300 via-indigo-300 to-fuchsia-300 bg-clip-text text-transparent">
              {t('common.appName')}
            </h1>
          </div>
          <GlobalMythChip floating={false} />
        </div>
        <nav className="flex gap-4">
          <Link href="/dashboard" onMouseEnter={playHoverFx} onClick={playSwitchFx} className="text-slate-300 hover:text-white">
            {t('nav.dashboard')}
          </Link>
          <Link href="/battle" onMouseEnter={playHoverFx} onClick={playSwitchFx} className="text-slate-300 hover:text-white">
            {t('nav.battle')}
          </Link>
          <Link href="/breed" onMouseEnter={playHoverFx} onClick={playSwitchFx} className="text-slate-300 hover:text-white">
            {t('nav.breed')}
          </Link>
          <Link href="/gather" onMouseEnter={playHoverFx} onClick={playSwitchFx} className="text-slate-300 hover:text-white">
            {t('nav.gather')}
          </Link>
          <Link href="/adventure3d" onMouseEnter={playHoverFx} onClick={playSwitchFx} className="text-slate-300 hover:text-white">
            🌊 {t('nav.adventure')}
          </Link>
          <Link href="/market" onMouseEnter={playHoverFx} onClick={playSwitchFx} className="text-slate-300 hover:text-white">
            🏪 {t('nav.market')}
          </Link>
        </nav>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              if (audioEnabled) {
                playClickSound();
                playAuthUiEffect('switch');
              }
              setAudioEnabled((prev) => !prev);
            }}
            onMouseEnter={playHoverFx}
            className="px-3 py-2 rounded-lg bg-slate-800/70 border border-slate-600 hover:border-fuchsia-400 text-xs sm:text-sm"
          >
            {audioEnabled ? `🔊 ${t('landing.audioOn')}` : `🔇 ${t('landing.audioOff')}`}
          </button>
          <LanguageSwitcher />
          {mounted && <AuthStatus />}
        </div>
      </header>

      <main className="relative z-10 container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h2 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-indigo-400 via-purple-400 to-amber-400 bg-clip-text text-transparent">
            {t('landing.title')}
          </h2>
          <p className="text-xl md:text-2xl text-indigo-200 mb-4">
            {t('landing.subtitle')}
          </p>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-8">
            {t('landing.description')}
          </p>
          <p className="text-xs text-cyan-200/90 mb-8">{t('landing.musicHint')}</p>
          {isAuthenticated && gatherTask && (
            <div className="max-w-2xl mx-auto mb-6 p-4 rounded-xl border border-cyan-500/40 bg-cyan-500/10">
              <p className="text-cyan-200 text-sm">
                🌊{' '}
                {t('gather.syncHint', {
                  name: localizePetName(gatherTask.petName, t) || `#${gatherTask.petId}`,
                  time: formatCooldownTimer(Math.max(0, gatherTask.endsAt - nowMs)),
                })}
              </p>
              <div className="mt-3">
                <Link
                  href="/gather"
                  onMouseEnter={playHoverFx}
                  onClick={playSwitchFx}
                  className="inline-block px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm font-semibold"
                >
                  {t('nav.gather')}
                </Link>
              </div>
            </div>
          )}
          {isAuthenticated ? (
            <Link
              href="/dashboard"
              onMouseEnter={playHoverFx}
              onClick={playSwitchFx}
              className="inline-block px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full text-xl font-semibold hover:from-indigo-500 hover:to-purple-500 transition-all transform hover:scale-105"
            >
              {t('landing.getStarted')} →
            </Link>
          ) : (
            <Link
              href="/auth?next=%2Fdashboard"
              onMouseEnter={playHoverFx}
              onClick={playSwitchFx}
              className="inline-block px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full text-xl font-semibold hover:from-indigo-500 hover:to-purple-500 transition-all transform hover:scale-105"
            >
              {t('auth.loginOrRegister')} →
            </Link>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-8 mt-16">
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-indigo-500/30 hover:border-indigo-500/60 transition-all">
            <div className="text-5xl mb-4">🦞</div>
            <h3 className="text-2xl font-bold text-indigo-300 mb-2">
              {t('landing.features.collect.title')}
            </h3>
            <p className="text-slate-400">
              {t('landing.features.collect.description')}
            </p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-purple-500/30 hover:border-purple-500/60 transition-all">
            <div className="text-5xl mb-4">🦞</div>
            <h3 className="text-2xl font-bold text-purple-300 mb-2">
              {t('landing.features.battle.title')}
            </h3>
            <p className="text-slate-400">
              {t('landing.features.battle.description')}
            </p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-amber-500/30 hover:border-amber-500/60 transition-all">
            <div className="text-5xl mb-4">🦞</div>
            <h3 className="text-2xl font-bold text-amber-300 mb-2">
              {t('landing.features.breed.title')}
            </h3>
            <p className="text-slate-400">
              {t('landing.features.breed.description')}
            </p>
          </div>
        </div>

        <section className="mt-16">
          <h3 className="text-2xl font-bold text-white text-center mb-3">{t('landing.showcaseTitle')}</h3>
          <p className="text-center text-slate-400 mb-6">{t('landing.showcaseDesc')}</p>
          <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {showcasePets.map((pet) => (
              <div key={pet.id} className="bg-slate-800/55 rounded-2xl p-5 border border-slate-600/60">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-lg font-semibold text-white">{t(pet.nameKey)}</h4>
                  <span className={`px-2 py-0.5 rounded text-xs ${genderStyles[pet.gender].badge} ${genderStyles[pet.gender].text}`}>
                    {pet.gender === 'male'
                      ? `♂ ${t('dashboard.gender.male')}`
                      : `♀ ${t('dashboard.gender.female')}`}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  {pet.element.map((element) => (
                    <span key={`${pet.id}-${element}`} className={elementStyles[element].text} title={t(`dashboard.element.${element}`)}>
                      {elementStyles[element].icon}
                    </span>
                  ))}
                  <span className="text-xs text-slate-300">{pet.element.map((element) => t(`dashboard.element.${element}`)).join('/')}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-slate-300">
                    {t('dashboard.pet.level')} <span className="text-white">{pet.level}</span>
                  </span>
                  <span className="text-slate-300">
                    {t('dashboard.attack')} <span className="text-red-300">{pet.attack}</span>
                  </span>
                  <span className="text-slate-300">
                    {t('dashboard.defense')} <span className="text-blue-300">{pet.defense}</span>
                  </span>
                  <span className="text-slate-300">
                    {t('dashboard.pet.hp')} <span className="text-green-300">{pet.hp}/{pet.maxHp}</span>
                  </span>
                  <span className="text-slate-300 col-span-2">
                    {t('dashboard.pet.mp')} <span className="text-cyan-300">{pet.mp}/{pet.maxMp}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-20 text-center">
          <div className="inline-flex gap-8 md:gap-16">
            <div>
              <div className="text-4xl font-bold text-indigo-400">500+</div>
              <div className="text-slate-500">{t('landing.stats.wallets')}</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-purple-400">1,200+</div>
              <div className="text-slate-500">{t('landing.stats.pets')}</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-amber-400">8,000+</div>
              <div className="text-slate-500">{t('landing.stats.battles')}</div>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 text-center py-8 text-slate-500">
        <p>{t('landing.footer')}</p>
      </footer>
    </div>
  );
}
