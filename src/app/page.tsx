'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export default function Home() {
  const { t } = useTranslation();
  const { isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="text-3xl">🦞</span>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            MythicPets
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          {mounted && <ConnectButton />}
        </div>
      </header>

      {/* Hero Section */}
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
          {isConnected && (
            <Link
              href="/dashboard"
              className="inline-block px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full text-xl font-semibold hover:from-indigo-500 hover:to-purple-500 transition-all transform hover:scale-105"
            >
              {t('landing.getStarted')} →
            </Link>
          )}
        </div>

        {/* Features */}
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

        {/* Stats */}
        <div className="mt-20 text-center">
          <div className="inline-flex gap-8 md:gap-16">
            <div>
              <div className="text-4xl font-bold text-indigo-400">500+</div>
              <div className="text-slate-500">Wallets</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-purple-400">1,200+</div>
              <div className="text-slate-500">Pets NFT</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-amber-400">8,000+</div>
              <div className="text-slate-500">Battles</div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-8 text-slate-500">
        <p>Built on Base • Powered by AI</p>
      </footer>
    </div>
  );
}
