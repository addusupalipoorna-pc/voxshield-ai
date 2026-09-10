import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User } from '../types/auth';
import {
  getToken,
  getStoredUser,
  setSession,
  clearSession,
  login as apiLogin,
  loginVerifyPhoneOTP,
  loginVerifyEmailOTP,
  register as apiRegister,
  logout as apiLogout,
  getMe,
  type RegisterPayload,
} from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isAnalyst: boolean;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  loginWithPhoneOTP: (phone: string, otp: string) => Promise<void>;
  loginWithEmailOTP: (email: string, otp: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [user, setUserState] = useState<User | null>(() => getStoredUser());
  const [loading, setLoading] = useState<boolean>(true);

  const refreshMe = useCallback(async () => {
    if (!getToken()) {
      setUserState(null);
      setLoading(false);
      return;
    }
    try {
      const u = await getMe();
      setUserState(u as User);
      setSession(getToken()!, u);
    } catch {
      // If token expired or invalid, clear
      clearSession();
      setTokenState(null);
      setUserState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const login = async (email: string, pass: string) => {
    const res = await apiLogin(email, pass);
    setTokenState(res.access_token);
    setUserState(res.user as User);
  };

  const loginWithPhoneOTP = async (phone: string, otp: string) => {
    const res = await loginVerifyPhoneOTP(phone, otp);
    setTokenState(res.access_token);
    setUserState(res.user as User);
  };

  const loginWithEmailOTP = async (email: string, otp: string) => {
    const res = await loginVerifyEmailOTP(email, otp);
    setTokenState(res.access_token);
    setUserState(res.user as User);
  };

  const register = async (payload: RegisterPayload) => {
    const res = await apiRegister(payload);
    setTokenState(res.access_token);
    setUserState(res.user as User);
  };

  const logout = async () => {
    await apiLogout();
    setTokenState(null);
    setUserState(null);
  };

  const isAuthenticated = !!user && !!token;
  const isAdmin = user?.role === 'ADMIN';
  const isAnalyst = user?.role === 'SECURITY_ANALYST' || user?.role === 'ADMIN';

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        isAdmin,
        isAnalyst,
        loading,
        login,
        loginWithPhoneOTP,
        loginWithEmailOTP,
        register,
        logout,
        refreshMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
