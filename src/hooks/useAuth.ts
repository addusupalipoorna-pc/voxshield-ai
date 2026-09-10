import { useState, useEffect, useCallback } from 'react';
import type { User, AuthResponse } from '../types/auth';

const TOKEN_KEY = 'voxshield_access_token';
const USER_KEY = 'voxshield_user_data';

export function useAuth() {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem(USER_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem(TOKEN_KEY);
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Validate stored token on mount
  useEffect(() => {
    if (!token) return;

    let isMounted = true;
    const verifySession = async () => {
      try {
        const response = await fetch('/api/v1/auth/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (response.ok) {
          const freshUser = await response.json();
          if (isMounted) {
            setUser(freshUser);
            localStorage.setItem(USER_KEY, JSON.stringify(freshUser));
          }
        } else {
          // Token invalid or expired
          if (isMounted) {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            setUser(null);
            setToken(null);
          }
        }
      } catch {
        // Backend temporarily offline; keep stored user if available
      }
    };

    verifySession();
    return () => {
      isMounted = false;
    };
  }, [token]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Login failed. Please check your credentials.');
      }

      const authData = data as AuthResponse;
      setToken(authData.access_token);
      setUser(authData.user);
      localStorage.setItem(TOKEN_KEY, authData.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(authData.user));
      setIsLoading(false);
      return true;
    } catch (err: unknown) {
      setIsLoading(false);
      const message = err instanceof Error ? err.message : 'An unexpected login error occurred.';
      setError(message);
      return false;
    }
  }, []);

  const register = useCallback(
    async (payload: {
      name: string;
      email: string;
      password: string;
      consent: boolean;
      phone?: string;
    }): Promise<boolean> => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/v1/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || 'Registration failed. Please check your details.');
        }

        const authData = data as AuthResponse;
        setToken(authData.access_token);
        setUser(authData.user);
        localStorage.setItem(TOKEN_KEY, authData.access_token);
        localStorage.setItem(USER_KEY, JSON.stringify(authData.user));
        setIsLoading(false);
        return true;
      } catch (err: unknown) {
        setIsLoading(false);
        const message = err instanceof Error ? err.message : 'An unexpected registration error occurred.';
        setError(message);
        return false;
      }
    },
    []
  );

  const logout = useCallback(() => {
    try {
      fetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => {});
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setUser(null);
      setToken(null);
      setError(null);
    }
  }, []);

  return {
    user,
    token,
    isAuthenticated: !!user,
    isLoading,
    error,
    clearError,
    login,
    register,
    logout,
  };
}
