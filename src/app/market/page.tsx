'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { playClickSound } from '@/lib/sounds';

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
  price?: number;
  forSale?: boolean;
}

const elementColors: Record<Element, { bg: string; border: string; text: string; icon: string }> = {
  gold: { bg: 'bg-yellow-500/20', border: 'border-yellow-500', text: 'text-yellow-400', icon: '🪙' },
  wood: { bg: 'bg-green-500/20', border: 'border-green-500', text: 'text-green-400', icon: '🪵' },
  water: { bg: 'bg-blue-500/20', border: 'border-blue-500', text: 'text-blue-400', icon: '💧' },
  fire: { bg: 'bg-red-500/20', border: 'border-red-500', text: 'text-red-400', icon: '🔥' },
  earth: { bg: 'bg-amber-700/20', border: 'border-amber-600', text: 'text-amber-500', icon: '🪨' },
};

// 市场宠物数据（模拟其他玩家挂单的宠物）
const marketPets: Pet[] = [
  { id: 101, name: '神龙', element: 'fire', gender: 'male', level: 10, exp: 5000, maxExp: 10000, attack: 80, defense: 50, hp: 200, maxHp: 200, rarity: 'legendary', generation: 2, price: 0.05, forSale: true },
  { id: 102, name: '水灵', element: 'water', gender: 'female', level: 8, exp: 3000, maxExp: 5000, attack: 60, defense: 45, hp: 180, maxHp: 180, rarity: 'epic', generation: 1, price: 0.02, forSale: true },
  { id: 103, name: '金砖', element: 'gold', gender: 'male', level: 5, exp: 1000, maxExp: 2000, attack: 40, defense: 35, hp: 100, maxHp: 100, rarity: 'rare', generation: 1, price: 0.01, forSale: true },
  { id: 104, name: '木木', element: 'wood', gender: 'female', level: 3, exp: 500, maxExp: 1000, attack: 30, defense: 25, hp: 80, maxHp: 80, rarity: 'common', generation: 1, price: 0.005, forSale: true },
  { id: 105, name: '土蛋', element: 'earth', gender: 'male', level: 6, exp: 2000, maxExp: 3000, attack: 50, defense: 40, hp: 120, maxHp: 120, rarity: 'rare', generation: 1, price: 0.008, forSale: true },
];

