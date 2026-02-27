'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import AuthStatus from '@/components/AuthStatus';
import RequireAuth from '@/components/RequireAuth';
import GlobalMythChip from '@/components/GlobalMythChip';
import { useAuth } from '@/components/AuthProvider';
import { getScopedStorageKey } from '@/lib/auth';
import { grantMyth, readMythBalance, spendMyth } from '@/lib/economy';
import {
  addHealthPotion,
  addMagicPotion,
  consumeHealthPotion,
  consumeMagicPotion,
  readHealthPotionCount,
  readMagicPotionCount,
} from '@/lib/magicPotions';
import {
  consumeMarketPotionStock,
  getNextMarketPotionResetAt,
  MARKET_POTION_STOCK_MAX,
  readMarketPotionStock,
} from '@/lib/marketStock';
import { playClickSound } from '@/lib/sounds';
import { localizePetName } from '@/lib/petNames';
import { normalizePetRarity, type PetRarity } from '@/lib/petRarity';
import { getExpThresholdForLevel, resolveExpProgress, scaleBaseStatByLevel } from '@/lib/petProgression';

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

interface PlayerMarketListing {
  listingId: string;
  seller: string;
  sourcePetId: number;
  pet: Pet;
  price: number;
  createdAt: number;
}

interface BuyPetEntry extends Pet {
  marketSource: 'sample' | 'player';
  listingId?: string;
  seller?: string;
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

const MARKET_MAGIC_POTION_PRICE = 20;
const MARKET_HEALTH_POTION_PRICE = 20;
const MARKET_PLAYER_LISTINGS_KEY = 'mythicpets-market-player-listings';
const MARKET_PAGE_SIZE = 12;

export default function Market() {
  const { t } = useTranslation();
  const { ready, isAuthenticated, username } = useAuth();
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
  const [myListedPets, setMyListedPets] = useState<Pet[]>([]);
  const [mythBalance, setMythBalance] = useState(0);
  const [magicPotionCount, setMagicPotionCount] = useState(0);
  const [healthPotionCount, setHealthPotionCount] = useState(0);
  const [marketPotionStock, setMarketPotionStock] = useState<{ magic: number; health: number }>({
    magic: MARKET_POTION_STOCK_MAX,
    health: MARKET_POTION_STOCK_MAX,
  });
  const [petSellPrices, setPetSellPrices] = useState<Record<number, string>>({});
  const [buyMagicPotionCountInput, setBuyMagicPotionCountInput] = useState('1');
  const [buyHealthPotionCountInput, setBuyHealthPotionCountInput] = useState('1');
  const [sellMagicPotionCountInput, setSellMagicPotionCountInput] = useState('1');
  const [sellMagicPotionUnitPriceInput, setSellMagicPotionUnitPriceInput] = useState(String(MARKET_MAGIC_POTION_PRICE));
  const [sellHealthPotionCountInput, setSellHealthPotionCountInput] = useState('1');
  const [sellHealthPotionUnitPriceInput, setSellHealthPotionUnitPriceInput] = useState(String(MARKET_HEALTH_POTION_PRICE));
  const [magicPotionBuyNotice, setMagicPotionBuyNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [healthPotionBuyNotice, setHealthPotionBuyNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

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
        ...(() => {
          const level = typeof (pet as Pet).level === 'number' && (pet as Pet).level > 0 ? (pet as Pet).level : 1;
          const exp = typeof (pet as Pet).exp === 'number' ? (pet as Pet).exp : 0;
          const expProgress = resolveExpProgress(level, exp);
          return {
            ...pet,
            level: expProgress.level,
            exp: expProgress.current,
            maxExp: getExpThresholdForLevel(expProgress.level),
            hp:
              typeof (pet as Pet).hp === 'number' && (pet as Pet).hp > 0
                ? (pet as Pet).hp
                : scaleBaseStatByLevel(50, expProgress.level),
            maxHp:
              typeof (pet as Pet).maxHp === 'number' && (pet as Pet).maxHp > 0
                ? (pet as Pet).maxHp
                : typeof (pet as Pet).hp === 'number' && (pet as Pet).hp > 0
                  ? (pet as Pet).hp
                  : scaleBaseStatByLevel(50, expProgress.level),
          };
        })(),
        element: normalizeElements((pet as Pet).element),
        rarity: normalizePetRarity((pet as Pet).rarity),
        price: typeof (pet as Pet).price === 'number' ? Math.max(1, Math.floor((pet as Pet).price || 0)) : undefined,
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
      setMagicPotionCount(readMagicPotionCount(username));
      setHealthPotionCount(readHealthPotionCount(username));
      const stock = readMarketPotionStock(username);
      setMarketPotionStock({ magic: stock.magic, health: stock.health });
      const ownedPets = readLocalPets('myPets');
      setPetSellPrices((prev) => {
        const next = { ...prev };
        for (const pet of ownedPets) {
          if (!next[pet.id]) {
            next[pet.id] = String(Math.max(1, Math.floor(pet.price ?? 100)));
          }
        }
        return next;
      });
    }
  }, [isAuthenticated, username]);

