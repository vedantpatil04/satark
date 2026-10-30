import React, { createContext, useContext, useState, useEffect } from "react";
import { UserResponse, authApi } from "@/api/auth";
import { supabase, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase";

interface AuthContextType {
  user: UserResponse | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: UserResponse) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("auth_token"));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshUser = async () => {
    const currentToken = localStorage.getItem("auth_token");
    if (!currentToken) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const userData = await authApi.getMe();
      setUser(userData);
    } catch (err) {
      console.warn("Session expired or token invalid:", err);
      localStorage.removeItem("auth_token");
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // 1. Initial user refresh
    refreshUser();

    // 2. Set up Supabase Auth Listener if publishable key is present
    if (SUPABASE_PUBLISHABLE_KEY && supabase) {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.access_token) {
          localStorage.setItem("auth_token", session.access_token);
          setToken(session.access_token);
          try {
            const userData = await authApi.getMe();
            setUser(userData);
          } catch (e) {
            console.warn("Could not fetch server profile for Supabase user:", e);
          }
        } else if (event === "SIGNED_OUT") {
          localStorage.removeItem("auth_token");
          setToken(null);
          setUser(null);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, []);

  const login = (newToken: string, newUser: UserResponse) => {
    localStorage.setItem("auth_token", newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const logout = async () => {
    try {
      if (SUPABASE_PUBLISHABLE_KEY && supabase) {
        await supabase.auth.signOut();
      }
    } catch (e) {
      console.warn("Supabase sign out error:", e);
    } finally {
      localStorage.removeItem("auth_token");
      setToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
