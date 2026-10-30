import React, { createContext, useContext, useState, useEffect } from "react";
import type { UserResponse } from "@satark/shared-types";
import { authApi } from "@satark/shared-api";

export interface AuthContextType {
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
  const [token, setToken] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("auth_token") : null
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshUser = async () => {
    const currentToken = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    if (!currentToken) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const userData = await authApi.getMe();
      setUser(userData);
    } catch (err) {
      console.warn("Local session expired or token invalid:", err);
      if (typeof window !== "undefined") {
        localStorage.removeItem("auth_token");
      }
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = (newToken: string, newUser: UserResponse) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("auth_token", newToken);
    }
    setToken(newToken);
    setUser(newUser);
  };

  const logout = async () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("auth_token");
    }
    setToken(null);
    setUser(null);
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

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
