'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import AuthStatus from '@/components/AuthStatus';
import RequireAuth from '@/components/RequireAuth';
import { useAuth } from '@/components/AuthProvider';
import { getScopedStorageKey } from '@/lib/auth';
import { readMythBalance, spendMyth } from '@/lib/economy';
import { playClickSound } from '@/lib/sounds';
import { localizePetName } from '@/lib/petNames';
import { normalizePetRarity, type PetRarity } from '@/lib/petRarity';

type Element = 'gold' | 'wood' | 'water' | 'fire' | 'earth';
type Gender = 'male' | 'female';

interface Pet {
  id: number;
  name?: string;
  nameKey?: string;
  element: Element | Element[];
  gender: Gender;
  level: number;
  exp: number;
  maxExp: number;
  attack: number;
  defense: number;
  hp: number;
  maxHp: number;
  rarity: PetRarity;
  generation?: number;
  price?: number;
  forSale?: boolean;
}

const VALID_ELEMENTS: Element[] = ['gold', 'wood', 'water', 'fire', 'earth'];

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

const marketPets: Pet[] = [
  {
    id: 101,
    nameKey: 'market.samplePets.dragonKing',
    element: 'fire',
    gender: 'male',
    level: 10,
    exp: 5000,
    maxExp: 10000,
    attack: 80,
    defense: 50,
    hp: 200,
    maxHp: 200,
    rarity: 'legendary',
    generation: 2,
    price: 180,
    forSale: true,
  },
  {
    id: 102,
    nameKey: 'market.samplePets.aquaSpirit',
    element: 'water',
    gender: 'female',
    level: 8,
    exp: 3000,
    maxExp: 5000,
    attack: 60,
    defense: 45,
    hp: 180,
    maxHp: 180,
    rarity: 'epic',
    generation: 1,
    price: 130,
    forSale: true,
  },
  {
    id: 103,
    nameKey: 'market.samplePets.goldCoin',
    element: 'gold',
    gender: 'male',
    level: 5,
    exp: 1000,
    maxExp: 2000,
    attack: 40,
    defense: 35,
    hp: 100,
    maxHp: 100,
    rarity: 'rare',
    generation: 1,
    price: 90,
    forSale: true,
  },
  {
    id: 104,
    nameKey: 'market.samplePets.woody',
    element: 'wood',
    gender: 'female',
    level: 3,
    exp: 500,
    maxExp: 1000,
    attack: 30,
    defense: 25,
    hp: 80,
    maxHp: 80,
    rarity: 'common',
    generation: 1,
    price: 60,
    forSale: true,
  },
  {
    id: 105,
    nameKey: 'market.samplePets.rocky',
    element: 'earth',
    gender: 'male',
    level: 6,
    exp: 2000,
    maxExp: 3000,
    attack: 50,
    defense: 40,
    hp: 120,
    maxHp: 120,
    rarity: 'rare',
    generation: 1,
    price: 75,
    forSale: true,
  },
];

