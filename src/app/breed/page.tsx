'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export default function Breed() {
  const { t } = useTranslation();
  const { isConnected } = useAccount();
  const [selectedPets, setSelectedPets] = useState<number[]>([]);
  const [breeding, setBreeding] = useState(false);
  const [result, setResult] = useState<{ name: string; rarity: string; image: string } | null>(null);

  const myPets = [
    { id: 1, name: '小青龙', rarity: 'rare', image: '🐉', level: 5 },
    { id: 2, name: '小火凤', rarity: 'epic', image: '🐦', level: 3 },
    { id: 3, name: '小白虎', rarity: 'common', image: '🐯', level: 1 },
  ];

  const togglePet = (id: number) => {
    if (selectedPets.includes(id)) {
      setSelectedPets(selectedPets.filter(p => p !== id));
    } else if (selectedPets.length < 2) {
      setSelectedPets([...selectedPets, id]);
    }
  };

  const startBreeding = () => {
    if (selectedPets.length !== 2) return;
    
    setBreeding(true);
    setResult(null);
    
    // Simulate breeding
    setTimeout(() => {
      const rarities = ['common', 'rare', 'epic', 'legendary'];
      const randomRarity = rarities[Math.floor(Math.random() * rarities.length)];
      const images = ['🐲', '🦁', '🦊', '🐻', '🦄'];
      const names = ['神兽', '灵兽', '仙兽', '圣兽'];
      
      setResult({
        name: names[Math.floor(Math.random() * names.length)],
        rarity: randomRarity,
        image: images[Math.floor(Math.random() * images.length)]
      });
      setBreeding(false);
    }, 3000);
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
            <Link href="/dashboard" className="text-slate-400 hover:text-white">
              {t('dashboard')}
            </Link>
            <Link href="/battle" className="text-slate-400 hover:text-white">
              {t('battle')}
            </Link>
            <Link href="/breed" className="text-indigo-400 hover:text-indigo-300">
              {t('breed')}
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          <ConnectButton />
        </div>
      </header>

      {/* Breed Page */}
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white text-center mb-8">{t('breed')}</h1>

        <div className="max-w-2xl mx-auto">
          <p className="text-center text-slate-400 mb-8">
            选择两只宠物进行繁殖，有机会获得稀有或史诗级宠物！
          </p>

          {/* Pet Selection */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {myPets.map((pet) => (
              <button
                key={pet.id}
                onClick={() => togglePet(pet.id)}
                className={`p-4 rounded-xl border-2 transition-all ${
                  selectedPets.includes(pet.id)
                    ? 'border-indigo-500 bg-indigo-500/20'
                    : 'border-slate-600 bg-slate-800 hover:border-slate-500'
                }`}
              >
                <div className="text-5xl text-center mb-2">{pet.image}</div>
                <div className="text-white font-medium text-center">{pet.name}</div>
                <div className={`text-center text-sm mt-1 ${
                  pet.rarity === 'epic' ? 'text-purple-400' :
                  pet.rarity === 'rare' ? 'text-blue-400' : 'text-slate-400'
                }`}>
                  {pet.rarity}
                </div>
              </button>
            ))}
          </div>

          {/* Breed Button */}
          <div className="text-center">
            <button
              onClick={startBreeding}
              disabled={selectedPets.length !== 2 || breeding}
              className={`px-8 py-4 rounded-full text-xl font-semibold transition-all ${
                selectedPets.length === 2 && !breeding
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 transform hover:scale-105'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              {breeding ? '🥚 繁殖中...' : '🐣 开始繁殖'}
            </button>
          </div>

          {/* Breeding Result */}
          {result && (
            <div className="mt-12 text-center animate-fade-in">
              <div className="text-8xl mb-4">{result.image}</div>
              <h3 className="text-3xl font-bold text-white mb-2">{result.name}</h3>
              <p className={`text-xl mb-4 ${
                result.rarity === 'legendary' ? 'text-amber-400' :
                result.rarity === 'epic' ? 'text-purple-400' :
                result.rarity === 'rare' ? 'text-blue-400' : 'text-slate-400'
              }`}>
                {result.rarity.toUpperCase()}!
              </p>
              <p className="text-slate-400">
                新宠物已添加到你的收藏！
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
