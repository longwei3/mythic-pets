'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { readMythBalance } from '@/lib/economy';
import { readHealthPotionCount, readMagicPotionCount } from '@/lib/magicPotions';

interface GlobalMythChipProps {
  floating?: boolean;
  className?: string;
}

export default function GlobalMythChip({ floating = true, className = '' }: GlobalMythChipProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { ready, isAuthenticated, username } = useAuth();
  const [balance, setBalance] = useState(0);
  const [magicPotionCount, setMagicPotionCount] = useState(0);
  const [healthPotionCount, setHealthPotionCount] = useState(0);

  useEffect(() => {
    if (!ready || !isAuthenticated || !username) {
      setBalance(0);
      return;
    }

    const sync = () => {
      setBalance(readMythBalance(username));
      setMagicPotionCount(readMagicPotionCount(username));
      setHealthPotionCount(readHealthPotionCount(username));
    };

    sync();
    const timer = setInterval(sync, 1000);
    const onStorage = (event: StorageEvent) => {
      if (
        !event.key ||
        event.key.includes('mythicpets-token-balance') ||
        event.key.includes('mythicpets-magic-potions') ||
        event.key.includes('mythicpets-health-potions')
      ) {
        sync();
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      clearInterval(timer);
      window.removeEventListener('storage', onStorage);
    };
  }, [isAuthenticated, ready, username]);

  if (!ready || !isAuthenticated || !username) {
    return null;
  }

  if (floating && (pathname?.startsWith('/adventure3d') || pathname?.startsWith('/auth'))) {
    return null;
  }

  const chip = (
    <div className="rounded-2xl border border-amber-400/35 bg-slate-900/85 px-3 py-2 text-xs font-medium text-amber-200 backdrop-blur-sm shadow-lg">
      <div className="flex items-center gap-3">
        <div className="whitespace-nowrap">💰 {t('dashboard.mythBalance', { amount: balance })}</div>
        <div className="flex flex-col leading-tight">
          <span className="text-cyan-300">🧪 {magicPotionCount}</span>
          <span className="text-rose-300">❤️ {healthPotionCount}</span>
        </div>
      </div>
    </div>
  );

  if (floating) {
    return <div className="fixed left-3 top-3 z-[70] pointer-events-none">{chip}</div>;
  }

  return <div className={className}>{chip}</div>;
}
