'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { playAttackSound, playVictorySound, playDefeatSound } from '@/lib/sounds';

type Element = 'gold' | 'wood' | 'water' | 'fire' | 'earth';
type Gender = 'male' | 'female';

interface Pet {
  name: string;
  element: Element;
  gender: Gender;
  level: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  image: string;
}

const elementColors: Record<Element, { bg: string; border: string; text: string; icon: string }> = {
  gold: { bg: 'bg-yellow-500/20', border: 'border-yellow-500', text: 'text-yellow-400', icon: '🪙' },
  wood: { bg: 'bg-green-500/20', border: 'border-green-500', text: 'text-green-400', icon: '🪵' },
  water: { bg: 'bg-blue-500/20', border: 'border-blue-500', text: 'text-blue-400', icon: '💧' },
  fire: { bg: 'bg-red-500/20', border: 'border-red-500', text: 'text-red-400', icon: '🔥' },
  earth: { bg: 'bg-amber-700/20', border: 'border-amber-600', text: 'text-amber-500', icon: '🪨' },
};

const oceanEnemies = [
  { name: '小丑鱼', element: 'water' as Element, gender: 'male' as Gender, level: 3, hp: 60, maxHp: 60, attack: 25, defense: 15, image: '🐠' },
  { name: '章鱼哥', element: 'water' as Element, gender: 'male' as Gender, level: 4, hp: 80, maxHp: 80, attack: 35, defense: 20, image: '🐙' },
  { name: '螃蟹战士', element: 'earth' as Element, gender: 'male' as Gender, level: 5, hp: 100, maxHp: 100, attack: 40, defense: 30, image: '🦀' },
  { name: '鲨鱼博士', element: 'water' as Element, gender: 'male' as Gender, level: 6, hp: 120, maxHp: 120, attack: 50, defense: 25, image: '🦈' },
  { name: '鲸鱼老师', element: 'water' as Element, gender: 'female' as Gender, level: 7, hp: 150, maxHp: 150, attack: 45, defense: 35, image: '🐋' },
];

