'use client';

import * as React from 'react';
import {
  loginWithCloudCheck,
  readPlayerId,
  loginWithPassword,
  logoutAuthSession,
  readAuthSession,
  registerWithPassword,
  syncAuthUserToCloud,
  type AuthActionResult,
} from '@/lib/auth';
import { migrateToEncrypted, patchLocalStorage } from '@/lib/secureStorage';
import { loadFromCloud, startAutoSync, stopAutoSync, syncToCloud } from '@/lib/cloudSync';
import { startAutoCloudBackup, stopAutoCloudBackup, triggerAutoCloudBackup } from '@/lib/autoCloudBackup';

interface AuthContextValue {
  ready: boolean;
  username: string | null;
  playerId: number | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<AuthActionResult>;
  register: (username: string, password: string) => Promise<AuthActionResult>;
  logout: () => void;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);
  const [username, setUsername] = React.useState<string | null>(null);
  const [playerId, setPlayerId] = React.useState<number | null>(null);

  const syncFromStorage = React.useCallback(() => {
    const session = readAuthSession();
    const nextUsername = session?.username || null;
    setUsername(nextUsername);
    setPlayerId(nextUsername ? readPlayerId(nextUsername) : null);
    setReady(true);
  }, []);

  React.useEffect(() => {
    // Patch localStorage to auto-encrypt/decrypt game data
    patchLocalStorage();
    syncFromStorage();
  }, [syncFromStorage]);

  React.useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === 'mythicpets-auth-session') {
        syncFromStorage();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [syncFromStorage]);

  React.useEffect(() => {
    if (!ready) {
      return;
    }

    if (!username) {
      stopAutoSync();
      return;
    }

    let cancelled = false;
    const initializeCloudSync = async () => {
      migrateToEncrypted();
      const result = await loadFromCloud();
      if (cancelled) {
        return;
      }

      if (result.ok) {
        startAutoSync();
      } else if (result.error && result.error !== 'Cloud not configured') {
        console.warn('Cloud load failed:', result.error);
      }
      startAutoCloudBackup();
    };

    void initializeCloudSync();
    return () => {
      cancelled = true;
      stopAutoSync();
      stopAutoCloudBackup();
    };
  }, [ready, username]);

  const login = React.useCallback(async (nextUsername: string, password: string) => {
    let result = loginWithPassword(nextUsername, password);

    if (!result.ok && (result.code === 'user-not-found' || result.code === 'wrong-password')) {
      const cloudResult = await loginWithCloudCheck(nextUsername, password);
      if (cloudResult.ok) {
        result = cloudResult;
      } else if (result.code === 'user-not-found') {
        result = cloudResult;
      }
    }

    if (result.ok && result.username) {
      try {
        await syncAuthUserToCloud(result.username);
      } catch (error) {
        console.warn('Auth cloud sync after login failed:', error);
      }
    }

    syncFromStorage();
    return result;
  }, [syncFromStorage]);

  const register = React.useCallback(async (nextUsername: string, password: string) => {
    const result = registerWithPassword(nextUsername, password);
    if (result.ok && result.username) {
      try {
        await syncAuthUserToCloud(result.username);
      } catch (error) {
        console.warn('Auth cloud sync after register failed:', error);
      }
    }
    syncFromStorage();
    return result;
  }, [syncFromStorage]);

  const logout = React.useCallback(() => {
    stopAutoSync();
    stopAutoCloudBackup();
    // Sync to cloud before logout
    void syncToCloud();
    triggerAutoCloudBackup();
    logoutAuthSession();
    syncFromStorage();
  }, [syncFromStorage]);

  const value = React.useMemo<AuthContextValue>(() => ({
    ready,
    username,
    playerId,
    isAuthenticated: Boolean(username),
    login,
    register,
    logout,
  }), [ready, username, playerId, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
