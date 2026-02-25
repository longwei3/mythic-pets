'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/components/AuthProvider';

export default function AuthStatus() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const { ready, username, isAuthenticated, logout } = useAuth();

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

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs sm:text-sm text-slate-200">👤 {username}</span>
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
