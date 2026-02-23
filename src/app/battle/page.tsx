'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import LanguageSwitcher from '@/components/LanguageSwitcher';

interface Pet {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  image: string;
}

export default function Battle() {
  const { t } = useTranslation();
  const { isConnected } = useAccount();
  const [battleState, setBattleState] = useState<'idle' | 'fighting' | 'victory' | 'defeat'>('idle');
  const [playerPet, setPlayerPet] = useState<Pet>({
    name: '小红龙',
    level: 5,
    hp: 100,
    maxHp: 100,
    attack: 45,
    defense: 30,
    image: '🦞'
  });
  const [enemyPet, setEnemyPet] = useState<Pet>({
    name: '麻辣小龙虾',
    level: 4,
    hp: 80,
    maxHp: 80,
    attack: 35,
    defense: 20,
    image: '🦞'
  });
  const [logs, setLogs] = useState<string[]>([]);

  const attack = (isSpecial: boolean) => {
    if (battleState !== 'fighting') return;

    const damage = isSpecial 
      ? Math.floor(playerPet.attack * 1.5 - enemyPet.defense * 0.5)
      : Math.floor(playerPet.attack - enemyPet.defense * 0.5);
    
    const newEnemyHp = Math.max(0, enemyPet.hp - damage);
    setEnemyPet({ ...enemyPet, hp: newEnemyHp });
    
    setLogs(prev => [...prev, `你使用了${isSpecial ? '特殊技能' : '普通攻击'}，造成 ${damage} 伤害！`]);

    if (newEnemyHp <= 0) {
      setBattleState('victory');
      setLogs(prev => [...prev, `🎉 胜利！获得 100 经验和 10 $MYTH`]);
    } else {
      // Enemy counter attack
      setTimeout(() => {
        const enemyDamage = Math.floor(enemyPet.attack - playerPet.defense * 0.5);
        const newPlayerHp = Math.max(0, playerPet.hp - enemyDamage);
        setPlayerPet({ ...playerPet, hp: newPlayerHp });
        setLogs(prev => [...prev, `麻辣小龙虾反击，造成 ${enemyDamage} 伤害！`]);
        
        if (newPlayerHp <= 0) {
          setBattleState('defeat');
          setLogs(prev => [...prev, '💀 失败！再接再厉！']);
        }
      }, 800);
    }
  };

  const startBattle = () => {
    setBattleState('fighting');
    setPlayerPet({ ...playerPet, hp: playerPet.maxHp });
    setEnemyPet({ ...enemyPet, hp: enemyPet.maxHp });
    setLogs(['⚔️ 战斗开始！']);
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
            <span className="text-xl font-bold text-white">MythicPets</span>
          </Link>
          <nav className="flex gap-4 ml-8">
            <Link href="/dashboard" className="text-slate-400 hover:text-white">
              {t('dashboard')}
            </Link>
            <Link href="/battle" className="text-indigo-400 hover:text-indigo-300">
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

      {/* Battle Arena */}
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white text-center mb-8">{t('battle.title')}</h1>

        <div className="flex justify-around items-center mb-12">
          {/* Player Pet */}
          <div className="text-center">
            <div className="text-8xl mb-4">{playerPet.image}</div>
            <h3 className="text-xl font-bold text-white mb-2">{playerPet.name}</h3>
            <p className="text-slate-400 mb-2">Lv.{playerPet.level}</p>
            <div className="w-48 h-4 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-500 transition-all"
                style={{ width: `${(playerPet.hp / playerPet.maxHp) * 100}%` }}
              />
            </div>
            <p className="text-green-400 mt-1">{playerPet.hp}/{playerPet.maxHp} HP</p>
          </div>

          <div className="text-4xl">VS</div>

          {/* Enemy Pet */}
          <div className="text-center">
            <div className="text-8xl mb-4">{enemyPet.image}</div>
            <h3 className="text-xl font-bold text-white mb-2">{enemyPet.name}</h3>
            <p className="text-slate-400 mb-2">Lv.{enemyPet.level}</p>
            <div className="w-48 h-4 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-red-500 transition-all"
                style={{ width: `${(enemyPet.hp / enemyPet.maxHp) * 100}%` }}
              />
            </div>
            <p className="text-red-400 mt-1">{enemyPet.hp}/{enemyPet.maxHp} HP</p>
          </div>
        </div>

        {/* Battle Controls */}
        {battleState === 'idle' && (
          <div className="text-center">
            <button
              onClick={startBattle}
              className="px-8 py-4 bg-gradient-to-r from-red-600 to-orange-600 rounded-full text-xl font-semibold hover:from-red-500 hover:to-orange-500 transition-all transform hover:scale-105"
            >
              ⚔️ {t('battle.startBattle')}
            </button>
          </div>
        )}

        {battleState === 'fighting' && (
          <div className="flex justify-center gap-4">
            <button
              onClick={() => attack(false)}
              className="px-8 py-4 bg-slate-700 hover:bg-slate-600 rounded-xl text-lg font-medium transition-colors"
            >
              🗡️ {t('battle.attack')}
            </button>
            <button
              onClick={() => attack(true)}
              className="px-8 py-4 bg-purple-600 hover:bg-purple-500 rounded-xl text-lg font-medium transition-colors"
            >
              ✨ {t('battle.special')}
            </button>
          </div>
        )}

        {battleState === 'victory' && (
          <div className="text-center">
            <div className="text-6xl mb-4">🏆</div>
            <h2 className="text-4xl font-bold text-amber-400 mb-4">{t('battle.victory')}</h2>
            <p className="text-xl text-indigo-400 mb-6">+100 EXP, +10 $MYTH</p>
            <button
              onClick={startBattle}
              className="px-8 py-4 bg-slate-700 hover:bg-slate-600 rounded-xl text-lg font-medium"
            >
              再战
            </button>
          </div>
        )}

        {battleState === 'defeat' && (
          <div className="text-center">
            <div className="text-6xl mb-4">💀</div>
            <h2 className="text-4xl font-bold text-red-400 mb-4">{t('battle.defeat')}</h2>
            <button
              onClick={startBattle}
              className="px-8 py-4 bg-slate-700 hover:bg-slate-600 rounded-xl text-lg font-medium"
            >
              再来一次
            </button>
          </div>
        )}

        {/* Battle Logs */}
        {logs.length > 0 && (
          <div className="mt-12 max-w-xl mx-auto">
            <h3 className="text-lg font-bold text-white mb-4">战斗记录</h3>
            <div className="bg-slate-800 rounded-xl p-4 h-48 overflow-y-auto space-y-2">
              {logs.map((log, i) => (
                <p key={i} className="text-slate-300 text-sm">{log}</p>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
