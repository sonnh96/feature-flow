import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { API_BASE } from "./api";

interface AuthUser {
  id: string;
  email: string;
  display_name: string | null;
  status: string;
  roles: string[];
  permissions: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  roles: string[];
  isAdmin: boolean;
  signOut: () => void;
  hasPermission: (resource: string, action: string) => boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  roles: [],
  isAdmin: false,
  signOut: () => {},
  hasPermission: () => false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setLoading(false);
      return;
    }

    fetch(`${API_BASE}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          // Token invalid — clear
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          setUser(null);
          return;
        }
        const data = await res.json();
        const roles = (data.roles || []).map((r: { name: string }) => r.name);
        const permissions: string[] = [];
        for (const role of data.roles || []) {
          for (const p of role.permissions || []) {
            const key = `${p.resource}.${p.action}`;
            if (!permissions.includes(key)) permissions.push(key);
          }
        }
        setUser({
          id: data.id,
          email: data.email,
          display_name: data.display_name,
          status: data.status,
          roles,
          permissions,
        });
      })
      .catch(() => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setUser(null);
    window.location.href = "/auth";
  }, []);

  const hasPermission = useCallback(
    (resource: string, action: string) => {
      if (!user) return false;
      return user.permissions.includes(`${resource}.${action}`);
    },
    [user],
  );

  const roles = user?.roles ?? [];

  const value: AuthContextValue = {
    user,
    loading,
    roles,
    isAdmin: roles.includes("admin"),
    signOut,
    hasPermission,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