export default function Battle() {
  const { t } = useTranslation();
  const { isConnected } = useAccount();
  const [battleState, setBattleState] = useState<'idle' | 'fighting' | 'victory' | 'defeat'>('idle');
  const [playerPet, setPlayerPet] = useState<Pet>({
    name: '小红龙',
    element: 'fire',
    gender: 'male',
    level: 5,
    hp: 100,
    maxHp: 100,
    attack: 45,
    defense: 30,
    image: '🦞'
  });
  const [enemyPet, setEnemyPet] = useState<Pet>(oceanEnemies[0]);
  const [logs, setLogs] = useState<string[]>([]);
  const [attackEffect, setAttackEffect] = useState<'none' | 'hit' | 'special'>('none');
  const [shake, setShake] = useState(false);

  const startBattle = () => {
    const randomEnemy = oceanEnemies[Math.floor(Math.random() * oceanEnemies.length)];
    setEnemyPet(randomEnemy);
    setBattleState('fighting');
    setPlayerPet({ ...playerPet, hp: playerPet.maxHp });
    setEnemyPet({ ...randomEnemy, hp: randomEnemy.maxHp });
    setLogs(['⚔️ 战斗开始！']);
  };

  const attack = (isSpecial: boolean) => {
    if (battleState !== 'fighting') return;

    // Attack effect + sound
    setAttackEffect(isSpecial ? 'special' : 'hit');
    setShake(true);
    playAttackSound(isSpecial);
    
    setTimeout(() => {
      setAttackEffect('none');
      setShake(false);
    }, 500);

    const damage = isSpecial 
      ? Math.floor(playerPet.attack * 1.5 - enemyPet.defense * 0.5)
      : Math.floor(playerPet.attack - enemyPet.defense * 0.5);
    
    const newEnemyHp = Math.max(0, enemyPet.hp - damage);
    setEnemyPet({ ...enemyPet, hp: newEnemyHp });
    
    setLogs(prev => [...prev, `你使用了${isSpecial ? '🔥必杀技' : '⚔️普通攻击'}，造成 ${damage} 伤害！`]);

    if (newEnemyHp <= 0) {
      setBattleState('victory');
      playVictorySound();
      setLogs(prev => [...prev, `🎉 胜利！${enemyPet.name}被击败了！`, '🏆 获得 100 经验和 10 $MYTH']);
    } else {
      // Enemy counter attack
      setTimeout(() => {
        setShake(true);
        setTimeout(() => setShake(false), 500);
        
        const enemyDamage = Math.floor(enemyPet.attack - playerPet.defense * 0.5);
        const newPlayerHp = Math.max(0, playerPet.hp - enemyDamage);
        setPlayerPet({ ...playerPet, hp: newPlayerHp });
        setLogs(prev => [...prev, `${enemyPet.name}发起攻击，造成 ${enemyDamage} 伤害！`]);
        
        if (newPlayerHp <= 0) {
          setBattleState('defeat');
          playDefeatSound();
          setLogs(prev => [...prev, '💀 失败！你的龙虾倒下了...', '再接再厉，下次一定能赢！']);
        }
      }, 800);
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
            <Link href="/battle" className="text-indigo-400 hover:text-indigo-300">
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

      {/* Battle Arena */}
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white text-center mb-8">🌊 战斗竞技场 🌊</h1>

        {/* Battle Effects Overlay */}
        {attackEffect !== 'none' && (
          <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
            <div className={`text-9xl animate-ping ${attackEffect === 'special' ? 'text-red-500' : 'text-yellow-400'}`}>
              {attackEffect === 'special' ? '💥' : '⚡'}
            </div>
          </div>
        )}

        {/* Victory/Defeat Effects */}
        {battleState === 'victory' && (
          <div className="fixed inset-0 pointer-events-none z-40 flex items-center justify-center">
            <div className="text-9xl animate-bounce">🏆</div>
            <div className="absolute inset-0 bg-yellow-500/20 animate-pulse" />
          </div>
        )}
        {battleState === 'defeat' && (
          <div className="fixed inset-0 pointer-events-none z-40 flex items-center justify-center">
            <div className="text-9xl animate-pulse">💀</div>
            <div className="absolute inset-0 bg-red-500/20" />
          </div>
        )}

        <div className="flex justify-around items-center mb-12">
          {/* Player Pet */}
          <div className={`text-center transition-transform ${shake ? 'translate-x-2' : ''}`}>
            <div className="flex justify-center mb-2">
              <span className="text-2xl mr-2">{elementColors[playerPet.element].icon}</span>
              <span className={`px-2 py-0.5 rounded text-xs ${playerPet.gender === 'male' ? 'bg-red-500/30 text-red-400' : 'bg-pink-500/30 text-pink-400'}`}>
                {playerPet.gender === 'male' ? '♂' : '♀'}
              </span>
            </div>
            <div className="text-8xl mb-4 animate-pulse">{playerPet.image}</div>
            <h3 className="text-xl font-bold text-white mb-2">{playerPet.name}</h3>
            <p className="text-slate-400 mb-2">Lv.{playerPet.level} • {playerPet.element.toUpperCase()}</p>
            <div className="w-48 h-4 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-500 transition-all"
                style={{ width: `${(playerPet.hp / playerPet.maxHp) * 100}%` }}
              />
            </div>
            <p className="text-green-400 mt-1">{playerPet.hp}/{playerPet.maxHp} HP</p>
          </div>

          <div className="text-4xl font-bold text-slate-500">VS</div>

          {/* Enemy Pet */}
          <div className={`text-center transition-transform ${shake ? '-translate-x-2' : ''}`}>
            <div className="flex justify-center mb-2">
              <span className="text-2xl mr-2">{elementColors[enemyPet.element].icon}</span>
              <span className={`px-2 py-0.5 rounded text-xs ${enemyPet.gender === 'male' ? 'bg-red-500/30 text-red-400' : 'bg-pink-500/30 text-pink-400'}`}>
                {enemyPet.gender === 'male' ? '♂' : '♀'}
              </span>
            </div>
            <div className={`text-8xl mb-4 ${attackEffect !== 'none' ? 'animate-spin' : ''}`}>{enemyPet.image}</div>
            <h3 className="text-xl font-bold text-white mb-2">{enemyPet.name}</h3>
            <p className="text-slate-400 mb-2">Lv.{enemyPet.level} • {enemyPet.element.toUpperCase()}</p>
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
              className="px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-full text-xl font-semibold hover:from-blue-500 hover:to-cyan-500 transition-all transform hover:scale-105"
            >
              ⚔️ 开始战斗
            </button>
          </div>
        )}

        {battleState === 'fighting' && (
          <div className="flex justify-center gap-4">
            <button
              onClick={() => attack(false)}
              className="px-8 py-4 bg-slate-700 hover:bg-slate-600 rounded-xl text-lg font-medium transition-all hover:scale-105"
            >
              ⚔️ {t('battle.attack')}
            </button>
            <button
              onClick={() => attack(true)}
              className="px-8 py-4 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 rounded-xl text-lg font-medium transition-all hover:scale-105 animate-pulse"
            >
              🔥 {t('battle.special')}
            </button>
          </div>
        )}

        {battleState === 'victory' && (
          <div className="text-center">
            <div className="text-8xl mb-4 animate-bounce">🎉</div>
            <h2 className="text-5xl font-bold text-yellow-400 mb-4">{t('battle.victory')}</h2>
            <p className="text-2xl text-indigo-400 mb-6">+100 EXP, +10 $MYTH</p>
            <div className="flex justify-center gap-4">
              <button
                onClick={startBattle}
                className="px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 rounded-xl text-lg font-medium"
              >
                再战 🐠
              </button>
              <Link
                href="/dashboard"
                className="px-8 py-4 bg-slate-700 hover:bg-slate-600 rounded-xl text-lg font-medium"
              >
                返回 🏠
              </Link>
            </div>
          </div>
        )}

        {battleState === 'defeat' && (
          <div className="text-center">
            <div className="text-8xl mb-4 animate-pulse">💔</div>
            <h2 className="text-5xl font-bold text-red-400 mb-4">{t('battle.defeat')}</h2>
            <button
              onClick={startBattle}
              className="px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 rounded-xl text-lg font-medium"
            >
              重新挑战 💪
            </button>
          </div>
        )}

        {/* Battle Logs */}
        {logs.length > 0 && (
          <div className="mt-12 max-w-xl mx-auto">
            <h3 className="text-lg font-bold text-white mb-4">📜 战斗记录</h3>
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
