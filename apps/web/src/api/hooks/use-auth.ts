import { useEffect } from "react";
import { create } from "zustand";
import {
  normalizeAppearanceSettings,
  normalizeGeneralSettings,
  type AppearanceSettings,
  type GeneralSettings,
} from "@mindtab/core";
import { api, setAccessToken } from "../client";

export interface User extends AppearanceSettings, GeneralSettings {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  onboardingCompleted: boolean;
}

interface AuthSession {
  accessToken: string;
  user: User;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  _hasChecked: boolean;
  _isChecking: boolean;
  _refreshSession: () => Promise<AuthSession | null>;
  setSession: (session: AuthSession) => void;
  login: (googleIdToken: string) => Promise<AuthSession>;
  updateAppearance: (appearance: Partial<AppearanceSettings & GeneralSettings>) => Promise<User>;
  logout: () => Promise<void>;
}

let refreshSessionPromise: Promise<AuthSession | null> | null = null;

const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: true,
  _hasChecked: false,
  _isChecking: false,

  _refreshSession: async () => {
    if (refreshSessionPromise) return refreshSessionPromise;

    set({ _isChecking: true });

    refreshSessionPromise = (async () => {
      const { data, error } = await api.POST("/auth/refresh");
      if (data && !error) {
        setAccessToken(data.accessToken);
        // Fetch user info
        const userRes = await api.GET("/users/me");
        if (userRes.data) {
          const user = normalizeUser(userRes.data as User);
          set({
            user,
            accessToken: data.accessToken,
            isAuthenticated: true,
            isLoading: false,
            _hasChecked: true,
            _isChecking: false,
          });
          return {
            accessToken: data.accessToken,
            user,
          };
        }
      }
      setAccessToken(null);
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
        _hasChecked: true,
        _isChecking: false,
      });
      return null;
    })();

    try {
      return await refreshSessionPromise;
    } catch {
      setAccessToken(null);
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
        _hasChecked: true,
        _isChecking: false,
      });
      return null;
    } finally {
      refreshSessionPromise = null;
    }
  },

  setSession: (session) => {
    const user = normalizeUser(session.user);
    setAccessToken(session.accessToken);
    set({
      user,
      accessToken: session.accessToken,
      isAuthenticated: true,
      isLoading: false,
      _hasChecked: true,
      _isChecking: false,
    });
  },

  login: async (googleIdToken: string) => {
    const { data, error } = await api.POST("/auth/google", {
      body: { idToken: googleIdToken },
    });
    if (error || !data) {
      throw new Error("Google sign in failed");
    }

    const session = {
      accessToken: data.accessToken,
      user: normalizeUser(data.user as User),
    };
    get().setSession(session);
    return session;
  },

  updateAppearance: async (appearance) => {
    const { data, error } = await api.PATCH("/users/me", {
      body: appearance,
    });

    if (error || !data) {
      throw new Error("Failed to update appearance");
    }

    const user = normalizeUser(data as User);
    set({ user });
    return user;
  },

  logout: async () => {
    const logoutRequest = api.POST("/auth/logout");

    setAccessToken(null);
    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      _hasChecked: true,
      _isChecking: false,
    });

    try {
      await logoutRequest;
    } catch {
      // Best-effort: without a server response, the httpOnly cookie may remain.
    }
  },
}));

export function useAuth() {
  const store = useAuthStore();

  // On first call, trigger a refresh check
  useEffect(() => {
    if (!store._hasChecked) {
      store._refreshSession();
    }
  }, [store._hasChecked]);

  return {
    user: store.user,
    accessToken: store.accessToken,
    isAuthenticated: store.isAuthenticated,
    isLoading: store.isLoading,
    login: store.login,
    setSession: store.setSession,
    updateAppearance: store.updateAppearance,
    logout: store.logout,
    refreshSession: store._refreshSession,
  };
}

function normalizeUser(user: User): User {
  const appearance = normalizeAppearanceSettings(user);
  const general = normalizeGeneralSettings(user);
  return {
    ...user,
    ...appearance,
    ...general,
  };
}
