'use client';

import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import GlobalMythChip from '@/components/GlobalMythChip';
import { useAuth } from '@/components/AuthProvider';
import {
  playAuthUiEffect,
  startAuthShowcaseEffects,
  startAuthShowcaseMusic,
  stopAuthShowcaseEffects,
  stopAuthShowcaseMusic,
} from '@/lib/sounds';

type Mode = 'login' | 'register';

const showcaseOrbs = [
  {
    left: '8%',
    top: '14%',
    size: 240,
    duration: 13,
    pulse: 4.8,
    delay: 0,
    color: 'rgba(56, 189, 248, 0.28)',
    glow: 'rgba(56, 189, 248, 0.35)',
  },
  {
    left: '74%',
    top: '18%',
    size: 200,
    duration: 15,
    pulse: 5.2,
    delay: 1.4,
    color: 'rgba(167, 139, 250, 0.26)',
    glow: 'rgba(167, 139, 250, 0.33)',
  },
  {
    left: '22%',
    top: '68%',
    size: 190,
    duration: 16,
    pulse: 4.1,
    delay: 0.7,
    color: 'rgba(52, 211, 153, 0.2)',
    glow: 'rgba(45, 212, 191, 0.28)',
  },
  {
    left: '78%',
    top: '72%',
    size: 230,
    duration: 14,
    pulse: 5.6,
    delay: 2.1,
    color: 'rgba(59, 130, 246, 0.2)',
    glow: 'rgba(99, 102, 241, 0.3)',
  },
];

const floatingLobsters = [
  { left: '13%', top: '28%', size: 42, duration: 8.6, delay: 0.2 },
  { left: '86%', top: '26%', size: 32, duration: 9.4, delay: 1.4 },
  { left: '19%', top: '78%', size: 34, duration: 10.2, delay: 0.8 },
  { left: '81%', top: '70%', size: 44, duration: 8.9, delay: 2.2 },
];

function AuthPageContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, isAuthenticated, username, login, register } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);

  const nextPath = useMemo(() => {
    const next = searchParams.get('next');
    if (next && next.startsWith('/')) {
      return next;
    }
    return '/dashboard';
  }, [searchParams]);

  const translateAuthError = (code?: string) => {
    if (!code) {
      return t('auth.errorUnknown');
    }
    return t(`auth.errors.${code}`);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setError(null);

    if (mode === 'register' && password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      if (audioEnabled) {
        playAuthUiEffect('error');
      }
      return;
    }

    setSubmitting(true);
    try {
      const result = mode === 'login' ? await login(account, password) : await register(account, password);
      if (!result.ok) {
        setError(translateAuthError(result.code));
        if (audioEnabled) {
          playAuthUiEffect('error');
        }
        return;
      }

      if (audioEnabled) {
        playAuthUiEffect('success');
      }
      router.replace(nextPath);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const unlockAudio = () => {
      if (audioEnabled) {
        startAuthShowcaseMusic();
        startAuthShowcaseEffects();
      }
    };

    if (audioEnabled) {
      startAuthShowcaseMusic();
      startAuthShowcaseEffects();
    } else {
      stopAuthShowcaseMusic();
      stopAuthShowcaseEffects();
    }

    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio);

    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      stopAuthShowcaseMusic();
      stopAuthShowcaseEffects();
    };
  }, [audioEnabled]);

  const renderShowcaseBackground = () => (
    <>
      <div className="auth-showcase-bg" />
      <div className="auth-grid-overlay" />
      <div className="auth-scanline" />
      {showcaseOrbs.map((orb, index) => (
        <span
          key={`orb-${index}`}
          className="auth-orb"
          style={{
            left: orb.left,
            top: orb.top,
            width: `${orb.size}px`,
            height: `${orb.size}px`,
            background: orb.color,
            boxShadow: `0 0 46px ${orb.glow}`,
            animationDuration: `${orb.duration}s, ${orb.pulse}s`,
            animationDelay: `${orb.delay}s, ${orb.delay * 0.4}s`,
          }}
        />
      ))}
      {floatingLobsters.map((item, index) => (
        <span
          key={`lobster-${index}`}
          className="auth-lobster-float"
          style={{
            left: item.left,
            top: item.top,
            fontSize: `${item.size}px`,
            animationDuration: `${item.duration}s, 4.2s`,
            animationDelay: `${item.delay}s, ${item.delay * 0.5}s`,
          }}
        >
          🦞
        </span>
      ))}
    </>
  );

  return (
    <div className="min-h-screen relative overflow-hidden bg-slate-950">
      {renderShowcaseBackground()}
      <header className="relative z-10 flex items-start justify-between px-6 py-4">
        <div className="flex flex-col items-start gap-2">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-3xl drop-shadow-[0_0_14px_rgba(99,102,241,0.65)]">🦞</span>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-300 via-indigo-300 to-fuchsia-300 bg-clip-text text-transparent">
              {t('common.appName')}
            </h1>
          </Link>
          <GlobalMythChip floating={false} />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (audioEnabled) {
                playAuthUiEffect('switch');
              }
              setAudioEnabled((prev) => !prev);
            }}
            className="px-3 py-2 rounded-lg bg-slate-800/70 border border-slate-600 hover:border-fuchsia-400 text-xs sm:text-sm"
          >
            {audioEnabled ? `🔊 ${t('auth.audioOn')}` : `🔇 ${t('auth.audioOff')}`}
          </button>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="relative z-10 container mx-auto px-4 py-16">
        <div className="max-w-md mx-auto bg-slate-900/72 border border-cyan-400/30 rounded-2xl p-8 shadow-[0_0_42px_rgba(56,189,248,0.2)] backdrop-blur-xl">
          <h2 className="text-3xl font-bold text-center mb-2 bg-gradient-to-r from-cyan-300 via-indigo-200 to-fuchsia-300 bg-clip-text text-transparent">
            {ready && isAuthenticated && username
              ? t('auth.alreadyLoggedIn')
              : mode === 'login'
                ? t('auth.loginTitle')
                : t('auth.registerTitle')}
          </h2>
          <p className="text-center text-slate-300 mb-2">{t('auth.subtitle')}</p>
          <p className="text-center text-xs text-cyan-200/90 mb-6">{t('auth.musicHint')}</p>

          {ready && isAuthenticated && username ? (
            <div className="text-center">
              <p className="text-slate-300 mb-6">{t('auth.currentUser', { username })}</p>
              <Link
                href={nextPath}
                className="inline-block px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-semibold"
              >
                {t('auth.continueGame')}
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label htmlFor="account" className="block text-sm text-slate-300 mb-1">
                  {t('auth.usernameLabel')}
                </label>
                <input
                  id="account"
                  value={account}
                  onChange={(event) => setAccount(event.target.value)}
                  autoComplete="username"
                  placeholder={t('auth.usernamePlaceholder')}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-slate-100 focus:outline-none focus:border-indigo-400"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm text-slate-300 mb-1">
                  {t('auth.passwordLabel')}
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder={t('auth.passwordPlaceholder')}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-slate-100 focus:outline-none focus:border-indigo-400"
                />
              </div>

              {mode === 'register' && (
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm text-slate-300 mb-1">
                    {t('auth.confirmPasswordLabel')}
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder={t('auth.confirmPasswordPlaceholder')}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-slate-100 focus:outline-none focus:border-indigo-400"
                  />
                </div>
              )}

              {error && <p className="text-sm text-rose-300">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                onMouseEnter={() => {
                  if (audioEnabled) {
                    playAuthUiEffect('switch');
                  }
                }}
                className="w-full px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? '...' : mode === 'login' ? t('auth.loginButton') : t('auth.registerButton')}
              </button>
            </form>
          )}

          {!ready || !isAuthenticated ? (
            <div className="mt-4 text-center text-sm text-slate-400">
              {mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'login' ? 'register' : 'login');
                  setError(null);
                  if (audioEnabled) {
                    playAuthUiEffect('switch');
                  }
                }}
                className="ml-1 text-indigo-300 hover:text-indigo-200"
              >
                {mode === 'login' ? t('auth.switchToRegister') : t('auth.switchToLogin')}
              </button>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
      <AuthPageContent />
    </Suspense>
  );
}
