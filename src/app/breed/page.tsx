'use client';

import { useState } from 'react';
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
  rarity: string;
}

const elementColors: Record<Element, { bg: string; border: string; text: string; icon: string }> = {
  gold: { bg: 'bg-yellow-500/20', border: 'border-yellow-500', text: 'text-yellow-400', icon: '🪙' },
  wood: { bg: 'bg-green-500/20', border: 'border-green-500', text: 'text-green-400', icon: '🪵' },
  water: { bg: 'bg-blue-500/20', border: 'border-blue-500', text: 'text-blue-400', icon: '💧' },
  fire: { bg: 'bg-red-500/20', border: 'border-red-500', text: 'text-red-400', icon: '🔥' },
  earth: { bg: 'bg-amber-700/20', border: 'border-amber-600', text: 'text-amber-500', icon: '🪨' },
};

export default function Breed() {
  const { t } = useTranslation();
  const { isConnected } = useAccount();
  const [selectedPets, setSelectedPets] = useState<number[]>([]);
  const [breeding, setBreeding] = useState(false);
  const [result, setResult] = useState<{ name: string; element: Element; gender: Gender; rarity: string } | null>(null);

  const myPets: Pet[] = [
    { id: 1, name: '小红龙', element: 'fire', gender: 'male', level: 5, rarity: 'rare' },
    { id: 2, name: '小蓝龙', element: 'water', gender: 'female', level: 3, rarity: 'epic' },
    { id: 3, name: '小金龙', element: 'gold', gender: 'male', level: 1, rarity: 'common' },
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
      const elements: Element[] = ['gold', 'wood', 'water', 'fire', 'earth'];
      const genders: Gender[] = ['male', 'female'];
      const rarities = ['common', 'rare', 'epic', 'legendary'];
      
      const parent1 = myPets.find(p => p.id === selectedPets[0])!;
      const parent2 = myPets.find(p => p.id === selectedPets[1])!;
      
      // Inherit one element from parents randomly
      const inheritedElement = Math.random() > 0.5 ? parent1.element : parent2.element;
      const newElement = Math.random() > 0.3 ? inheritedElement : elements[Math.floor(Math.random() * elements.length)];
      
      setResult({
        element: newElement,
        gender: genders[Math.floor(Math.random() * genders.length)],
        rarity: rarities[Math.floor(Math.random() * rarities.length)],
        name: `小龙龙${Math.floor(Math.random() * 100)}`
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
            <Link href="/breed" className="text-indigo-400 hover:text-indigo-300">
              {t('nav.breed')}
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
        <h1 className="text-3xl font-bold text-white text-center mb-8">🐣 繁殖系统</h1>

        <div className="max-w-2xl mx-auto">
          <p className="text-center text-slate-400 mb-8">
            选择两只龙虾进行繁殖，有机会获得稀有属性的宝宝！
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
                    : `border-slate-600 bg-slate-800 hover:border-slate-500 ${elementColors[pet.element].bg}`
                }`}
              >
                {/* Element & Gender */}
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xl">{elementColors[pet.element].icon}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${pet.gender === 'male' ? 'bg-red-500/30 text-red-400' : 'bg-pink-500/30 text-pink-400'}`}>
                    {pet.gender === 'male' ? '♂' : '♀'}
                  </span>
                </div>
                <div className="text-4xl text-center mb-2">🦞</div>
                <div className="text-white font-medium text-center">{pet.name}</div>
                <div className={`text-center text-xs mt-1 ${elementColors[pet.element].text}`}>
                  {pet.element.toUpperCase()}
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
              <div className={`inline-block text-9xl p-6 rounded-full ${elementColors[result.element].bg}`}>
                🦞
              </div>
              <h3 className="text-3xl font-bold text-white mt-4">{result.name}</h3>
              
              {/* Element */}
              <div className="flex justify-center items-center gap-2 mt-2">
                <span className="text-2xl">{elementColors[result.element].icon}</span>
                <span className={`text-xl ${elementColors[result.element].text}`}>
                  {result.element.toUpperCase()}
                </span>
              </div>
              
              {/* Gender */}
              <span className={`inline-block mt-2 px-3 py-1 rounded-full ${result.gender === 'male' ? 'bg-red-500/30 text-red-400' : 'bg-pink-500/30 text-pink-400'}`}>
                {result.gender === 'male' ? '♂ 公' : '♀ 母'}
              </span>

              {/* Rarity */}
              <p className={`text-xl mt-4 ${
                result.rarity === 'legendary' ? 'text-amber-400' :
                result.rarity === 'epic' ? 'text-purple-400' :
                result.rarity === 'rare' ? 'text-blue-400' : 'text-slate-400'
              }`}>
                {result.rarity.toUpperCase()}!
              </p>
              <p className="text-slate-400 mt-2">
                新宝宝已添加到你的收藏！
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
