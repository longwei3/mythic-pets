'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import AuthStatus from '@/components/AuthStatus';
import RequireAuth from '@/components/RequireAuth';
import { useAuth } from '@/components/AuthProvider';
import { getScopedStorageKey } from '@/lib/auth';
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
import { BATTLE_VICTORY_REWARD as BATTLE_VICTORY_MYTH_REWARD, grantMyth } from '@/lib/economy';
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
type BattleMode = 'pve' | 'pvp';
type PvpTurn = 'left' | 'right';

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

interface OwnedPet extends Pet {
  id: number;
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
const BATTLE_EXP_REWARD = 100;
const BATTLE_LEVELUP_ATTACK_GAIN = 2;
const BATTLE_LEVELUP_DEFENSE_GAIN = 2;
const BATTLE_LEVELUP_HP_GAIN = 8;
const BATTLE_LEVELUP_MP_GAIN = 4;

interface BattleRewardProgression {
  levelUps: number;
  nextLevel: number;
  nextAttack: number;
  nextDefense: number;
  nextMaxHp: number;
  nextMaxMp: number;
  nextMp: number;
}

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
  const { ready, isAuthenticated, username } = useAuth();
  const [battleMode, setBattleMode] = useState<BattleMode>('pve');
  const [battleState, setBattleState] = useState<'idle' | 'fighting' | 'victory' | 'defeat'>('idle');
  const [ownedPets, setOwnedPets] = useState<OwnedPet[]>([]);
  const [playerPet, setPlayerPet] = useState<Pet>(DEFAULT_PLAYER_PET);
  const [enemyPet, setEnemyPet] = useState<Pet>(oceanEnemyTemplates[0]);
  const [pvpLeftPetId, setPvpLeftPetId] = useState<number | null>(null);
  const [pvpRightPetId, setPvpRightPetId] = useState<number | null>(null);
  const [pvpTurn, setPvpTurn] = useState<PvpTurn>('left');
  const [pvpWinner, setPvpWinner] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [attackEffect, setAttackEffect] = useState<'none' | 'hit' | 'special'>('none');
  const [shake, setShake] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState(0);
  const [gatherBlocked, setGatherBlocked] = useState(false);
  const [gatherRemainingMs, setGatherRemainingMs] = useState(0);
  const [lastBattleLevelUps, setLastBattleLevelUps] = useState(0);

  const normalizeElements = (element: unknown): Element[] => {
    const source = Array.isArray(element) ? element : [element];
    const normalized = source.filter(
      (value): value is Element => typeof value === 'string' && VALID_ELEMENTS.includes(value as Element),
    );
    return normalized.length > 0 ? normalized : ['water'];
  };

  const normalizeStoredPet = (rawPet: any, index = 0): OwnedPet => {
    const level = typeof rawPet.level === 'number' && rawPet.level > 0 ? rawPet.level : 1;
    const maxHp =
      typeof rawPet.maxHp === 'number' && rawPet.maxHp > 0
        ? rawPet.maxHp
        : typeof rawPet.hp === 'number' && rawPet.hp > 0
          ? rawPet.hp
          : 50;
    const maxMp =
      typeof rawPet.maxMp === 'number' && rawPet.maxMp > 0
        ? rawPet.maxMp
        : typeof rawPet.mp === 'number' && rawPet.mp > 0
          ? rawPet.mp
          : 30 + level * 5;

    return {
      id: typeof rawPet.id === 'number' ? rawPet.id : index + 1,
      name: typeof rawPet.name === 'string' ? rawPet.name : 'Lobster',
      element: normalizeElements(rawPet.element),
      gender: rawPet.gender === 'female' ? 'female' : 'male',
      level,
      hp: typeof rawPet.hp === 'number' && rawPet.hp >= 0 ? Math.min(rawPet.hp, maxHp) : maxHp,
      maxHp,
      mp: typeof rawPet.mp === 'number' && rawPet.mp >= 0 ? Math.min(rawPet.mp, maxMp) : maxMp,
      maxMp,
      attack: typeof rawPet.attack === 'number' && rawPet.attack > 0 ? rawPet.attack : DEFAULT_PLAYER_PET.attack,
      defense: typeof rawPet.defense === 'number' && rawPet.defense > 0 ? rawPet.defense : DEFAULT_PLAYER_PET.defense,
      image: '🦞',
    };
  };

