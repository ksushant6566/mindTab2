import { useEffect } from "react";
import { create } from "zustand";
import { api, setAccessToken } from "../client";

interface User {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  xp: number;
  onboardingCompleted: boolean;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  _hasChecked: boolean;
  _refreshSession: () => Promise<void>;
  login: (googleIdToken: string) => Promise<void>;
  logout: () => void;
}

const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: true,
  _hasChecked: false,

  _refreshSession: async () => {
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
      });
    }
  },

  logout: () => {
    setAccessToken(null);
    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
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
    logout: store.logout,
    refreshSession: store._refreshSession,
  };
}
