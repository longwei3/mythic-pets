'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import LanguageSwitcher from '@/components/LanguageSwitcher';

type Element = 'gold' | 'wood' | 'water' | 'fire' | 'earth';
type Gender = 'male' | 'female';

interface Pet {
  id: number;
  name: string;
  element: Element;
  gender: Gender;
  level: number;
  exp: number;
  maxExp: number;
  attack: number;
  defense: number;
  hp: number;
  maxHp: number;
  rarity: string;
  generation?: number;
}

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

export default function Dashboard() {
  const { t } = useTranslation();
  const { isConnected } = useAccount();
  const [pets, setPets] = useState<Pet[]>([]);

  useEffect(() => {
    if (isConnected) {
      // 先检查 localStorage
      const savedPets = localStorage.getItem('myPets');
      if (savedPets) {
        setPets(JSON.parse(savedPets));
      } else {
        // 创世宠物：一公一母
        const starterPets = [
          {
            id: 1,
            name: '小火龙',
            element: 'fire' as Element,
            gender: 'male' as Gender,
            level: 1,
            exp: 0,
            maxExp: 100,
            attack: 20,
            defense: 10,
            hp: 50,
            maxHp: 50,
            rarity: 'common'
          },
          {
            id: 2,
            name: '小水龙',
            element: 'water' as Element,
            gender: 'female' as Gender,
            level: 1,
            exp: 0,
            maxExp: 100,
            attack: 18,
            defense: 12,
            hp: 55,
            maxHp: 55,
            rarity: 'common'
          }
        ];
        setPets(starterPets);
        localStorage.setItem('myPets', JSON.stringify(starterPets));
      }
    }
  }, [isConnected]);

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
            <span className="text-2xl">🦞</span>
            <span className="text-xl font-bold text-white">Lobster Ranch</span>
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
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          <ConnectButton />
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-8">🐠 我的龙虾收藏</h1>

        {pets.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-8xl mb-4">🦞</div>
            <p className="text-xl text-slate-400 mb-8">还没有龙虾，快去领取吧！</p>
            <button className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full text-xl font-semibold">
              🆓 免费领取龙虾
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pets.map((pet) => (
              <div
                key={pet.id}
                className={`bg-slate-800 rounded-2xl p-6 border-2 ${elementColors[pet.element].border}`}
              >
                {/* Header */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-4xl">{elementColors[pet.element].icon}</span>
                    <div>
                      <h3 className="text-xl font-bold text-white">{pet.name}</h3>
                      <span className={`text-sm ${elementColors[pet.element].text}`}>
                        {pet.element.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs ${genderColors[pet.gender].bg} ${genderColors[pet.gender].color}`}>
                    {pet.gender === 'male' ? '♂ 公' : '♀ 母'}
                  </span>
                </div>

                {/* Image */}
                <div className="text-center mb-4">
                  <div className={`inline-block text-8xl p-4 rounded-full ${genderColors[pet.gender].bg}`}>
                    🦞
                  </div>
                </div>

                {/* Level & Rarity */}
                <div className="text-center mb-4">
                  <span className="text-2xl font-bold text-white">Lv.{pet.level}</span>
                  {pet.generation && (
                    <span className="ml-2 px-2 py-1 bg-indigo-500/30 rounded text-sm text-indigo-300">
                      第{pet.generation}代
                    </span>
                  )}
                  <span className="ml-2 px-2 py-1 bg-slate-700 rounded text-sm text-slate-300">
                    {t(`dashboard.rarity.${pet.rarity}`)}
                  </span>
                </div>

                {/* Stats */}
                <div className="space-y-3">
                  {/* EXP Bar */}
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">经验</span>
                      <span className="text-indigo-400">{pet.exp}/{pet.maxExp}</span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                        style={{ width: `${(pet.exp / pet.maxExp) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* HP Bar */}
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">生命</span>
                      <span className="text-green-400">{pet.hp}/{pet.maxHp}</span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-green-500"
                        style={{ width: `${(pet.hp / pet.maxHp) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">攻击</span>
                    <span className="text-red-400 font-bold">{pet.attack}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">防御</span>
                    <span className="text-blue-400 font-bold">{pet.defense}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-6">
                  <Link
                    href="/battle"
                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-center font-medium"
                  >
                    ⚔️ 战斗
                  </Link>
                  <Link
                    href="/breed"
                    className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-center font-medium"
                  >
                    🐣 繁殖
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
