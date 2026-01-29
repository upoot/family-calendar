import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface Family {
  id: number;
  name: string;
  slug: string;
  invite_code: string;
  user_role: string;
}

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  must_change_password: number;
  families: Family[];
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  currentFamilyId: number | null;
  setCurrentFamilyId: (id: number) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>(null!);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [currentFamilyId, setCurrentFamilyId] = useState<number | null>(() => {
    const stored = localStorage.getItem('currentFamilyId');
    return stored ? parseInt(stored) : null;
  });

  const apiFetch = async (url: string, opts: RequestInit = {}) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers as Record<string, string> || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { ...opts, headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  };

  const refreshUser = async () => {
    if (!token) { setLoading(false); return; }
    try {
      const data = await apiFetch('/api/auth/me');
      setUser(data);
      if (!currentFamilyId && data.families.length > 0) {
        const fid = data.families[0].id;
        setCurrentFamilyId(fid);
        localStorage.setItem('currentFamilyId', String(fid));
      }
    } catch {
      setToken(null);
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refreshUser(); }, [token]);

  const login = async (email: string, password: string): Promise<string> => {
    const data = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    localStorage.setItem('token', data.token);
    setToken(data.token);
    // Fetch user data immediately and return target route
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${data.token}` };
      const res = await fetch('/api/auth/me', { headers });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        if (userData.must_change_password) return '/change-password';
        if (userData.families?.length > 0) {
          const fid = userData.families[0].id;
          setCurrentFamilyId(fid);
          localStorage.setItem('currentFamilyId', String(fid));
          return '/';
        }
        return '/onboarding';
      }
    } catch {}
    return '/';
  };

  const register = async (email: string, password: string, name: string): Promise<string> => {
    const data = await apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name }) });
    localStorage.setItem('token', data.token);
    setToken(data.token);
    // Fetch user data immediately and return target route
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${data.token}` };
      const res = await fetch('/api/auth/me', { headers });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        if (userData.families?.length > 0) {
          const fid = userData.families[0].id;
          setCurrentFamilyId(fid);
          localStorage.setItem('currentFamilyId', String(fid));
          return '/';
        }
        return '/onboarding';
      }
    } catch {}
    return '/';
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setCurrentFamilyId(null);
    localStorage.removeItem('token');
    localStorage.removeItem('currentFamilyId');
  };

  const updateFamilyId = (id: number) => {
    setCurrentFamilyId(id);
    localStorage.setItem('currentFamilyId', String(id));
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, currentFamilyId, setCurrentFamilyId: updateFamilyId, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