  useEffect(() => {
    if (!isAuthenticated || !username) {
      return;
    }

    const syncStock = () => {
      const stock = readMarketPotionStock(username);
      setMarketPotionStock({ magic: stock.magic, health: stock.health });
    };

    syncStock();
    const pollTimer = setInterval(syncStock, 60_000);
    let resetTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNextReset = () => {
      const nextResetAt = getNextMarketPotionResetAt();
      const delay = Math.max(0, nextResetAt - Date.now()) + 20;
      resetTimer = setTimeout(() => {
        syncStock();
        scheduleNextReset();
      }, delay);
    };

    scheduleNextReset();
    return () => {
      clearInterval(pollTimer);
      if (resetTimer) {
        clearTimeout(resetTimer);
      }
    };
  }, [isAuthenticated, username]);

  useEffect(() => {
    if (!magicPotionBuyNotice) {
      return;
    }
    const timer = setTimeout(() => setMagicPotionBuyNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [magicPotionBuyNotice]);

  useEffect(() => {
    if (!healthPotionBuyNotice) {
      return;
    }
    const timer = setTimeout(() => setHealthPotionBuyNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [healthPotionBuyNotice]);

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
    const maxMp = scaleBaseStatByLevel(40, Math.max(1, Math.floor(pet.level)));
    const expProgress = resolveExpProgress(Math.max(1, Math.floor(pet.level)), pet.exp || 0);

    const purchasedPet = {
      id: nextId,
      name,
      element: elements,
      gender: pet.gender,
      level: expProgress.level,
      exp: expProgress.current,
      maxExp: getExpThresholdForLevel(expProgress.level),
      attack: pet.attack,
      defense: pet.defense,
      hp: typeof pet.maxHp === 'number' && pet.maxHp > 0 ? pet.maxHp : scaleBaseStatByLevel(50, expProgress.level),
      maxHp: typeof pet.maxHp === 'number' && pet.maxHp > 0 ? pet.maxHp : scaleBaseStatByLevel(50, expProgress.level),
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

  const handleBuyMagicPotion = () => {
    if (!username) {
      return;
    }

    playClickSound();
    const buyCount = Number.parseInt(buyMagicPotionCountInput, 10);
    if (Number.isNaN(buyCount) || buyCount <= 0) {
      setMagicPotionBuyNotice({
        type: 'error',
        text: t('market.invalidPotionBuyQty'),
      });
      return;
    }

    const latestStock = readMarketPotionStock(username);
    setMarketPotionStock({ magic: latestStock.magic, health: latestStock.health });
    if (buyCount > latestStock.magic) {
      setMagicPotionBuyNotice({
        type: 'error',
        text: t('market.notEnoughPotionStock', {
          need: buyCount,
          stock: latestStock.magic,
        }),
      });
      return;
    }

    const totalCost = buyCount * MARKET_MAGIC_POTION_PRICE;
    const result = spendMyth(totalCost, 'market-purchase', username);
    if (!result.success) {
      setMagicPotionBuyNotice({
        type: 'error',
        text: t('market.notEnoughPoints', {
          need: totalCost,
          balance: result.balance,
        }),
      });
      return;
    }

    const nextPotionCount = addMagicPotion(buyCount, username);
    setMagicPotionCount(nextPotionCount);
    const stockConsumeResult = consumeMarketPotionStock('magic', buyCount, username);
    setMarketPotionStock({ magic: stockConsumeResult.stock.magic, health: stockConsumeResult.stock.health });
    setMythBalance(result.balance);
    setMagicPotionBuyNotice({
      type: 'success',
      text: t('market.potionPurchaseSuccess', {
        qty: buyCount,
        cost: totalCost,
        balance: result.balance,
        count: nextPotionCount,
      }),
    });
  };

  const handleBuyHealthPotion = () => {
    if (!username) {
      return;
    }

    playClickSound();
    const buyCount = Number.parseInt(buyHealthPotionCountInput, 10);
    if (Number.isNaN(buyCount) || buyCount <= 0) {
      setHealthPotionBuyNotice({
        type: 'error',
        text: t('market.invalidHealthPotionBuyQty'),
      });
      return;
    }

    const latestStock = readMarketPotionStock(username);
    setMarketPotionStock({ magic: latestStock.magic, health: latestStock.health });
    if (buyCount > latestStock.health) {
      setHealthPotionBuyNotice({
        type: 'error',
        text: t('market.notEnoughHealthPotionStock', {
          need: buyCount,
          stock: latestStock.health,
        }),
      });
      return;
    }

    const totalCost = buyCount * MARKET_HEALTH_POTION_PRICE;
    const result = spendMyth(totalCost, 'market-purchase', username);
    if (!result.success) {
      setHealthPotionBuyNotice({
        type: 'error',
        text: t('market.notEnoughPoints', {
          need: totalCost,
          balance: result.balance,
        }),
      });
      return;
    }

    const nextPotionCount = addHealthPotion(buyCount, username);
    setHealthPotionCount(nextPotionCount);
    const stockConsumeResult = consumeMarketPotionStock('health', buyCount, username);
    setMarketPotionStock({ magic: stockConsumeResult.stock.magic, health: stockConsumeResult.stock.health });
    setMythBalance(result.balance);
    setHealthPotionBuyNotice({
      type: 'success',
      text: t('market.healthPotionPurchaseSuccess', {
        qty: buyCount,
        cost: totalCost,
        balance: result.balance,
        count: nextPotionCount,
      }),
    });
  };

  const handleListForSale = (petId: number) => {
    if (!username) {
      return;
    }
    playClickSound();
    const myPets = readLocalPets('myPets');
    const pet = myPets.find((p: Pet) => p.id === petId);
    if (!pet) {
      return;
    }

    const priceInput = petSellPrices[petId] ?? '';
    const parsedPrice = Number.parseInt(priceInput, 10);
    if (Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      alert(t('market.invalidPrice'));
      return;
    }

    const listedPet = { ...pet, price: parsedPrice, forSale: true };
    const existingIndex = myListedPets.findIndex((listed) => listed.id === petId);
    const newListed =
      existingIndex >= 0
        ? myListedPets.map((listed) => (listed.id === petId ? listedPet : listed))
        : [...myListedPets, listedPet];

    setMyListedPets(newListed);
    localStorage.setItem(getScopedStorageKey('myListedPets', username), JSON.stringify(newListed));
    setPetSellPrices((prev) => ({ ...prev, [petId]: String(parsedPrice) }));
    alert(t('market.listedSuccess', { name: resolvePetName(listedPet) || `#${listedPet.id}` }));
  };

  const handleRemoveFromSale = (petId: number) => {
    playClickSound();
    const newListed = myListedPets.filter((p) => p.id !== petId);
    setMyListedPets(newListed);
    localStorage.setItem(getScopedStorageKey('myListedPets', username || undefined), JSON.stringify(newListed));
  };

  const handleSellMagicPotions = () => {
    if (!username) {
      return;
    }

    playClickSound();
    const sellCount = Number.parseInt(sellMagicPotionCountInput, 10);
    const unitPrice = Number.parseInt(sellMagicPotionUnitPriceInput, 10);
    if (Number.isNaN(sellCount) || sellCount <= 0) {
      alert(t('market.invalidPotionSellQty'));
      return;
    }
    if (Number.isNaN(unitPrice) || unitPrice <= 0) {
      alert(t('market.invalidPotionSellPrice'));
      return;
    }
    if (sellCount > magicPotionCount) {
      alert(
        t('market.notEnoughPotions', {
          need: sellCount,
          count: magicPotionCount,
        }),
      );
      return;
    }

    const totalEarned = sellCount * unitPrice;
    const confirmed = window.confirm(
      t('market.potionSellConfirm', {
        count: sellCount,
        price: unitPrice,
        total: totalEarned,
      }),
    );
    if (!confirmed) {
      return;
    }

    const nextPotionCount = consumeMagicPotion(sellCount, username);
    const mythResult = grantMyth(totalEarned, 'system', username);
    setMagicPotionCount(nextPotionCount);
    setMythBalance(mythResult.balance);
    alert(
      t('market.potionSellSuccess', {
        count: sellCount,
        total: totalEarned,
        left: nextPotionCount,
        balance: mythResult.balance,
      }),
    );
  };

  const handleSellHealthPotions = () => {
    if (!username) {
      return;
    }

    playClickSound();
    const sellCount = Number.parseInt(sellHealthPotionCountInput, 10);
    const unitPrice = Number.parseInt(sellHealthPotionUnitPriceInput, 10);
    if (Number.isNaN(sellCount) || sellCount <= 0) {
      alert(t('market.invalidHealthPotionSellQty'));
      return;
    }
    if (Number.isNaN(unitPrice) || unitPrice <= 0) {
      alert(t('market.invalidHealthPotionSellPrice'));
      return;
    }
    if (sellCount > healthPotionCount) {
      alert(
        t('market.notEnoughHealthPotions', {
          need: sellCount,
          count: healthPotionCount,
        }),
      );
      return;
    }

    const totalEarned = sellCount * unitPrice;
    const confirmed = window.confirm(
      t('market.healthPotionSellConfirm', {
        count: sellCount,
        price: unitPrice,
        total: totalEarned,
      }),
    );
    if (!confirmed) {
      return;
    }

    const nextPotionCount = consumeHealthPotion(sellCount, username);
    const mythResult = grantMyth(totalEarned, 'system', username);
    setHealthPotionCount(nextPotionCount);
    setMythBalance(mythResult.balance);
    alert(
      t('market.healthPotionSellSuccess', {
        count: sellCount,
        total: totalEarned,
        left: nextPotionCount,
        balance: mythResult.balance,
      }),
    );
  };

  if (!ready) {
    return <div className="min-h-screen bg-slate-900" />;
  }

  if (!isAuthenticated) {
    return <RequireAuth title={t('auth.loginRequired')} />;
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="flex items-start justify-between px-6 py-4 bg-slate-800/50 backdrop-blur-sm">
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-start gap-2">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-2xl">🦞</span>
              <span className="text-xl font-bold text-white">{t('common.appName')}</span>
            </Link>
            <GlobalMythChip floating={false} />
          </div>
          <nav className="flex gap-4 ml-4 mt-1">
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
            <Link href="/adventure3d" className="text-slate-400 hover:text-white">
              🌊 {t('nav.adventure')}
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
            <div className="mb-6 grid md:grid-cols-2 gap-3 max-w-5xl mx-auto">
              <div className="rounded-xl border border-cyan-500/40 bg-slate-800/80 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-cyan-200">🧪 {t('market.magicPotion')}</h2>
                    <p className="text-xs text-slate-300 mt-1">
                      {t('market.potionOwned', { count: magicPotionCount })}
                    </p>
                    <p className="text-xs text-amber-300 mt-1">
                      {t('market.potionPrice', { price: MARKET_MAGIC_POTION_PRICE })}
                    </p>
                    <p className="text-xs text-emerald-300 mt-1">
                      {t('market.potionStock', { count: marketPotionStock.magic })}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">{t('market.potionStockResetHint')}</p>
                    <label className="mt-2 block text-[11px] text-slate-300">
                      {t('market.buyPotionQty')}
                      <input
                        type="number"
                        min={1}
                        value={buyMagicPotionCountInput}
                        onChange={(e) => setBuyMagicPotionCountInput(e.target.value)}
                        className="mt-1 w-20 rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-white"
                      />
                    </label>
                    <p className="mt-2 text-[11px] text-amber-300">
                      {t('market.buyPotionTotal', {
                        total:
                          Math.max(0, Number.parseInt(buyMagicPotionCountInput || '0', 10)) * MARKET_MAGIC_POTION_PRICE,
                      })}
                    </p>
                  </div>
                  <button
                    onClick={handleBuyMagicPotion}
                    className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-xs font-medium whitespace-nowrap"
                  >
                    {t('market.buyPotion')}
                  </button>
                </div>
                {magicPotionBuyNotice && (
                  <p
                    className={`mt-2 text-xs ${
                      magicPotionBuyNotice.type === 'success' ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {magicPotionBuyNotice.text}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-rose-500/40 bg-slate-800/80 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-rose-200">❤️ {t('market.healthPotion')}</h2>
                    <p className="text-xs text-slate-300 mt-1">
                      {t('market.healthPotionOwned', { count: healthPotionCount })}
                    </p>
                    <p className="text-xs text-amber-300 mt-1">
                      {t('market.healthPotionPrice', { price: MARKET_HEALTH_POTION_PRICE })}
                    </p>
                    <p className="text-xs text-emerald-300 mt-1">
                      {t('market.potionStock', { count: marketPotionStock.health })}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">{t('market.potionStockResetHint')}</p>
                    <label className="mt-2 block text-[11px] text-slate-300">
                      {t('market.buyHealthPotionQty')}
                      <input
                        type="number"
                        min={1}
                        value={buyHealthPotionCountInput}
                        onChange={(e) => setBuyHealthPotionCountInput(e.target.value)}
                        className="mt-1 w-20 rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-white"
                      />
                    </label>
                    <p className="mt-2 text-[11px] text-amber-300">
                      {t('market.buyHealthPotionTotal', {
                        total:
                          Math.max(0, Number.parseInt(buyHealthPotionCountInput || '0', 10)) *
                          MARKET_HEALTH_POTION_PRICE,
                      })}
                    </p>
                  </div>
                  <button
                    onClick={handleBuyHealthPotion}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 rounded-lg text-xs font-medium whitespace-nowrap"
                  >
                    {t('market.buyHealthPotion')}
                  </button>
                </div>
                {healthPotionBuyNotice && (
                  <p
                    className={`mt-2 text-xs ${
                      healthPotionBuyNotice.type === 'success' ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {healthPotionBuyNotice.text}
                  </p>
                )}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {marketPets.map((pet) => {
                const primaryElement = getPrimaryElement(pet);
                return (
                  <div
                    key={pet.id}
                    className={`bg-slate-800 rounded-xl p-3 border ${elementColors[primaryElement].border}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{elementColors[primaryElement].icon}</span>
                        <div>
                          <h3 className="text-sm font-bold text-white">{resolvePetName(pet)}</h3>
                          {pet.generation && (
                            <span className="text-[10px] text-indigo-400">
                              {t('breed.generation', { gen: pet.generation })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${genderColors[pet.gender].bg} ${genderColors[pet.gender].text}`}
                        >
                          {pet.gender === 'male'
                            ? `♂ ${t('dashboard.gender.male')}`
                            : `♀ ${t('dashboard.gender.female')}`}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
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

                    <div className="text-center mb-2">
                      <div
                        className={`inline-block text-3xl p-2 rounded-full ${elementColors[primaryElement].bg} ${genderColors[pet.gender].bg} ${
                          pet.gender === 'female'
                            ? 'ring-1 ring-purple-400/80 ring-offset-1 ring-offset-slate-900'
                            : 'ring-1 ring-red-400/80 ring-offset-1 ring-offset-slate-900'
                        }`}
                      >
                        <span className={pet.gender === 'female' ? 'female-lobster-body' : ''}>🦞</span>
                      </div>
                    </div>

                    <div className="space-y-1 text-xs mb-2">
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

                    <div className="flex justify-between items-center pt-2 border-t border-slate-700">
                      <div>
                        <span className="text-[10px] text-slate-400">{t('market.price')}</span>
                        <p className="text-base font-bold text-green-400">
                          {pet.price} {t('market.pointsUnit')}
                        </p>
                      </div>
                      <button
                        onClick={() => handleBuy(pet)}
                        className="px-2.5 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg text-xs font-medium"
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

            <div className="mb-8 grid md:grid-cols-2 gap-3 max-w-5xl mx-auto">
              <div className="rounded-xl border border-emerald-500/40 bg-slate-800/80 p-3">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-emerald-200">🧪 {t('market.sellPotionTitle')}</h2>
                  <span className="text-xs text-slate-300">{t('market.potionOwned', { count: magicPotionCount })}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-slate-300">
                    {t('market.sellPotionQty')}
                    <input
                      type="number"
                      min={1}
                      value={sellMagicPotionCountInput}
                      onChange={(e) => setSellMagicPotionCountInput(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-white"
                    />
                  </label>
                  <label className="text-[11px] text-slate-300">
                    {t('market.sellPotionUnitPrice')}
                    <input
                      type="number"
                      min={1}
                      value={sellMagicPotionUnitPriceInput}
                      onChange={(e) => setSellMagicPotionUnitPriceInput(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-white"
                    />
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-amber-300">
                  {t('market.sellPotionTotal', {
                    total:
                      Math.max(0, Number.parseInt(sellMagicPotionCountInput || '0', 10)) *
                      Math.max(0, Number.parseInt(sellMagicPotionUnitPriceInput || '0', 10)),
                  })}
                </p>
                <button
                  onClick={handleSellMagicPotions}
                  className="mt-2 w-full px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium"
                >
                  {t('market.sellPotionAction')}
                </button>
              </div>

              <div className="rounded-xl border border-rose-500/40 bg-slate-800/80 p-3">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-rose-200">❤️ {t('market.sellHealthPotionTitle')}</h2>
                  <span className="text-xs text-slate-300">{t('market.healthPotionOwned', { count: healthPotionCount })}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-slate-300">
                    {t('market.sellHealthPotionQty')}
                    <input
                      type="number"
                      min={1}
                      value={sellHealthPotionCountInput}
                      onChange={(e) => setSellHealthPotionCountInput(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-white"
                    />
                  </label>
                  <label className="text-[11px] text-slate-300">
                    {t('market.sellHealthPotionUnitPrice')}
                    <input
                      type="number"
                      min={1}
                      value={sellHealthPotionUnitPriceInput}
                      onChange={(e) => setSellHealthPotionUnitPriceInput(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-white"
                    />
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-amber-300">
                  {t('market.sellHealthPotionTotal', {
                    total:
                      Math.max(0, Number.parseInt(sellHealthPotionCountInput || '0', 10)) *
                      Math.max(0, Number.parseInt(sellHealthPotionUnitPriceInput || '0', 10)),
                  })}
                </p>
                <button
                  onClick={handleSellHealthPotions}
                  className="mt-2 w-full px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-medium"
                >
                  {t('market.sellHealthPotionAction')}
                </button>
              </div>
            </div>

            {myListedPets.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-bold text-white mb-4">{t('breed.listedPets')}</h2>
                <div className="grid md:grid-cols-3 gap-2">
                  {myListedPets.map((pet) => {
                    const primaryElement = getPrimaryElement(pet);
                    const elementLabel = normalizeElements(pet.element)
                      .map((element) => t(`dashboard.element.${element}`))
                      .join('/');
                    return (
                      <div key={pet.id} className="bg-slate-800 rounded-lg p-2 border border-indigo-500">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{elementColors[primaryElement].icon}</span>
                            <span className="text-white text-sm font-medium">{resolvePetName(pet)}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${genderColors[pet.gender].bg} ${genderColors[pet.gender].text}`}>
                              {pet.gender === 'male' ? '♂' : '♀'}
                            </span>
                          </div>
                          <span className="text-green-400 text-sm">
                            {pet.price} {t('market.pointsUnit')}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-300">
                          {elementLabel} • {t('market.level')} {pet.level}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400">
                          {pet.attack}⚔️ {pet.defense}🛡️ • {t('dashboard.pet.hp')} {pet.hp}/{pet.maxHp}
                        </div>
                        <button
                          onClick={() => handleRemoveFromSale(pet.id)}
                          className="mt-2 w-full px-2 py-1 bg-red-600/50 hover:bg-red-600 rounded text-xs"
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
              <div className="grid md:grid-cols-3 gap-2">
                {(() => {
                  const myPets = readLocalPets('myPets');
                  return myPets.map((pet: Pet) => {
                    const primaryElement = getPrimaryElement(pet);
                    const elementLabel = normalizeElements(pet.element)
                      .map((element) => t(`dashboard.element.${element}`))
                      .join('/');
                    const isListed = myListedPets.some((listed) => listed.id === pet.id);
                    return (
                      <div
                        key={pet.id}
                        className="bg-slate-800 rounded-lg p-2 border border-slate-600 hover:border-indigo-500 transition-colors"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{elementColors[primaryElement].icon}</span>
                            <div>
                              <span className="text-white text-sm font-medium">{resolvePetName(pet)}</span>
                              <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] ${genderColors[pet.gender].bg} ${genderColors[pet.gender].text}`}>
                                {pet.gender === 'male'
                                  ? `♂ ${t('dashboard.gender.male')}`
                                  : `♀ ${t('dashboard.gender.female')}`}
                              </span>
                              {pet.generation && (
                                <span className="ml-1 text-[10px] text-indigo-400">
                                  {t('breed.generation', { gen: pet.generation })}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-400 mb-2">
                          {elementLabel} • {t('market.level')} {pet.level} • {pet.attack}⚔️ {pet.defense}🛡️ •{' '}
                          {t('dashboard.pet.hp')} {pet.hp}/{pet.maxHp}
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min={1}
                            value={petSellPrices[pet.id] ?? ''}
                            onChange={(e) =>
                              setPetSellPrices((prev) => ({
                                ...prev,
                                [pet.id]: e.target.value,
                              }))
                            }
                            placeholder={t('market.setPrice')}
                            className="w-20 px-2 py-1 rounded-md border border-slate-600 bg-slate-900 text-xs text-white"
                          />
                          <button
                            onClick={() => handleListForSale(pet.id)}
                            className="flex-1 px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs"
                          >
                            {isListed ? t('market.updateListing') : t('breed.listForSale')}
                          </button>
                        </div>
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
