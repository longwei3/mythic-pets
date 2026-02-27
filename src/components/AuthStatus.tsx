'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/components/AuthProvider';

export default function AuthStatus() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const { ready, username, playerId, isAuthenticated, logout } = useAuth();

  if (!ready) {
    return null;
  }

  if (!isAuthenticated || !username) {
    return (
      <Link
        href={`/auth?next=${encodeURIComponent(pathname || '/dashboard')}`}
        className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium"
      >
        {t('auth.loginButton')}
      </Link>
    );
  }

  const playerIdText = (playerId ?? 0).toString().padStart(5, '0');

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-col leading-tight">
        <span className="text-xs sm:text-sm text-slate-200">👤 {username}</span>
        <span className="text-[10px] sm:text-xs text-slate-400">ID {playerIdText}</span>
      </div>

      <button
        onClick={() => {
          logout();
          router.push('/');
        }}
        className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm font-medium text-slate-100"
      >
        {t('auth.logoutButton')}
      </button>
    </div>
  );
}
