'use client';

import * as React from 'react';
import {
  loginWithPassword,
  logoutAuthSession,
  readAuthSession,
  registerWithPassword,
  type AuthActionResult,
} from '@/lib/auth';

interface AuthContextValue {
  ready: boolean;
  username: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => AuthActionResult;
  register: (username: string, password: string) => AuthActionResult;
  logout: () => void;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);
  const [username, setUsername] = React.useState<string | null>(null);

  const syncFromStorage = React.useCallback(() => {
    const session = readAuthSession();
    setUsername(session?.username || null);
    setReady(true);
  }, []);

  React.useEffect(() => {
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

  const login = React.useCallback((nextUsername: string, password: string) => {
    const result = loginWithPassword(nextUsername, password);
    syncFromStorage();
    return result;
  }, [syncFromStorage]);

  const register = React.useCallback((nextUsername: string, password: string) => {
    const result = registerWithPassword(nextUsername, password);
    syncFromStorage();
    return result;
  }, [syncFromStorage]);

  const logout = React.useCallback(() => {
    logoutAuthSession();
    syncFromStorage();
  }, [syncFromStorage]);

  const value = React.useMemo<AuthContextValue>(() => ({
    ready,
    username,
    isAuthenticated: Boolean(username),
    login,
    register,
    logout,
  }), [ready, username, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