export default function Market() {
  const { t } = useTranslation();
  const { isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
  const [myListedPets, setMyListedPets] = useState<Pet[]>([]);

  useEffect(() => {
    if (isConnected) {
      const saved = localStorage.getItem('myListedPets');
      if (saved) {
        setMyListedPets(JSON.parse(saved));
      }
    }
  }, [isConnected]);

  const handleBuy = (pet: Pet) => {
    playClickSound();
    alert(`购买 ${pet.name} 需要 ${pet.price} ETH\n\n这是演示版本，实际购买需要连接钱包和智能合约！`);
  };

  const handleListForSale = (petId: number) => {
    playClickSound();
    // 从我的宠物列表获取
    const myPets = JSON.parse(localStorage.getItem('myPets') || '[]');
    const pet = myPets.find((p: Pet) => p.id === petId);
    if (pet) {
      const price = prompt('设置价格 (ETH):', '0.01');
      if (price) {
        const listedPet = { ...pet, price: parseFloat(price), forSale: true };
        const newListed = [...myListedPets, listedPet];
        setMyListedPets(newListed);
        localStorage.setItem('myListedPets', JSON.stringify(newListed));
        alert(`${pet.name} 已挂单！`);
      }
    }
  };

  const handleRemoveFromSale = (petId: number) => {
    playClickSound();
    const newListed = myListedPets.filter(p => p.id !== petId);
    setMyListedPets(newListed);
    localStorage.setItem('myListedPets', JSON.stringify(newListed));
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
            <span className="text-2xl">🦞</span>
            <span className="text-xl font-bold text-white">Lobster Ranch</span>
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
            <Link href="/market" className="text-indigo-400 hover:text-indigo-300">
              🏪 市场
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          <ConnectButton />
        </div>
      </header>

      {/* Market */}
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white text-center mb-8">🏪 NFT 市场</h1>

        {/* Tabs */}
        <div className="flex justify-center gap-4 mb-8">
          <button
            onClick={() => setActiveTab('buy')}
            className={`px-6 py-3 rounded-xl font-medium transition-all ${
              activeTab === 'buy'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            🛒 购买
          </button>
          <button
            onClick={() => setActiveTab('sell')}
            className={`px-6 py-3 rounded-xl font-medium transition-all ${
              activeTab === 'sell'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            💰 出售
          </button>
        </div>

        {/* Buy Tab */}
        {activeTab === 'buy' && (
          <div>
            <p className="text-center text-slate-400 mb-6">购买其他玩家出售的龙虾 NFT</p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {marketPets.map((pet) => (
                <div
                  key={pet.id}
                  className={`bg-slate-800 rounded-2xl p-6 border-2 ${elementColors[pet.element].border}`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{elementColors[pet.element].icon}</span>
                      <div>
                        <h3 className="text-lg font-bold text-white">{pet.name}</h3>
                        {pet.generation && (
                          <span className="text-xs text-indigo-400">第{pet.generation}代</span>
                        )}
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs ${
                      pet.rarity === 'legendary' ? 'bg-amber-500/30 text-amber-400' :
                      pet.rarity === 'epic' ? 'bg-purple-500/30 text-purple-400' :
                      pet.rarity === 'rare' ? 'bg-blue-500/30 text-blue-400' :
                      'bg-slate-500/30 text-slate-400'
                    }`}>
                      {pet.rarity}
                    </span>
                  </div>

                  <div className="text-center mb-4">
                    <div className={`inline-block text-6xl p-4 rounded-full ${elementColors[pet.element].bg}`}>
                      🦞
                    </div>
                  </div>

                  <div className="space-y-2 text-sm mb-4">
                    <div className="flex justify-between">
                      <span className="text-slate-400">等级</span>
                      <span className="text-white">Lv.{pet.level}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">攻击</span>
                      <span className="text-red-400">{pet.attack}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">防御</span>
                      <span className="text-blue-400">{pet.defense}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t border-slate-700">
                    <div>
                      <span className="text-xs text-slate-400">价格</span>
                      <p className="text-xl font-bold text-green-400">Ξ {pet.price}</p>
                    </div>
                    <button
                      onClick={() => handleBuy(pet)}
                      className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-medium"
                    >
                      购买
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sell Tab */}
        {activeTab === 'sell' && (
          <div>
            <p className="text-center text-slate-400 mb-6">出售你的龙虾 NFT</p>
            
            {/* My Listed Pets */}
            {myListedPets.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-bold text-white mb-4">已挂单</h2>
                <div className="grid md:grid-cols-3 gap-4">
                  {myListedPets.map((pet) => (
                    <div key={pet.id} className="bg-slate-800 rounded-xl p-4 border border-indigo-500">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span>{elementColors[pet.element].icon}</span>
                          <span className="text-white font-medium">{pet.name}</span>
                        </div>
                        <span className="text-green-400">Ξ {pet.price}</span>
                      </div>
                      <button
                        onClick={() => handleRemoveFromSale(pet.id)}
                        className="mt-2 w-full px-3 py-1 bg-red-600/50 hover:bg-red-600 rounded text-sm"
                      >
                        下架
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* My Pets for Sale */}
            <div>
              <h2 className="text-xl font-bold text-white mb-4">我的宠物（点击挂单）</h2>
              <div className="grid md:grid-cols-3 gap-4">
                {(() => {
                  const myPets = JSON.parse(localStorage.getItem('myPets') || '[]');
                  return myPets.map((pet: Pet) => (
                    <div key={pet.id} className="bg-slate-800 rounded-xl p-4 border border-slate-600 hover:border-indigo-500 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <span>{elementColors[pet.element].icon}</span>
                          <div>
                            <span className="text-white font-medium">{pet.name}</span>
                            {pet.generation && (
                              <span className="ml-1 text-xs text-indigo-400">第{pet.generation}代</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 mb-2">
                        Lv.{pet.level} • {pet.attack}⚔️ {pet.defense}🛡️
                      </div>
                      <button
                        onClick={() => handleListForSale(pet.id)}
                        className="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm"
                      >
                        挂单出售
                      </button>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
