'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';

interface RequireAuthProps {
  title?: string;
}

export default function RequireAuth({ title }: RequireAuthProps) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center bg-slate-800/70 border border-slate-700 rounded-2xl p-8">
        <h2 className="text-2xl text-white mb-3">{title || t('auth.loginRequired')}</h2>
        <p className="text-slate-400 mb-6">{t('auth.loginHint')}</p>
        <Link
          href="/auth"
          className="inline-block px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-semibold"
        >
          {t('auth.loginOrRegister')}
        </Link>
      </div>
    </div>
  );
}
