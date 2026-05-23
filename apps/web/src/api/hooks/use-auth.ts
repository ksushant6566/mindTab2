import { useEffect } from "react";
import { create } from "zustand";
import type { AppearanceTheme, FontPreset } from "@mindtab/core";
import { api, setAccessToken } from "../client";

interface User {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  xp: number;
  onboardingCompleted: boolean;
  theme: AppearanceTheme;
  font: FontPreset;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  _hasChecked: boolean;
  _isChecking: boolean;
  _refreshSession: () => Promise<void>;
  login: (googleIdToken: string) => Promise<void>;
  updateAppearance: (appearance: {
    theme?: AppearanceTheme;
    font?: FontPreset;
  }) => Promise<User>;
  logout: () => void;
}

const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: true,
  _hasChecked: false,
  _isChecking: false,

  _refreshSession: async () => {
    if (get()._isChecking) return;
    set({ _isChecking: true });

    try {
      const { data, error } = await api.POST("/auth/refresh");
      if (data && !error) {
        setAccessToken(data.accessToken);
        // Fetch user info
        const userRes = await api.GET("/users/me");
        if (userRes.data) {
          set({
            user: userRes.data as User,
            accessToken: data.accessToken,
            isAuthenticated: true,
            isLoading: false,
            _hasChecked: true,
            _isChecking: false,
          });
          return;
        }
      }
    } catch {
      // Refresh failed — user is not authenticated
    }
    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      _hasChecked: true,
      _isChecking: false,
    });
  },

  login: async (googleIdToken: string) => {
    const { data, error } = await api.POST("/auth/google", {
      body: { idToken: googleIdToken },
    });
    if (data && !error) {
      setAccessToken(data.accessToken);
      set({
        user: data.user as User,
        accessToken: data.accessToken,
        isAuthenticated: true,
        isLoading: false,
        _hasChecked: true,
      });
    }
  },

  updateAppearance: async (appearance) => {
    const { data, error } = await api.PATCH("/users/me", {
      body: appearance,
    });

    if (error || !data) {
      throw new Error("Failed to update appearance");
    }

    const user = data as User;
    set({ user });
    return user;
  },

  logout: () => {
    setAccessToken(null);
    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      _hasChecked: true,
      _isChecking: false,
    });
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
    updateAppearance: store.updateAppearance,
    logout: store.logout,
    refreshSession: store._refreshSession,
  };
}
