'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { DEMO_USER, UserProfile } from '@sem/shared';
import { apiRequest, getApiBaseUrl } from './api-client';
import { safeStorageGet, safeStorageRemove, safeStorageSet } from './storage';
import { getSupabaseBrowserClient, isSupabaseConfigured } from './supabase';

interface AuthState {
  user: UserProfile | null;
  token: string | null;
  isDemoMode: boolean;
  isLoading: boolean;
  cloudConfigured: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (payload: {
    fullName: string;
    email: string;
    mobileNumber: string;
    password: string;
    organization?: string;
    acceptedTerms: true;
  }) => Promise<{ verificationRequired: boolean; message: string }>;
  logout: () => Promise<void>;
  enterDemoMode: () => void;
  exitDemoMode: () => void;
  updateProfileLocal: (patch: Partial<UserProfile>) => void;
  startGoogleAuth: () => void;
  exchangeGoogleToken: (payload: {
    supabaseAccessToken?: string;
    googleIdToken?: string;
  }) => Promise<{ user: UserProfile; otpToken: string; message: string; previewOtp?: string }>;
  sendEmailOtp: (email: string) => Promise<{ otpToken: string; message: string; previewOtp?: string }>;
  verifyEmailOtp: (email: string, code: string, otpToken: string) => Promise<UserProfile>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const cloudConfigured = isSupabaseConfigured();

  useEffect(() => {
    const demoFlag = safeStorageGet('sem_demo_mode');
    const savedToken = safeStorageGet('sem_token');
    const savedUser = safeStorageGet('sem_user');

    if (demoFlag === 'true') {
      setIsDemoMode(true);
      setUser(DEMO_USER);
      setToken(null);
      setIsLoading(false);
      return;
    }

    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser) as UserProfile);
      } catch {
        safeStorageRemove('sem_token');
        safeStorageRemove('sem_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (identifier: string, password: string) => {
    const res = await apiRequest<{ user: UserProfile; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    safeStorageRemove('sem_demo_mode');
    safeStorageSet('sem_token', res.token);
    safeStorageSet('sem_user', JSON.stringify(res.user));
    setIsDemoMode(false);
    setToken(res.token);
    setUser(res.user);
  };

  const register = async (payload: {
    fullName: string;
    email: string;
    mobileNumber: string;
    password: string;
    organization?: string;
    acceptedTerms: true;
  }) => {
    const res = await apiRequest<{
      user: UserProfile;
      token?: string;
      verificationRequired?: boolean;
      otp?: { otpToken: string; message: string; previewOtp?: string };
      message?: string;
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (res.token) {
      safeStorageRemove('sem_demo_mode');
      safeStorageSet('sem_token', res.token);
      safeStorageSet('sem_user', JSON.stringify(res.user));
      setIsDemoMode(false);
      setToken(res.token);
      setUser(res.user);
    }
    return {
      verificationRequired: Boolean(res.verificationRequired),
      message: res.message || 'Account created successfully.',
    };
  };

  const startGoogleAuth = () => {
    if (typeof window === 'undefined') return;
    const redirectTo = `${window.location.origin}/auth/callback`;
    window.location.assign(`${getApiBaseUrl()}/auth/google/start?redirect_to=${encodeURIComponent(redirectTo)}`);
  };

  const exchangeGoogleToken = async (payload: { supabaseAccessToken?: string; googleIdToken?: string }) => {
    return apiRequest<{ user: UserProfile; otpToken: string; message: string; previewOtp?: string }>('/auth/google', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  };

  const sendEmailOtp = async (email: string) => {
    return apiRequest<{ otpToken: string; message: string; previewOtp?: string }>('/auth/otp/send', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  };

  const verifyEmailOtp = async (email: string, code: string, otpToken: string): Promise<UserProfile> => {
    const res = await apiRequest<{ user: UserProfile; token: string }>('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code, otpToken }),
    });
    safeStorageRemove('sem_demo_mode');
    safeStorageSet('sem_token', res.token);
    safeStorageSet('sem_user', JSON.stringify(res.user));
    setIsDemoMode(false);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const logout = async () => {
    if (token && !isDemoMode) {
      try {
        await apiRequest('/auth/logout', { method: 'POST', token });
      } catch {
        // Proceed with local session clearance even if offline
      }
    }
    const sb = getSupabaseBrowserClient();
    if (sb) {
      await sb.auth.signOut().catch(() => {});
    }
    safeStorageRemove('sem_token');
    safeStorageRemove('sem_user');
    safeStorageRemove('sem_demo_mode');
    setToken(null);
    setUser(null);
    setIsDemoMode(false);
  };

  const enterDemoMode = () => {
    safeStorageSet('sem_demo_mode', 'true');
    safeStorageRemove('sem_token');
    safeStorageRemove('sem_user');
    setToken(null);
    setIsDemoMode(true);
    setUser(DEMO_USER);
  };

  const exitDemoMode = () => {
    safeStorageRemove('sem_demo_mode');
    setIsDemoMode(false);
    setUser(null);
    setToken(null);
  };

  const updateProfileLocal = (patch: Partial<UserProfile>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...patch };
      if (!isDemoMode) {
        safeStorageSet('sem_user', JSON.stringify(updated));
      }
      return updated;
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isDemoMode,
        isLoading,
        cloudConfigured,
        login,
        register,
        logout,
        enterDemoMode,
        exitDemoMode,
        updateProfileLocal,
        startGoogleAuth,
        exchangeGoogleToken,
        sendEmailOtp,
        verifyEmailOtp,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
