'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { localizePetName } from '@/lib/petNames';
import {
  BATTLE_COOLDOWN_MS,
  clearBattleCooldown,
  formatCooldownTimer,
  getBattleCooldownRemainingMs,
  readBattleCooldownUntil,
  setBattleCooldownUntil,
} from '@/lib/battleCooldown';
import { readActiveGatherTask } from '@/lib/magicPotions';
import {
  playAttackSound,
  playVictorySound,
  playDefeatSound,
  startBattleMusic,
  stopBattleResultSound,
  stopBattleMusic,
} from '@/lib/sounds';

type Element = 'gold' | 'wood' | 'water' | 'fire' | 'earth';
type Gender = 'male' | 'female';

interface Pet {
  id?: number;
  name?: string;
  nameKey?: string;
  element: Element[];
  gender: Gender;
  level: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  attack: number;
  defense: number;
  image: string;
}

const VALID_ELEMENTS: Element[] = ['gold', 'wood', 'water', 'fire', 'earth'];

const DEFAULT_PLAYER_PET: Pet = {
  nameKey: 'battle.playerDefaultName',
  element: ['fire'],
  gender: 'male',
  level: 5,
  hp: 100,
  maxHp: 100,
  mp: 60,
  maxMp: 60,
  attack: 45,
  defense: 30,
  image: '🦞',
};

const SPECIAL_SKILL_MP_COST = 20;

const elementColors: Record<Element, { bg: string; border: string; text: string; icon: string }> = {
  gold: { bg: 'bg-yellow-500/20', border: 'border-yellow-500', text: 'text-yellow-400', icon: '🪙' },
  wood: { bg: 'bg-green-500/20', border: 'border-green-500', text: 'text-green-400', icon: '🪵' },
  water: { bg: 'bg-blue-500/20', border: 'border-blue-500', text: 'text-blue-400', icon: '💧' },
  fire: { bg: 'bg-red-500/20', border: 'border-red-500', text: 'text-red-400', icon: '🔥' },
  earth: { bg: 'bg-amber-700/20', border: 'border-amber-600', text: 'text-amber-500', icon: '🪨' },
};

const genderColors: Record<Gender, { text: string; bg: string }> = {
  male: { text: 'text-red-400', bg: 'bg-red-500/30' },
  female: { text: 'text-pink-400', bg: 'bg-pink-500/30' },
};

const oceanEnemyTemplates: Pet[] = [
  {
    nameKey: 'battle.enemies.clownfish',
    element: ['water'],
    gender: 'male',
    level: 3,
    hp: 60,
    maxHp: 60,
    mp: 40,
    maxMp: 40,
    attack: 25,
    defense: 15,
    image: '🐠',
  },
  {
    nameKey: 'battle.enemies.octopus',
    element: ['water'],
    gender: 'male',
    level: 4,
    hp: 80,
    maxHp: 80,
    mp: 45,
    maxMp: 45,
    attack: 35,
    defense: 20,
    image: '🐙',
  },
  {
    nameKey: 'battle.enemies.crab',
    element: ['earth'],
    gender: 'male',
    level: 5,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    attack: 40,
    defense: 30,
    image: '🦀',
  },
  {
    nameKey: 'battle.enemies.shark',
    element: ['water', 'fire'],
    gender: 'male',
    level: 6,
    hp: 120,
    maxHp: 120,
    mp: 55,
    maxMp: 55,
    attack: 50,
    defense: 25,
    image: '🦈',
  },
  {
    nameKey: 'battle.enemies.whale',
    element: ['water'],
    gender: 'female',
    level: 7,
    hp: 150,
    maxHp: 150,
    mp: 60,
    maxMp: 60,
    attack: 45,
    defense: 35,
    image: '🐋',
  },
];

