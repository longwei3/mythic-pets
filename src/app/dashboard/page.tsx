'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useContractRead, useContractWrite } from 'wagmi';
import Link from 'next/link';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export default function Dashboard() {
  const { t } = useTranslation();
  const { isConnected, address } = useAccount();
  const [pets, setPets] = useState<any[]>([]);

  // Mock data - will replace with contract calls
  useEffect(() => {
    if (isConnected) {
      setPets([
        {
          id: 1,
          name: '小青龙',
          level: 5,
          exp: 1200,
          maxExp: 2000,
          attack: 45,
          defense: 30,
          hp: 100,
          maxHp: 100,
          rarity: 'rare',
          image: '🐉'
        }
      ]);
    }
  }, [isConnected]);

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'common': return 'text-slate-400 border-slate-500';
      case 'rare': return 'text-blue-400 border-blue-500';
      case 'epic': return 'text-purple-400 border-purple-500';
      case 'legendary': return 'text-amber-400 border-amber-500';
      case 'mythic': return 'text-red-400 border-red-500';
      default: return 'text-slate-400 border-slate-500';
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl text-white mb-4">请先连接钱包</h2>
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-800/50 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🦄</span>
            <span className="text-xl font-bold text-white">MythicPets</span>
          </Link>
          <nav className="flex gap-4 ml-8">
            <Link href="/dashboard" className="text-indigo-400 hover:text-indigo-300">
              {t('dashboard')}
            </Link>
            <Link href="/battle" className="text-slate-400 hover:text-white">
              {t('battle')}
            </Link>
            <Link href="/breed" className="text-slate-400 hover:text-white">
              {t('breed')}
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          <ConnectButton />
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-8">{t('dashboard.title')}</h1>

        {pets.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🥚</div>
            <p className="text-xl text-slate-400 mb-8">{t('dashboard.noPets')}</p>
            <button className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full text-xl font-semibold hover:from-indigo-500 hover:to-purple-500 transition-all">
              {t('dashboard.claimFree')}
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pets.map((pet) => (
              <div
                key={pet.id}
                className={`bg-slate-800 rounded-2xl p-6 border-2 ${getRarityColor(pet.rarity)}`}
              >
                <div className="text-8xl text-center mb-4">{pet.image}</div>
                <h3 className="text-2xl font-bold text-center mb-2">{pet.name}</h3>
                <div className="text-center mb-4">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium bg-slate-700`}>
                    {t(`dashboard.rarity.${pet.rarity}`)}
                  </span>
                </div>

                {/* Stats */}
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400">{t('dashboard.pet.level')}</span>
                    <span className="text-white font-bold">{pet.level}</span>
                  </div>
                  
                  {/* EXP Bar */}
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">{t('dashboard.pet.exp')}</span>
                      <span className="text-indigo-400">{pet.exp}/{pet.maxExp}</span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all"
                        style={{ width: `${(pet.exp / pet.maxExp) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* HP Bar */}
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">{t('dashboard.pet.hp')}</span>
                      <span className="text-green-400">{pet.hp}/{pet.maxHp}</span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-green-500 transition-all"
                        style={{ width: `${(pet.hp / pet.maxHp) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex justify-between pt-2">
                    <span className="text-slate-400">{t('dashboard.pet.attack')}</span>
                    <span className="text-red-400 font-bold">{pet.attack}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{t('dashboard.pet.defense')}</span>
                    <span className="text-blue-400 font-bold">{pet.defense}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-6">
                  <Link
                    href="/battle"
                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-center font-medium transition-colors"
                  >
                    ⚔️ {t('battle')}
                  </Link>
                  <Link
                    href="/breed"
                    className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-center font-medium transition-colors"
                  >
                    🐣 {t('breed')}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
