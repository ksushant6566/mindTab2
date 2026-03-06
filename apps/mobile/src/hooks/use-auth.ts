import { create } from "zustand";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { api } from "~/lib/api-client";
import {
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
  clearTokens,
  refreshTokens,
} from "~/lib/auth";

type User = {
  id: string;
  name: string;
  email: string;
  image: string;
  xp: number;
  onboardingCompleted: boolean;
};

type AuthState = {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  _hasChecked: boolean;
  _refreshSession: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
};

GoogleSignin.configure({
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
});

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";

const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  _hasChecked: false,

  _refreshSession: async () => {
    try {
      const hasToken = await getRefreshToken();
      if (!hasToken) {
        set({ isLoading: false, _hasChecked: true });
        return;
      }

      const refreshed = await refreshTokens();
      if (!refreshed) {
        set({ user: null, isAuthenticated: false, isLoading: false, _hasChecked: true });
        return;
      }

      // Fetch user profile
      const { data: user, error } = await api.GET("/users/me");
      if (error) throw error;

      set({
        user: user as User,
        isAuthenticated: true,
        isLoading: false,
        _hasChecked: true,
      });
    } catch {
      await clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false, _hasChecked: true });
    }
  },

  login: async () => {
    try {
      set({ isLoading: true });
      await GoogleSignin.hasPlayServices();
      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult.data?.idToken;

      if (!idToken) throw new Error("No ID token");

      const res = await fetch(`${API_URL}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Platform": "mobile" },
        body: JSON.stringify({ idToken }),
      });

      if (!res.ok) throw new Error("Login failed");

      const data = await res.json();
      await setAccessToken(data.accessToken);
      await setRefreshToken(data.refreshToken);

      set({
        user: data.user as User,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    await clearTokens();
    try { await GoogleSignin.signOut(); } catch {}
    set({ user: null, isAuthenticated: false, _hasChecked: false });
  },
}));

export function useAuth() {
  const store = useAuthStore();
  return {
    user: store.user,
    isAuthenticated: store.isAuthenticated,
    isLoading: store.isLoading,
    hasChecked: store._hasChecked,
    login: store.login,
    logout: store.logout,
    refreshSession: store._refreshSession,
  };
}
