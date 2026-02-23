'use client';

import * as React from 'react';
import {
  RainbowKitProvider,
  darkTheme,
} from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { mainnet, base, baseSepolia } from 'wagmi/chains';
import { http, createConfig } from 'wagmi';
import { SessionProvider } from 'next-auth/react';
import { I18nextProvider } from 'react-i18next';
import i18n, { LANGUAGE_STORAGE_KEY } from '@/lib/i18n';

const config = createConfig({
  chains: [mainnet, base, baseSepolia],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [baseSepolia.id]: http(),
  },
});

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
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#6366F1',
            accentColorForeground: 'white',
            borderRadius: 'medium',
            fontStack: 'system',
            overlayBlur: 'small',
          })}
          showRecentTransactions={true}
        >
          <I18nextProvider i18n={i18n}>
            <SessionProvider>
              {children}
            </SessionProvider>
          </I18nextProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
