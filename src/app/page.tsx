'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { localizePetName } from '@/lib/petNames';
import { formatCooldownTimer } from '@/lib/battleCooldown';
import { readActiveGatherTask, type GatherTask } from '@/lib/magicPotions';

export default function Home() {
  const { t } = useTranslation();
  const { isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);
  const [gatherTask, setGatherTask] = useState<GatherTask | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !isConnected) {
      setGatherTask(null);
      return;
    }

    const syncGatherTask = () => {
      setNowMs(Date.now());
      setGatherTask(readActiveGatherTask());
    };

    syncGatherTask();
    const timer = setInterval(syncGatherTask, 1000);
    return () => clearInterval(timer);
  }, [isConnected, mounted]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="text-3xl">🦞</span>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            {t('common.appName')}
          </h1>
        </div>
        <nav className="flex gap-4">
          <Link href="/dashboard" className="text-slate-400 hover:text-white">
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
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          {mounted && <ConnectButton />}
        </div>
      </header>

      <main className="container mx-auto px-4 py-16">
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
          {isConnected && gatherTask && (
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
                  className="inline-block px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm font-semibold"
                >
                  {t('nav.gather')}
                </Link>
              </div>
            </div>
          )}
          {isConnected && (
            <Link
              href="/dashboard"
              className="inline-block px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full text-xl font-semibold hover:from-indigo-500 hover:to-purple-500 transition-all transform hover:scale-105"
            >
              {t('landing.getStarted')} →
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

      <footer className="text-center py-8 text-slate-500">
        <p>{t('landing.footer')}</p>
      </footer>
    </div>
  );
}
