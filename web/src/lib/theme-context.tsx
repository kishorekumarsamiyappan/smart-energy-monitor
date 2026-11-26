'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { safeStorageGet, safeStorageSet } from './storage';

type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('light');

  useEffect(() => {
    const saved = safeStorageGet('sem_theme');
    const resolved: ThemeMode = saved === 'dark' ? 'dark' : 'light';
    setThemeState(resolved);
    document.documentElement.setAttribute('data-theme', resolved);
  }, []);

  const setTheme = (next: ThemeMode) => {
    setThemeState(next);
    safeStorageSet('sem_theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
