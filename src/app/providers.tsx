'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import i18n, { LANGUAGE_STORAGE_KEY } from '@/lib/i18n';
import { AuthProvider } from '@/components/AuthProvider';

const queryClient = new QueryClient();
const CHUNK_RECOVERY_FLAG = 'mythicpets-chunk-recover-once';

function isChunkLoadErrorMessage(message: string): boolean {
  const patterns = [
    /chunkloaderror/i,
    /loading chunk/i,
    /failed to fetch dynamically imported module/i,
    /importing a module script failed/i,
    /failed to fetch module script/i,
  ];
  return patterns.some((pattern) => pattern.test(message));
}

function recoverFromChunkLoadError(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const current = window.location.href;
  const recoveredFor = sessionStorage.getItem(CHUNK_RECOVERY_FLAG);
  if (recoveredFor === current) {
    return;
  }

  sessionStorage.setItem(CHUNK_RECOVERY_FLAG, current);
  const url = new URL(current);
  url.searchParams.set('_reload', Date.now().toString());
  window.location.replace(url.toString());
}

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

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const clearRecoveryFlag = () => {
      sessionStorage.removeItem(CHUNK_RECOVERY_FLAG);
    };

    const handleWindowError = (event: ErrorEvent) => {
      const message = [
        event.message,
        event.error instanceof Error ? event.error.message : '',
      ]
        .filter(Boolean)
        .join(' | ');
      if (!message || !isChunkLoadErrorMessage(message)) {
        return;
      }
      recoverFromChunkLoadError();
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reasonText =
        event.reason instanceof Error
          ? `${event.reason.name}: ${event.reason.message}`
          : typeof event.reason === 'string'
            ? event.reason
            : '';
      if (!reasonText || !isChunkLoadErrorMessage(reasonText)) {
        return;
      }
      recoverFromChunkLoadError();
    };

    clearRecoveryFlag();
    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </I18nextProvider>
    </QueryClientProvider>
  );
}
