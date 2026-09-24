import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch } from '../utils/api';

export type ModulePermission = { read: boolean; edit: boolean };

export const MODULES = {
  PRODUCTION_PLANNING: 'Production Planning',
  QUALITY_CONTROL: 'Quality Control',
  BOTTLE_MASTER: 'Bottle Master',
  HOLIDAY_MASTER: 'Holiday Master',
} as const;

export interface AuthUser {
  employee_id: string;
  employee_name: string;
  department: string;
  email: string;
  phone_number: string;
  role: 'Editor' | 'Viewer';
  permissions: Record<string, ModulePermission>;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  hasPermission: (module: string, access: 'read' | 'edit') => boolean;
  login: (userId: string, password: string) => Promise<void>;
  signup: (details: Omit<AuthUser, 'role' | 'permissions'> & { password: string; role: AuthUser['role'] }) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem('authToken')) {
      setIsLoading(false);
      return;
    }
    apiFetch('/api/auth/me').then(setUser).catch(() => localStorage.removeItem('authToken')).finally(() => setIsLoading(false));
  }, []);

  const login = async (userId: string, password: string) => {
    const result = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ user_id: userId, password }) });
    localStorage.setItem('authToken', result.token);
    setUser(result.user);
  };

  const signup = async (details: Omit<AuthUser, 'role'> & { password: string; role: AuthUser['role'] }) => {
    await apiFetch('/api/auth/signup', { method: 'POST', body: JSON.stringify(details) });
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    await apiFetch('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) });
  };

  const hasPermission = (module: string, access: 'read' | 'edit') => {
    if (!user) return false;
    const perm = user.permissions?.[module];
    if (!perm) return false;
    if (access === 'read') return perm.read;
    return perm.read && perm.edit;
  };

  const logout = async () => {
    try { await apiFetch('/api/auth/logout', { method: 'POST' }); } finally {
      localStorage.removeItem('authToken');
      setUser(null);
      if (typeof window !== 'undefined' && window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  };

  return <AuthContext.Provider value={{ user, isLoading, hasPermission, login, signup, changePassword, logout }}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