export default function Market() {
  const { t } = useTranslation();
  const { ready, isAuthenticated, username } = useAuth();
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
  const [myListedPets, setMyListedPets] = useState<Pet[]>([]);
  const [mythBalance, setMythBalance] = useState(0);

  const normalizeElements = (element: Element | Element[] | undefined): Element[] => {
    const source = Array.isArray(element) ? element : [element];
    const normalized = source.filter(
      (value): value is Element => typeof value === 'string' && VALID_ELEMENTS.includes(value as Element),
    );
    return normalized.length > 0 ? normalized : ['water'];
  };

  const getPrimaryElement = (pet: Pet): Element => normalizeElements(pet.element)[0];

  const readLocalPets = (key: string): Pet[] => {
    const scopedKey = getScopedStorageKey(key, username || undefined);
    try {
      const raw = localStorage.getItem(scopedKey);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        localStorage.removeItem(scopedKey);
        return [];
      }
      return parsed.map((pet) => ({
        ...pet,
        element: normalizeElements((pet as Pet).element),
        rarity: normalizePetRarity((pet as Pet).rarity),
        price:
          typeof (pet as Pet).price === 'number'
            ? Math.max(1, Math.floor((pet as Pet).price || 0))
            : undefined,
      })) as Pet[];
    } catch {
      localStorage.removeItem(scopedKey);
      return [];
    }
  };

  const resolvePetName = (pet: Pet): string => {
    if (pet.nameKey) {
      return t(pet.nameKey);
    }
    return localizePetName(pet.name, t) || `#${pet.id}`;
  };

  useEffect(() => {
    if (isAuthenticated && username) {
      setMyListedPets(readLocalPets('myListedPets'));
      setMythBalance(readMythBalance(username));
    }
  }, [isAuthenticated, username]);

  const handleBuy = (pet: Pet) => {
    if (!username) {
      return;
    }

    playClickSound();
    const price = Math.max(1, Math.floor(pet.price ?? 0));
    const name = resolvePetName(pet);

    const confirmed = window.confirm(
      t('market.purchaseConfirm', {
        name,
        price,
      }),
    );
    if (!confirmed) {
      return;
    }

    const result = spendMyth(price, 'market-purchase', username);
    if (!result.success) {
      alert(
        t('market.notEnoughPoints', {
          need: price,
          balance: result.balance,
        }),
      );
      return;
    }

    const myPets = readLocalPets('myPets');
    const nextId = myPets.reduce((maxId, current) => Math.max(maxId, current.id), 0) + 1;
    const elements = normalizeElements(pet.element);
    const maxMp = Math.max(30, 20 + pet.level * 5);

    const purchasedPet = {
      id: nextId,
      name,
      element: elements,
      gender: pet.gender,
      level: pet.level,
      exp: pet.exp,
      maxExp: pet.maxExp,
      attack: pet.attack,
      defense: pet.defense,
      hp: pet.maxHp,
      maxHp: pet.maxHp,
      mp: maxMp,
      maxMp,
      rarity: pet.rarity,
      generation: pet.generation || 1,
    };

    localStorage.setItem(getScopedStorageKey('myPets', username), JSON.stringify([...myPets, purchasedPet]));
    setMythBalance(result.balance);
    alert(
      t('market.purchaseSuccess', {
        name,
        cost: price,
        balance: result.balance,
      }),
    );
  };

  const handleListForSale = (petId: number) => {
    playClickSound();
    const myPets = readLocalPets('myPets');
    const pet = myPets.find((p: Pet) => p.id === petId);
    if (pet) {
      const priceInput = prompt(t('market.setPrice'), '100');
      if (priceInput) {
        const parsedPrice = Number.parseInt(priceInput, 10);
        if (Number.isNaN(parsedPrice) || parsedPrice <= 0) {
          alert(t('market.invalidPrice'));
          return;
        }
        const listedPet = { ...pet, price: parsedPrice, forSale: true };
        const newListed = [...myListedPets, listedPet];
        setMyListedPets(newListed);
        localStorage.setItem(getScopedStorageKey('myListedPets', username || undefined), JSON.stringify(newListed));
        alert(t('market.listedSuccess', { name: resolvePetName(listedPet) || `#${listedPet.id}` }));
      }
    }
  };

  const handleRemoveFromSale = (petId: number) => {
    playClickSound();
    const newListed = myListedPets.filter((p) => p.id !== petId);
    setMyListedPets(newListed);
    localStorage.setItem(getScopedStorageKey('myListedPets', username || undefined), JSON.stringify(newListed));
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
            <Link href="/battle" className="text-slate-400 hover:text-white">
              {t('nav.battle')}
            </Link>
            <Link href="/breed" className="text-slate-400 hover:text-white">
              {t('nav.breed')}
            </Link>
            <Link href="/gather" className="text-slate-400 hover:text-white">
              {t('nav.gather')}
            </Link>
            <Link href="/market" className="text-indigo-400 hover:text-indigo-300">
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
        <h1 className="text-3xl font-bold text-white text-center mb-8">🏪 {t('market.title')}</h1>
        <div className="flex justify-center mb-6">
          <span className="px-4 py-2 rounded-full bg-amber-500/20 text-amber-300 text-sm font-medium">
            💰 {t('market.pointsBalance', { amount: mythBalance })}
          </span>
        </div>

        <div className="flex justify-center gap-4 mb-8">
          <button
            onClick={() => setActiveTab('buy')}
            className={`px-6 py-3 rounded-xl font-medium transition-all ${
              activeTab === 'buy'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            🛒 {t('market.buy')}
          </button>
          <button
            onClick={() => setActiveTab('sell')}
            className={`px-6 py-3 rounded-xl font-medium transition-all ${
              activeTab === 'sell'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            💰 {t('market.sell')}
          </button>
        </div>

        {activeTab === 'buy' && (
          <div>
            <p className="text-center text-slate-400 mb-6">{t('market.buyPets')}</p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {marketPets.map((pet) => {
                const primaryElement = getPrimaryElement(pet);
                return (
                  <div
                    key={pet.id}
                    className={`bg-slate-800 rounded-2xl p-6 border-2 ${elementColors[primaryElement].border}`}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{elementColors[primaryElement].icon}</span>
                        <div>
                          <h3 className="text-lg font-bold text-white">{resolvePetName(pet)}</h3>
                          {pet.generation && (
                            <span className="text-xs text-indigo-400">
                              {t('breed.generation', { gen: pet.generation })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span
                          className={`px-2 py-1 rounded text-xs ${genderColors[pet.gender].bg} ${genderColors[pet.gender].text}`}
                        >
                          {pet.gender === 'male'
                            ? `♂ ${t('dashboard.gender.male')}`
                            : `♀ ${t('dashboard.gender.female')}`}
                        </span>
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            pet.rarity === 'legendary'
                              ? 'bg-amber-500/30 text-amber-400'
                              : pet.rarity === 'epic'
                                ? 'bg-purple-500/30 text-purple-400'
                                : pet.rarity === 'rare'
                                  ? 'bg-blue-500/30 text-blue-400'
                                  : 'bg-slate-500/30 text-slate-400'
                          }`}
                        >
                          {t(`dashboard.rarity.${pet.rarity}`, { defaultValue: pet.rarity })}
                        </span>
                      </div>
                    </div>

                    <div className="text-center mb-4">
                      <div
                        className={`inline-block text-6xl p-4 rounded-full ${elementColors[primaryElement].bg} ${genderColors[pet.gender].bg} ${
                          pet.gender === 'female'
                            ? 'ring-2 ring-purple-400/80 ring-offset-2 ring-offset-slate-900'
                            : 'ring-2 ring-red-400/80 ring-offset-2 ring-offset-slate-900'
                        }`}
                      >
                        <span className={pet.gender === 'female' ? 'female-lobster-body' : ''}>🦞</span>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm mb-4">
                      <div className="flex justify-between">
                        <span className="text-slate-400">{t('market.level')}</span>
                        <span className="text-white">
                          {t('market.level')} {pet.level}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">{t('market.attack')}</span>
                        <span className="text-red-400">{pet.attack}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">{t('market.defense')}</span>
                        <span className="text-blue-400">{pet.defense}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-4 border-t border-slate-700">
                      <div>
                        <span className="text-xs text-slate-400">{t('market.price')}</span>
                        <p className="text-xl font-bold text-green-400">
                          {pet.price} {t('market.pointsUnit')}
                        </p>
                      </div>
                      <button
                        onClick={() => handleBuy(pet)}
                        className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-medium"
                      >
                        {t('market.purchase')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'sell' && (
          <div>
            <p className="text-center text-slate-400 mb-6">{t('market.sellPets')}</p>

            {myListedPets.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-bold text-white mb-4">{t('breed.listedPets')}</h2>
                <div className="grid md:grid-cols-3 gap-4">
                  {myListedPets.map((pet) => {
                    const primaryElement = getPrimaryElement(pet);
                    const elementLabel = normalizeElements(pet.element)
                      .map((element) => t(`dashboard.element.${element}`))
                      .join('/');
                    return (
                      <div key={pet.id} className="bg-slate-800 rounded-xl p-4 border border-indigo-500">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span>{elementColors[primaryElement].icon}</span>
                            <span className="text-white font-medium">{resolvePetName(pet)}</span>
                          <span className={`px-2 py-0.5 rounded text-xs ${genderColors[pet.gender].bg} ${genderColors[pet.gender].text}`}>
                              {pet.gender === 'male' ? '♂' : '♀'}
                            </span>
                          </div>
                          <span className="text-green-400">
                            {pet.price} {t('market.pointsUnit')}
                          </span>
                        </div>
                        <div className="mt-2 text-xs text-slate-300">
                          {elementLabel} • {t('market.level')} {pet.level}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {pet.attack}⚔️ {pet.defense}🛡️ • {t('dashboard.pet.hp')} {pet.hp}/{pet.maxHp}
                        </div>
                        <button
                          onClick={() => handleRemoveFromSale(pet.id)}
                          className="mt-2 w-full px-3 py-1 bg-red-600/50 hover:bg-red-600 rounded text-sm"
                        >
                          {t('breed.removeFromSale')}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <h2 className="text-xl font-bold text-white mb-4">{t('breed.petsForSale')}</h2>
              <div className="grid md:grid-cols-3 gap-4">
                {(() => {
                  const myPets = readLocalPets('myPets');
                  return myPets.map((pet: Pet) => {
                    const primaryElement = getPrimaryElement(pet);
                    const elementLabel = normalizeElements(pet.element)
                      .map((element) => t(`dashboard.element.${element}`))
                      .join('/');
                    return (
                      <div
                        key={pet.id}
                        className="bg-slate-800 rounded-xl p-4 border border-slate-600 hover:border-indigo-500 transition-colors"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <span>{elementColors[primaryElement].icon}</span>
                            <div>
                              <span className="text-white font-medium">{resolvePetName(pet)}</span>
                              <span className={`ml-2 px-2 py-0.5 rounded text-xs ${genderColors[pet.gender].bg} ${genderColors[pet.gender].text}`}>
                                {pet.gender === 'male'
                                  ? `♂ ${t('dashboard.gender.male')}`
                                  : `♀ ${t('dashboard.gender.female')}`}
                              </span>
                              {pet.generation && (
                                <span className="ml-1 text-xs text-indigo-400">
                                  {t('breed.generation', { gen: pet.generation })}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-slate-400 mb-2">
                          {elementLabel} • {t('market.level')} {pet.level} • {pet.attack}⚔️ {pet.defense}🛡️ •{' '}
                          {t('dashboard.pet.hp')} {pet.hp}/{pet.maxHp}
                        </div>
                        <button
                          onClick={() => handleListForSale(pet.id)}
                          className="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm"
                        >
                          {t('breed.listForSale')}
                        </button>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
