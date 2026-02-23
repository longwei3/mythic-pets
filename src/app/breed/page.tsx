'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { playBreedSound } from '@/lib/sounds';

type Element = 'gold' | 'wood' | 'water' | 'fire' | 'earth';
type Gender = 'male' | 'female';

interface Pet {
  id: number;
  name: string;
  element: Element;
  gender: Gender;
  level: number;
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

// 4小时 = 14400秒
const BREEDING_TIME_SECONDS = 4 * 60 * 60;
// 演示模式用 10 秒
const DEMO_MODE = true;
const DEMO_BREEDING_TIME = 10;

export default function Breed() {
  const { t } = useTranslation();
  const { isConnected } = useAccount();
  const [selectedPets, setSelectedPets] = useState<number[]>([]);
  const [breeding, setBreeding] = useState(false);
  const [breedStartTime, setBreedStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [result, setResult] = useState<{ name: string; element: Element; gender: Gender; rarity: string; generation?: number } | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const myPets: Pet[] = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('myPets') || '[]') : [];

  // 计时器
  useEffect(() => {
    if (breeding && breedStartTime) {
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - breedStartTime) / 1000);
        setElapsedTime(elapsed);
        
        const breedingTime = DEMO_MODE ? DEMO_BREEDING_TIME : BREEDING_TIME_SECONDS;
        
        if (elapsed >= breedingTime) {
          if (timerRef.current) clearInterval(timerRef.current);
          finishBreeding();
        }
      }, 1000);
    }
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [breeding, breedStartTime]);

  const finishBreeding = () => {
    playBreedSound();
    const elements: Element[] = ['gold', 'wood', 'water', 'fire', 'earth'];
    const genders: Gender[] = ['male', 'female'];
    const rarities = ['common', 'rare', 'epic', 'legendary'];
    
    const parent1 = myPets.find(p => p.id === selectedPets[0])!;
    const parent2 = myPets.find(p => p.id === selectedPets[1])!;
    
    // 计算代数：取父母代数的最大值 + 1
    const parent1Gen = parent1.generation || 1;
    const parent2Gen = parent2.generation || 1;
    const newGeneration = Math.max(parent1Gen, parent2Gen) + 1;
    
    const inheritedElement = Math.random() > 0.5 ? parent1.element : parent2.element;
    const newElement = Math.random() > 0.3 ? inheritedElement : elements[Math.floor(Math.random() * elements.length)];
    
    const newPet = {
      element: newElement,
      gender: genders[Math.floor(Math.random() * genders.length)] as Gender,
      rarity: rarities[Math.floor(Math.random() * rarities.length)],
      name: `小龙龙${Math.floor(Math.random() * 1000)}`,
      level: 1,
      generation: newGeneration,
      exp: 0,
      maxExp: 100,
      attack: 15 + Math.floor(Math.random() * 10),
      defense: 10 + Math.floor(Math.random() * 8),
      hp: 45 + Math.floor(Math.random() * 15),
      maxHp: 45 + Math.floor(Math.random() * 15),
    };
    
    setResult({
      element: newPet.element,
      gender: newPet.gender,
      rarity: newPet.rarity,
      name: newPet.name,
      generation: newPet.generation
    });
    
    // 保存到 localStorage - 获取已有宠物并添加新宠物
    const existingPets = JSON.parse(localStorage.getItem('myPets') || '[]');
    const newPetWithId = { ...newPet, id: Date.now() };
    localStorage.setItem('myPets', JSON.stringify([...existingPets, newPetWithId]));
    
    setBreeding(false);
    setBreedStartTime(null);
    setElapsedTime(0);
  };

  const startBreeding = () => {
    if (selectedPets.length !== 2) return;
    
    setBreeding(true);
    setResult(null);
    setBreedStartTime(Date.now());
    setElapsedTime(0);
  };

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (DEMO_MODE) {
      return `${secs}秒`;
    }
    
    if (hrs > 0) {
      return `${hrs}小时${mins}分${secs}秒`;
    } else if (mins > 0) {
      return `${mins}分${secs}秒`;
    } else {
      return `${secs}秒`;
    }
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
    if (breeding) return;
    if (selectedPets.includes(id)) {
      setSelectedPets(selectedPets.filter(p => p !== id));
    } else if (selectedPets.length < 2) {
      setSelectedPets([...selectedPets, id]);
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

        {DEMO_MODE && (
          <div className="text-center mb-4">
            <span className="px-4 py-2 bg-yellow-500/20 text-yellow-400 rounded-full text-sm">
              ⚠️ 演示模式：10秒完成 | 正式版：4小时
            </span>
          </div>
        )}

        <div className="max-w-2xl mx-auto">
          <p className="text-center text-slate-400 mb-8">
            选择两只龙虾进行繁殖，需要 {DEMO_MODE ? '10秒' : '4小时'} 才能孵化出宝宝！
          </p>

          {/* Pet Selection */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {myPets.map((pet) => (
              <button
                key={pet.id}
                onClick={() => togglePet(pet.id)}
                disabled={breeding}
                className={`p-4 rounded-xl border-2 transition-all ${
                  selectedPets.includes(pet.id)
                    ? 'border-indigo-500 bg-indigo-500/20'
                    : `border-slate-600 bg-slate-800 hover:border-slate-500 ${elementColors[pet.element].bg}`
                } ${breeding ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
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

          {/* Breeding Progress */}
          {breeding && (
            <div className="mb-8 text-center">
              <div className="text-6xl mb-4 animate-pulse">🥚</div>
              <h3 className="text-xl text-white mb-4">孵化中...</h3>
              
              {/* 倒计时 */}
              <div className="bg-slate-800 rounded-2xl p-6 max-w-sm mx-auto mb-4">
                <p className="text-slate-400 text-sm mb-2">剩余时间</p>
                <p className="text-4xl font-bold text-indigo-400">
                  {formatTime(getRemainingTime())}
                </p>
              </div>
              
              {/* 进度条 */}
              <div className="w-full max-w-md mx-auto h-4 bg-slate-700 rounded-full overflow-hidden mb-4">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all"
                  style={{ width: `${getProgress()}%` }}
                />
              </div>
              
              <p className="text-sm text-slate-500">
                {DEMO_MODE ? '⚡ 演示模式加速中' : '⛽ 区块链确认中，请耐心等待'}
              </p>
            </div>
          )}

          {/* Breed Button */}
          {!breeding && (
            <div className="text-center">
              <button
                onClick={startBreeding}
                disabled={selectedPets.length !== 2}
                className={`px-8 py-4 rounded-full text-xl font-semibold transition-all ${
                  selectedPets.length === 2
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 transform hover:scale-105'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                🐣 开始繁殖
              </button>
            </div>
          )}

          {/* Breeding Result */}
          {result && !breeding && (
            <div className="mt-12 text-center animate-fade-in">
              <div className={`inline-block text-9xl p-6 rounded-full ${elementColors[result.element].bg}`}>
                🦞
              </div>
              <h3 className="text-3xl font-bold text-white mt-4">{result.name}</h3>
              
              {/* 代数 */}
              <p className="text-lg text-indigo-400 mt-1">
                第 {result.generation || 1} 代
              </p>
              
              <div className="flex justify-center items-center gap-2 mt-2">
                <span className="text-2xl">{elementColors[result.element].icon}</span>
                <span className={`text-xl ${elementColors[result.element].text}`}>
                  {result.element.toUpperCase()}
                </span>
              </div>
              
              <span className={`inline-block mt-2 px-3 py-1 rounded-full ${result.gender === 'male' ? 'bg-red-500/30 text-red-400' : 'bg-pink-500/30 text-pink-400'}`}>
                {result.gender === 'male' ? '♂ 公' : '♀ 母'}
              </span>

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
              
              <div className="mt-6">
                <Link
                  href="/dashboard"
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-medium"
                >
                  查看我的宠物 🐠
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