  const updateStoredPetMp = (petId: number | undefined, mp: number, maxMp: number) => {
    if (!petId) {
      return;
    }
    const raw = localStorage.getItem(getScopedStorageKey('myPets', username || undefined));
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
      localStorage.setItem(getScopedStorageKey('myPets', username || undefined), JSON.stringify(next));
    } catch {
      // Ignore invalid local data.
    }
  };

  const applyVictoryRewardsToStoredPet = (
    petId: number | undefined,
    currentPet: Pet,
    expReward: number,
  ): BattleRewardProgression => {
    const fallback: BattleRewardProgression = {
      levelUps: 0,
      nextLevel: currentPet.level,
      nextAttack: currentPet.attack,
      nextDefense: currentPet.defense,
      nextMaxHp: currentPet.maxHp,
      nextMaxMp: currentPet.maxMp,
      nextMp: currentPet.mp,
    };

    if (!petId) {
      return fallback;
    }

    const raw = localStorage.getItem(getScopedStorageKey('myPets', username || undefined));
    if (!raw) {
      return fallback;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return fallback;
      }

      let progression = fallback;
      const nextPets = parsed.map((pet: any) => {
        if (Number(pet?.id) !== petId) {
          return pet;
        }

        let level = typeof pet.level === 'number' && pet.level > 0 ? pet.level : currentPet.level;
        let exp = typeof pet.exp === 'number' && pet.exp >= 0 ? pet.exp : 0;
        let maxExp = typeof pet.maxExp === 'number' && pet.maxExp > 0 ? pet.maxExp : 100;
        let attack = typeof pet.attack === 'number' && pet.attack > 0 ? pet.attack : currentPet.attack;
        let defense = typeof pet.defense === 'number' && pet.defense > 0 ? pet.defense : currentPet.defense;
        let maxHp = typeof pet.maxHp === 'number' && pet.maxHp > 0 ? pet.maxHp : currentPet.maxHp;
        let maxMp = typeof pet.maxMp === 'number' && pet.maxMp > 0 ? pet.maxMp : currentPet.maxMp;

        exp += Math.max(0, Math.floor(expReward));
        let levelUps = 0;

        while (exp >= maxExp) {
          exp -= maxExp;
          level += 1;
          levelUps += 1;
          maxExp = Math.max(100, Math.floor(maxExp * 1.2));
          attack += BATTLE_LEVELUP_ATTACK_GAIN;
          defense += BATTLE_LEVELUP_DEFENSE_GAIN;
          maxHp += BATTLE_LEVELUP_HP_GAIN;
          maxMp += BATTLE_LEVELUP_MP_GAIN;
        }

        const nextMp = Math.min(maxMp, Math.max(0, currentPet.mp + levelUps * BATTLE_LEVELUP_MP_GAIN));

        progression = {
          levelUps,
          nextLevel: level,
          nextAttack: attack,
          nextDefense: defense,
          nextMaxHp: maxHp,
          nextMaxMp: maxMp,
          nextMp,
        };

        return {
          ...pet,
          level,
          exp,
          maxExp,
          attack,
          defense,
          hp: maxHp,
          maxHp,
          mp: nextMp,
          maxMp,
        };
      });

      localStorage.setItem(getScopedStorageKey('myPets', username || undefined), JSON.stringify(nextPets));
      return progression;
    } catch {
      return fallback;
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !username) {
      setOwnedPets([]);
      return;
    }

    try {
      const raw = localStorage.getItem(getScopedStorageKey('myPets', username));
      if (!raw) {
        setOwnedPets([]);
        return;
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setOwnedPets([]);
        return;
      }

      const normalizedPets = parsed.map((pet: any, index: number) => normalizeStoredPet(pet, index));
      setOwnedPets(normalizedPets);
      if (!pvpLeftPetId && normalizedPets.length > 0) {
        setPvpLeftPetId(normalizedPets[0].id);
      }
      if (!pvpRightPetId && normalizedPets.length > 1) {
        setPvpRightPetId(normalizedPets[1].id);
      }

      const petIdParam = new URLSearchParams(window.location.search).get('petId');
      const targetPetId = petIdParam ? Number.parseInt(petIdParam, 10) : NaN;
      const selectedPet = normalizedPets.find((pet) => pet.id === targetPetId) || normalizedPets[0];
      if (!selectedPet) {
        return;
      }

      setPlayerPet({
        ...selectedPet,
        hp: selectedPet.maxHp,
      });
    } catch {
      // Ignore invalid local data and keep fallback player pet.
      setOwnedPets([]);
    }
  }, [isAuthenticated, username]);

  useEffect(() => {
    if (battleState !== 'idle' || battleMode !== 'pvp') {
      return;
    }

    const leftPet = ownedPets.find((pet) => pet.id === (pvpLeftPetId ?? -1));
    const rightPet = ownedPets.find((pet) => pet.id === (pvpRightPetId ?? -1));
    if (leftPet) {
      setPlayerPet({ ...leftPet, hp: leftPet.maxHp, mp: leftPet.maxMp });
    }
    if (rightPet) {
      setEnemyPet({ ...rightPet, hp: rightPet.maxHp, mp: rightPet.maxMp });
    }
  }, [battleMode, battleState, ownedPets, pvpLeftPetId, pvpRightPetId]);

  useEffect(() => {
    const until = readBattleCooldownUntil(playerPet.id, username || undefined);
    if (!until) {
      setCooldownUntil(null);
      setCooldownRemainingMs(0);
      return;
    }

    setCooldownUntil(until);
    setCooldownRemainingMs(until - Date.now());
  }, [playerPet.id, username]);

  useEffect(() => {
    if (!isAuthenticated || !username) {
      return;
    }

    const syncGatherBlock = () => {
      const activeTask = readActiveGatherTask(Date.now(), username);
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
  }, [isAuthenticated, playerPet.id, username]);

  useEffect(() => {
    if (!cooldownUntil) {
      return;
    }

    const tick = () => {
      const remaining = getBattleCooldownRemainingMs(playerPet.id, Date.now(), username || undefined);
      if (remaining <= 0) {
        clearBattleCooldown(playerPet.id, username || undefined);
        setCooldownUntil(null);
        setCooldownRemainingMs(0);
        return;
      }
      setCooldownRemainingMs(remaining);
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil, playerPet.id, username]);

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
  const activePvpAttacker = pvpTurn === 'left' ? playerPet : enemyPet;
  const activeSkillMp = battleMode === 'pvp' ? activePvpAttacker.mp : playerPet.mp;

  const startBattle = () => {
    if (battleMode === 'pvp') {
      if (ownedPets.length < 2) {
        setLogs([t('battle.pvpNeedTwoPets')]);
        return;
      }
      if (!pvpLeftPetId || !pvpRightPetId) {
        setLogs([t('battle.pvpSelectHint')]);
        return;
      }
      if (pvpLeftPetId === pvpRightPetId) {
        setLogs([t('battle.pvpNeedDifferentPets')]);
        return;
      }

      const leftPet = ownedPets.find((pet) => pet.id === pvpLeftPetId);
      const rightPet = ownedPets.find((pet) => pet.id === pvpRightPetId);
      if (!leftPet || !rightPet) {
        setLogs([t('battle.pvpSelectHint')]);
        return;
      }

      stopBattleResultSound();
      setBattleState('fighting');
      setPvpTurn('left');
      setPvpWinner(null);
      setLastBattleLevelUps(0);
      setPlayerPet({ ...leftPet, hp: leftPet.maxHp, mp: leftPet.maxMp });
      setEnemyPet({ ...rightPet, hp: rightPet.maxHp, mp: rightPet.maxMp });
      setLogs([t('battle.pvpStartLog', { p1: resolvePetName(leftPet), p2: resolvePetName(rightPet) })]);
      startBattleMusic();
      return;
    }

    if (isCooldownActive || gatherBlocked) {
      return;
    }

    stopBattleResultSound();
    const randomEnemy = oceanEnemyTemplates[Math.floor(Math.random() * oceanEnemyTemplates.length)];
    setEnemyPet({ ...randomEnemy, hp: randomEnemy.maxHp });
    setBattleState('fighting');
    setPvpWinner(null);
    setLastBattleLevelUps(0);
    setPlayerPet((current) => ({ ...current, hp: current.maxHp }));
    setLogs([t('battle.battleStart')]);
    startBattleMusic();
  };

  const attack = (isSpecial: boolean) => {
    if (battleState !== 'fighting') {
      return;
    }

    if (battleMode === 'pvp') {
      const attackerIsLeft = pvpTurn === 'left';
      const attacker = attackerIsLeft ? playerPet : enemyPet;
      const defender = attackerIsLeft ? enemyPet : playerPet;

      if (isSpecial && attacker.mp < SPECIAL_SKILL_MP_COST) {
        setLogs((prev) => [...prev, t('battle.pvpNoMana', { name: resolvePetName(attacker), cost: SPECIAL_SKILL_MP_COST })]);
        return;
      }

      if (isSpecial) {
        const nextMp = Math.max(0, attacker.mp - SPECIAL_SKILL_MP_COST);
        if (attackerIsLeft) {
          setPlayerPet((current) => ({ ...current, mp: nextMp }));
        } else {
          setEnemyPet((current) => ({ ...current, mp: nextMp }));
        }
      }

      setAttackEffect(isSpecial ? 'special' : 'hit');
      setShake(true);
      playAttackSound(isSpecial);

      setTimeout(() => {
        setAttackEffect('none');
        setShake(false);
      }, 500);

      const damage = isSpecial
        ? Math.floor(attacker.attack * 1.5 - defender.defense * 0.5)
        : Math.floor(attacker.attack - defender.defense * 0.5);
      const newDefenderHp = Math.max(0, defender.hp - damage);

      if (attackerIsLeft) {
        setEnemyPet((current) => ({ ...current, hp: newDefenderHp }));
      } else {
        setPlayerPet((current) => ({ ...current, hp: newDefenderHp }));
      }

      const skill = isSpecial ? `🔥${t('battle.special')}` : `⚔️${t('battle.attack')}`;
      setLogs((prev) => [...prev, t('battle.pvpUsed', { name: resolvePetName(attacker), skill, damage })]);

      if (newDefenderHp <= 0) {
        const winnerName = resolvePetName(attacker);
        const loserName = resolvePetName(defender);
        setPvpWinner(winnerName);
        setBattleState('victory');
        stopBattleMusic();
        playVictorySound();
        setLogs((prev) => [...prev, t('battle.pvpDefeated', { winner: winnerName, loser: loserName })]);
        return;
      }

      setPvpTurn(attackerIsLeft ? 'right' : 'left');
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
      const progression = applyVictoryRewardsToStoredPet(playerPet.id, playerPet, BATTLE_EXP_REWARD);
      grantMyth(BATTLE_VICTORY_MYTH_REWARD, 'battle-victory', username || undefined);
      setLastBattleLevelUps(progression.levelUps);
      setPlayerPet((current) => ({
        ...current,
        level: progression.nextLevel,
        attack: progression.nextAttack,
        defense: progression.nextDefense,
        maxHp: progression.nextMaxHp,
        hp: Math.min(progression.nextMaxHp, current.hp + progression.levelUps * BATTLE_LEVELUP_HP_GAIN),
        maxMp: progression.nextMaxMp,
        mp: progression.nextMp,
      }));
      setLogs((prev) => [
        ...prev,
        t('battle.enemyDefeated', { name: resolvePetName(enemyPet) }),
        t('battle.victoryText', { exp: BATTLE_EXP_REWARD, myth: BATTLE_VICTORY_MYTH_REWARD }),
        ...(progression.levelUps > 0
          ? [t('battle.levelUp', { name: resolvePetName(playerPet), level: progression.nextLevel })]
          : []),
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
        setBattleCooldownUntil(nextCooldownUntil, playerPet.id, username || undefined);
        setLogs((prev) => [...prev, t('battle.defeatText'), t('battle.tryAgain')]);
      }
    }, 800);
  };

  if (!ready) {
    return <div className="min-h-screen bg-slate-900" />;
  }

  if (!isAuthenticated) {
    return <RequireAuth title={t('auth.loginRequired')} />;
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
          <AuthStatus />
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
            <p className="text-xs text-slate-300 mb-2">
              {t('dashboard.attack')} {playerPet.attack} • {t('dashboard.defense')} {playerPet.defense}
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
            <p className="text-xs text-slate-300 mb-2">
              {t('dashboard.attack')} {enemyPet.attack} • {t('dashboard.defense')} {enemyPet.defense}
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
            <div className="max-w-3xl mx-auto mb-5 p-4 rounded-xl border border-slate-700 bg-slate-800/50">
              <p className="text-sm text-slate-300 mb-3">{t('battle.modeLabel')}</p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => setBattleMode('pve')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    battleMode === 'pve' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {t('battle.modePve')}
                </button>
                <button
                  onClick={() => setBattleMode('pvp')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    battleMode === 'pvp' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {t('battle.modePvp')}
                </button>
              </div>

              {battleMode === 'pvp' && (
                <div className="mt-4 grid md:grid-cols-2 gap-3">
                  <div className="text-left">
                    <label className="block text-xs text-slate-400 mb-1">{t('battle.pvpLeft')}</label>
                    <select
                      value={pvpLeftPetId ?? ''}
                      onChange={(e) => setPvpLeftPetId(Number.parseInt(e.target.value, 10))}
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200"
                    >
                      <option value="">{t('battle.pvpSelectHint')}</option>
                      {ownedPets.map((pet) => (
                        <option key={`pvp-left-${pet.id}`} value={pet.id}>
                          {resolvePetName(pet)} (Lv.{pet.level})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="text-left">
                    <label className="block text-xs text-slate-400 mb-1">{t('battle.pvpRight')}</label>
                    <select
                      value={pvpRightPetId ?? ''}
                      onChange={(e) => setPvpRightPetId(Number.parseInt(e.target.value, 10))}
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200"
                    >
                      <option value="">{t('battle.pvpSelectHint')}</option>
                      {ownedPets.map((pet) => (
                        <option key={`pvp-right-${pet.id}`} value={pet.id}>
                          {resolvePetName(pet)} (Lv.{pet.level})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {battleMode === 'pvp' && ownedPets.length < 2 && (
                <p className="mt-3 text-xs text-amber-300">{t('battle.pvpNeedTwoPets')}</p>
              )}
            </div>

            <button
              onClick={startBattle}
              disabled={battleMode === 'pve' ? isCooldownActive || gatherBlocked : false}
              className={`px-8 py-4 rounded-full text-xl font-semibold transition-all ${
                (battleMode === 'pve' && (isCooldownActive || gatherBlocked)) || (battleMode === 'pvp' && ownedPets.length < 2)
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 transform hover:scale-105'
              }`}
            >
              {battleMode === 'pvp'
                ? `⚔️ ${t('battle.pvpStart')}`
                : gatherBlocked
                ? `🌊 ${t('gather.busyButton')}`
                : isCooldownActive
                ? `⏳ ${t('battle.cooldownButton', { time: cooldownLabel })}`
                : `⚔️ ${t('battle.startBattle')}`}
            </button>
            {battleMode === 'pve' && gatherBlocked && <p className="mt-3 text-sm text-blue-300">{t('gather.busyBattle', { time: gatherBlockLabel })}</p>}
            {battleMode === 'pve' && isCooldownActive && (
              <p className="mt-3 text-sm text-slate-300">{t('battle.cooldownNotice', { time: cooldownLabel })}</p>
            )}
          </div>
        )}

        {battleState === 'fighting' && (
          <div className="text-center">
            {battleMode === 'pvp' && (
              <p className="text-sm text-indigo-300 mb-4">
                {t('battle.pvpTurn', { name: resolvePetName(activePvpAttacker) })}
              </p>
            )}
            <div className="flex justify-center gap-4">
              <button
                onClick={() => attack(false)}
                className="px-8 py-4 bg-slate-700 hover:bg-slate-600 rounded-xl text-lg font-medium transition-all hover:scale-105"
              >
                ⚔️ {t('battle.attack')}
              </button>
              <button
                onClick={() => attack(true)}
                disabled={activeSkillMp < SPECIAL_SKILL_MP_COST}
                className={`px-8 py-4 rounded-xl text-lg font-medium transition-all ${
                  activeSkillMp < SPECIAL_SKILL_MP_COST
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 hover:scale-105 animate-pulse'
                }`}
              >
                {activeSkillMp < SPECIAL_SKILL_MP_COST
                  ? `🧪 ${t('battle.needMana', { cost: SPECIAL_SKILL_MP_COST })}`
                  : `🔥 ${t('battle.special')}`}
              </button>
            </div>
          </div>
        )}

        {battleState === 'victory' && (
          <div className="text-center">
            <div className="text-8xl mb-4 animate-bounce">🎉</div>
            <h2 className="text-5xl font-bold text-yellow-400 mb-4">{t('battle.victory')}</h2>
            {battleMode === 'pvp' ? (
              <>
                <p className="text-2xl text-indigo-300 mb-2">{t('battle.pvpWinner', { name: pvpWinner || '-' })}</p>
                <p className="text-sm text-slate-400 mb-6">{t('battle.pvpNoReward')}</p>
              </>
            ) : (
              <>
                <p className="text-2xl text-indigo-400 mb-3">
                  {t('battle.victoryReward', { exp: BATTLE_EXP_REWARD, myth: BATTLE_VICTORY_MYTH_REWARD })}
                </p>
                {lastBattleLevelUps > 0 && (
                  <p className="text-sm text-emerald-300 mb-6">
                    {t('battle.levelUp', { name: resolvePetName(playerPet), level: playerPet.level })}
                  </p>
                )}
              </>
            )}
            <div className="flex justify-center gap-4">
              <button
                onClick={startBattle}
                className="px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 rounded-xl text-lg font-medium"
              >
                {battleMode === 'pvp' ? t('battle.pvpRematch') : t('battle.rematch')} 🐠
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