export default function Battle() {
  const { t } = useTranslation();
  const { isConnected } = useAccount();
  const [battleState, setBattleState] = useState<'idle' | 'fighting' | 'victory' | 'defeat'>('idle');
  const [playerPet, setPlayerPet] = useState<Pet>(DEFAULT_PLAYER_PET);
  const [enemyPet, setEnemyPet] = useState<Pet>(oceanEnemyTemplates[0]);
  const [logs, setLogs] = useState<string[]>([]);
  const [attackEffect, setAttackEffect] = useState<'none' | 'hit' | 'special'>('none');
  const [shake, setShake] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState(0);
  const [gatherBlocked, setGatherBlocked] = useState(false);
  const [gatherRemainingMs, setGatherRemainingMs] = useState(0);

  const normalizeElements = (element: unknown): Element[] => {
    const source = Array.isArray(element) ? element : [element];
    const normalized = source.filter(
      (value): value is Element => typeof value === 'string' && VALID_ELEMENTS.includes(value as Element),
    );
    return normalized.length > 0 ? normalized : ['water'];
  };

  const updateStoredPetMp = (petId: number | undefined, mp: number, maxMp: number) => {
    if (!petId) {
      return;
    }
    const raw = localStorage.getItem('myPets');
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return;
      }
      const next = parsed.map((pet: any) =>
        Number(pet?.id) === petId ? { ...pet, mp: Math.max(0, mp), maxMp: Math.max(1, maxMp) } : pet,
      );
      localStorage.setItem('myPets', JSON.stringify(next));
    } catch {
      // Ignore invalid local data.
    }
  };

  useEffect(() => {
    if (!isConnected) {
      return;
    }

    const petIdParam = new URLSearchParams(window.location.search).get('petId');
    if (!petIdParam) {
      return;
    }

    const targetPetId = Number.parseInt(petIdParam, 10);
    if (Number.isNaN(targetPetId)) {
      return;
    }

    try {
      const raw = localStorage.getItem('myPets');
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return;
      }

      const selectedPet = parsed.find((pet: any) => Number(pet?.id) === targetPetId);
      if (!selectedPet) {
        return;
      }

      const maxHp =
        typeof selectedPet.maxHp === 'number' && selectedPet.maxHp > 0
          ? selectedPet.maxHp
          : typeof selectedPet.hp === 'number' && selectedPet.hp > 0
            ? selectedPet.hp
            : DEFAULT_PLAYER_PET.maxHp;
      const maxMp =
        typeof selectedPet.maxMp === 'number' && selectedPet.maxMp > 0
          ? selectedPet.maxMp
          : typeof selectedPet.mp === 'number' && selectedPet.mp > 0
            ? selectedPet.mp
            : DEFAULT_PLAYER_PET.maxMp;
      const mp = typeof selectedPet.mp === 'number' && selectedPet.mp >= 0 ? Math.min(selectedPet.mp, maxMp) : maxMp;

      setPlayerPet({
        id: targetPetId,
        name: selectedPet.name,
        element: normalizeElements(selectedPet.element),
        gender: selectedPet.gender === 'female' ? 'female' : 'male',
        level:
          typeof selectedPet.level === 'number' && selectedPet.level > 0
            ? selectedPet.level
            : DEFAULT_PLAYER_PET.level,
        hp: maxHp,
        maxHp,
        mp,
        maxMp,
        attack:
          typeof selectedPet.attack === 'number' && selectedPet.attack > 0
            ? selectedPet.attack
            : DEFAULT_PLAYER_PET.attack,
        defense:
          typeof selectedPet.defense === 'number' && selectedPet.defense > 0
            ? selectedPet.defense
            : DEFAULT_PLAYER_PET.defense,
        image: '🦞',
      });
    } catch {
      // Ignore invalid local data and keep fallback player pet.
    }
  }, [isConnected]);

  useEffect(() => {
    const until = readBattleCooldownUntil(playerPet.id);
    if (!until) {
      setCooldownUntil(null);
      setCooldownRemainingMs(0);
      return;
    }

    setCooldownUntil(until);
    setCooldownRemainingMs(until - Date.now());
  }, [playerPet.id]);

  useEffect(() => {
    if (!isConnected) {
      return;
    }

    const syncGatherBlock = () => {
      const activeTask = readActiveGatherTask();
      if (activeTask && playerPet.id && activeTask.petId === playerPet.id) {
        setGatherBlocked(true);
        setGatherRemainingMs(Math.max(0, activeTask.endsAt - Date.now()));
        return;
      }
      setGatherBlocked(false);
      setGatherRemainingMs(0);
    };

    syncGatherBlock();
    const timer = setInterval(syncGatherBlock, 1000);
    return () => clearInterval(timer);
  }, [isConnected, playerPet.id]);

  useEffect(() => {
    if (!cooldownUntil) {
      return;
    }

    const tick = () => {
      const remaining = getBattleCooldownRemainingMs(playerPet.id);
      if (remaining <= 0) {
        clearBattleCooldown(playerPet.id);
        setCooldownUntil(null);
        setCooldownRemainingMs(0);
        return;
      }
      setCooldownRemainingMs(remaining);
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil, playerPet.id]);

  useEffect(() => {
    return () => {
      stopBattleMusic();
      stopBattleResultSound();
    };
  }, []);

  const resolvePetName = (pet: Pet) => {
    if (pet.nameKey) {
      return t(pet.nameKey);
    }
    return localizePetName(pet.name, t) || t('battle.playerDefaultName');
  };
  const resolveElementLabel = (element: Element) => t(`dashboard.element.${element}`);
  const isCooldownActive = cooldownRemainingMs > 0;
  const cooldownLabel = formatCooldownTimer(cooldownRemainingMs);
  const gatherBlockLabel = formatCooldownTimer(gatherRemainingMs);

  const startBattle = () => {
    if (isCooldownActive || gatherBlocked) {
      return;
    }

    stopBattleResultSound();
    const randomEnemy = oceanEnemyTemplates[Math.floor(Math.random() * oceanEnemyTemplates.length)];
    setEnemyPet({ ...randomEnemy, hp: randomEnemy.maxHp });
    setBattleState('fighting');
    setPlayerPet((current) => ({ ...current, hp: current.maxHp }));
    setLogs([t('battle.battleStart')]);
    startBattleMusic();
  };

  const attack = (isSpecial: boolean) => {
    if (battleState !== 'fighting') {
      return;
    }

    if (isSpecial && playerPet.mp < SPECIAL_SKILL_MP_COST) {
      setLogs((prev) => [...prev, t('battle.noMana', { cost: SPECIAL_SKILL_MP_COST })]);
      return;
    }

    if (isSpecial) {
      const nextMp = Math.max(0, playerPet.mp - SPECIAL_SKILL_MP_COST);
      setPlayerPet((current) => ({ ...current, mp: nextMp }));
      updateStoredPetMp(playerPet.id, nextMp, playerPet.maxMp);
    }

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

    const skill = isSpecial ? `🔥${t('battle.special')}` : `⚔️${t('battle.attack')}`;
    setLogs((prev) => [...prev, t('battle.youUsed', { skill, damage })]);

    if (newEnemyHp <= 0) {
      setBattleState('victory');
      stopBattleMusic();
      playVictorySound();
      setLogs((prev) => [
        ...prev,
        t('battle.enemyDefeated', { name: resolvePetName(enemyPet) }),
        t('battle.victoryText'),
      ]);
      return;
    }

    setTimeout(() => {
      setShake(true);
      setTimeout(() => setShake(false), 500);

      const enemyDamage = Math.floor(enemyPet.attack - playerPet.defense * 0.5);
      const newPlayerHp = Math.max(0, playerPet.hp - enemyDamage);
      setPlayerPet({ ...playerPet, hp: newPlayerHp });
      setLogs((prev) => [
        ...prev,
        t('battle.enemyAttacks', { name: resolvePetName(enemyPet), damage: enemyDamage }),
      ]);

      if (newPlayerHp <= 0) {
        setBattleState('defeat');
        stopBattleMusic();
        playDefeatSound();
        const nextCooldownUntil = Date.now() + BATTLE_COOLDOWN_MS;
        setCooldownUntil(nextCooldownUntil);
        setCooldownRemainingMs(BATTLE_COOLDOWN_MS);
        setBattleCooldownUntil(nextCooldownUntil, playerPet.id);
        setLogs((prev) => [...prev, t('battle.defeatText'), t('battle.tryAgain')]);
      }
    }, 800);
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl text-white mb-4">{t('battle.reconnect')}</h2>
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="flex items-center justify-between px-6 py-4 bg-slate-800/50 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🦞</span>
            <span className="text-xl font-bold text-white">{t('common.appName')}</span>
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
            <Link href="/gather" className="text-slate-400 hover:text-white">
              {t('nav.gather')}
            </Link>
            <Link href="/market" className="text-slate-400 hover:text-white">
              🏪 {t('nav.market')}
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          <ConnectButton />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white text-center mb-8">🌊 {t('battle.arena')} 🌊</h1>

        {attackEffect !== 'none' && (
          <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
            <div className={`text-9xl animate-ping ${attackEffect === 'special' ? 'text-red-500' : 'text-yellow-400'}`}>
              {attackEffect === 'special' ? '💥' : '⚡'}
            </div>
          </div>
        )}

        <div className="h-24 mb-2 flex items-center justify-center pointer-events-none">
          {battleState === 'victory' && <div className="text-8xl animate-bounce">🏆</div>}
          {battleState === 'defeat' && <div className="text-8xl animate-pulse">💀</div>}
        </div>

        <div className="flex justify-around items-center mb-12">
          <div className={`text-center transition-transform ${shake ? 'translate-x-2' : ''}`}>
            <div className="flex justify-center mb-2">
              <span className="text-2xl mr-2">{elementColors[playerPet.element[0]].icon}</span>
              <span
                className={`px-2 py-0.5 rounded text-xs ${genderColors[playerPet.gender].bg} ${genderColors[playerPet.gender].text}`}
              >
                {playerPet.gender === 'male' ? '♂' : '♀'}
              </span>
            </div>
            <div
              className={`inline-block text-8xl mb-4 p-3 rounded-full ${genderColors[playerPet.gender].bg} ${
                playerPet.gender === 'female'
                  ? 'ring-2 ring-purple-400/80 ring-offset-2 ring-offset-slate-900'
                  : 'ring-2 ring-red-400/80 ring-offset-2 ring-offset-slate-900'
              } animate-pulse hover:scale-110 transition-transform cursor-pointer`}
            >
              <span
                className={`animate-wiggle inline-block ${
                  playerPet.gender === 'female' && playerPet.image === '🦞' ? 'female-lobster-body' : ''
                }`}
              >
                {playerPet.image}
              </span>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{resolvePetName(playerPet)}</h3>
            <p className="text-slate-400 mb-2">
              {t('dashboard.pet.level')} {playerPet.level} • {playerPet.element.map(resolveElementLabel).join('/')}
            </p>
            <div className="w-48 h-4 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${(playerPet.hp / playerPet.maxHp) * 100}%` }}
              />
            </div>
            <p className="text-green-400 mt-1">
              {playerPet.hp}/{playerPet.maxHp} {t('battle.hp')}
            </p>
            <div className="w-48 h-4 bg-slate-700 rounded-full overflow-hidden mt-2">
              <div
                className="h-full bg-cyan-500 transition-all"
                style={{ width: `${(playerPet.mp / playerPet.maxMp) * 100}%` }}
              />
            </div>
            <p className="text-cyan-400 mt-1">
              {playerPet.mp}/{playerPet.maxMp} {t('battle.mp')}
            </p>
          </div>

          <div className="text-4xl font-bold text-slate-500">{t('battle.vs')}</div>

          <div className={`text-center transition-transform ${shake ? '-translate-x-2' : ''}`}>
            <div className="flex justify-center mb-2">
              <span className="text-2xl mr-2">{elementColors[enemyPet.element[0]].icon}</span>
              <span
                className={`px-2 py-0.5 rounded text-xs ${genderColors[enemyPet.gender].bg} ${genderColors[enemyPet.gender].text}`}
              >
                {enemyPet.gender === 'male' ? '♂' : '♀'}
              </span>
            </div>
            <div
              className={`inline-block text-8xl mb-4 p-3 rounded-full ${genderColors[enemyPet.gender].bg} ${
                enemyPet.gender === 'female'
                  ? 'ring-2 ring-purple-400/80 ring-offset-2 ring-offset-slate-900'
                  : 'ring-2 ring-red-400/80 ring-offset-2 ring-offset-slate-900'
              } ${
                attackEffect !== 'none' ? 'animate-spin' : ''
              }`}
            >
              <span
                className={`animate-bounce inline-block ${
                  enemyPet.gender === 'female' && enemyPet.image === '🦞' ? 'female-lobster-body' : ''
                }`}
              >
                {enemyPet.image}
              </span>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{resolvePetName(enemyPet)}</h3>
            <p className="text-slate-400 mb-2">
              {t('dashboard.pet.level')} {enemyPet.level} • {enemyPet.element.map(resolveElementLabel).join('/')}
            </p>
            <div className="w-48 h-4 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 transition-all"
                style={{ width: `${(enemyPet.hp / enemyPet.maxHp) * 100}%` }}
              />
            </div>
            <p className="text-red-400 mt-1">
              {enemyPet.hp}/{enemyPet.maxHp} {t('battle.hp')}
            </p>
            <div className="w-48 h-4 bg-slate-700 rounded-full overflow-hidden mt-2">
              <div
                className="h-full bg-cyan-500 transition-all"
                style={{ width: `${(enemyPet.mp / enemyPet.maxMp) * 100}%` }}
              />
            </div>
            <p className="text-cyan-400 mt-1">
              {enemyPet.mp}/{enemyPet.maxMp} {t('battle.mp')}
            </p>
          </div>
        </div>

        {battleState === 'idle' && (
          <div className="text-center">
            <button
              onClick={startBattle}
              disabled={isCooldownActive || gatherBlocked}
              className={`px-8 py-4 rounded-full text-xl font-semibold transition-all ${
                isCooldownActive || gatherBlocked
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 transform hover:scale-105'
              }`}
            >
              {gatherBlocked
                ? `🌊 ${t('gather.busyButton')}`
                : isCooldownActive
                ? `⏳ ${t('battle.cooldownButton', { time: cooldownLabel })}`
                : `⚔️ ${t('battle.startBattle')}`}
            </button>
            {gatherBlocked && <p className="mt-3 text-sm text-blue-300">{t('gather.busyBattle', { time: gatherBlockLabel })}</p>}
            {isCooldownActive && (
              <p className="mt-3 text-sm text-slate-300">{t('battle.cooldownNotice', { time: cooldownLabel })}</p>
            )}
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
              disabled={playerPet.mp < SPECIAL_SKILL_MP_COST}
              className={`px-8 py-4 rounded-xl text-lg font-medium transition-all ${
                playerPet.mp < SPECIAL_SKILL_MP_COST
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 hover:scale-105 animate-pulse'
              }`}
            >
              {playerPet.mp < SPECIAL_SKILL_MP_COST
                ? `🧪 ${t('battle.needMana', { cost: SPECIAL_SKILL_MP_COST })}`
                : `🔥 ${t('battle.special')}`}
            </button>
          </div>
        )}

        {battleState === 'victory' && (
          <div className="text-center">
            <div className="text-8xl mb-4 animate-bounce">🎉</div>
            <h2 className="text-5xl font-bold text-yellow-400 mb-4">{t('battle.victory')}</h2>
            <p className="text-2xl text-indigo-400 mb-6">{t('battle.victoryReward')}</p>
            <div className="flex justify-center gap-4">
              <button
                onClick={startBattle}
                className="px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 rounded-xl text-lg font-medium"
              >
                {t('battle.rematch')} 🐠
              </button>
              <Link
                href="/dashboard"
                className="px-8 py-4 bg-slate-700 hover:bg-slate-600 rounded-xl text-lg font-medium"
              >
                {t('common.backHome')} 🏠
              </Link>
            </div>
          </div>
        )}

        {battleState === 'defeat' && (
          <div className="text-center">
            <div className="text-8xl mb-4 animate-pulse">💔</div>
            <h2 className="text-5xl font-bold text-red-400 mb-4">{t('battle.defeat')}</h2>
            <p className="text-lg text-slate-300 mb-4">{t('battle.cooldownApplied')}</p>
            {isCooldownActive && (
              <p className="text-sm text-slate-300 mb-4">{t('battle.cooldownNotice', { time: cooldownLabel })}</p>
            )}
            <button
              onClick={startBattle}
              disabled={isCooldownActive || gatherBlocked}
              className={`px-8 py-4 rounded-xl text-lg font-medium ${
                isCooldownActive || gatherBlocked
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500'
              }`}
            >
              {gatherBlocked
                ? `🌊 ${t('gather.busyButton')}`
                : isCooldownActive
                ? `⏳ ${t('battle.cooldownButton', { time: cooldownLabel })}`
                : `${t('battle.challengeAgain')} 💪`}
            </button>
            {gatherBlocked && <p className="mt-3 text-sm text-blue-300">{t('gather.busyBattle', { time: gatherBlockLabel })}</p>}
          </div>
        )}

        {logs.length > 0 && (
          <div className="mt-12 max-w-xl mx-auto">
            <h3 className="text-lg font-bold text-white mb-4">📜 {t('battle.battleLog')}</h3>
            <div className="bg-slate-800 rounded-xl p-4 h-48 overflow-y-auto space-y-2">
              {logs.map((log, i) => (
                <p key={i} className="text-slate-300 text-sm">
                  {log}
                </p>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
