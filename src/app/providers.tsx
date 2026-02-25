'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import i18n, { LANGUAGE_STORAGE_KEY } from '@/lib/i18n';
import { AuthProvider } from '@/components/AuthProvider';

const queryClient = new QueryClient();

function normalizeLanguage(lang: string): 'en' | 'zh' {
  return lang.startsWith('zh') ? 'zh' : 'en';
}

function syncLanguageSideEffects(lang: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const normalized = normalizeLanguage(lang);
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
  document.documentElement.lang = normalized === 'zh' ? 'zh-CN' : 'en';
}

export function Providers({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    syncLanguageSideEffects(i18n.resolvedLanguage ?? i18n.language);

    const handleLanguageChange = (lang: string) => {
      syncLanguageSideEffects(lang);
    };

    i18n.on('languageChanged', handleLanguageChange);
    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <AuthProvider>{children}</AuthProvider>
      </I18nextProvider>
    </QueryClientProvider>
  );
}
