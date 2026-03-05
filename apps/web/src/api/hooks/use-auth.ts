import { useState, useEffect, useCallback } from "react";
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
  isAuthenticated: boolean;
  isLoading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });

  // Try to restore session on mount via refresh token
  useEffect(() => {
    refreshSession();
  }, []);

  async function refreshSession() {
    try {
      const { data, error } = await api.POST("/auth/refresh");
      if (data && !error) {
        setAccessToken(data.accessToken);
        // Fetch user info
        const userRes = await api.GET("/users/me");
        if (userRes.data) {
          setState({
            user: userRes.data as User,
            isAuthenticated: true,
            isLoading: false,
          });
          return;
        }
      }
    } catch {
      // Refresh failed — user is not authenticated
    }
    setState({ user: null, isAuthenticated: false, isLoading: false });
  }

  const login = useCallback(async (googleIdToken: string) => {
    const { data, error } = await api.POST("/auth/google", {
      body: { idToken: googleIdToken },
    });
    if (data && !error) {
      setAccessToken(data.accessToken);
      setState({
        user: data.user as User,
        isAuthenticated: true,
        isLoading: false,
      });
    }
  }, []);

  const logout = useCallback(() => {
    setAccessToken(null);
    setState({ user: null, isAuthenticated: false, isLoading: false });
  }, []);

  return { ...state, login, logout, refreshSession };
}
