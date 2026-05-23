import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";
import { useAppStore, type AppearanceTheme } from "@mindtab/core";
import { useAuth } from "~/api/hooks/use-auth";

const darkThemes = new Set<AppearanceTheme>(["midnight", "graphite"]);

type AppearanceRootProps = {
  children: ReactNode;
};

export function AppearanceRoot({ children }: AppearanceRootProps) {
  const { user } = useAuth();
  const theme = useAppStore((state) => state.appearanceTheme);
  const font = useAppStore((state) => state.fontPreset);
  const setAppearance = useAppStore((state) => state.setAppearance);

  useEffect(() => {
    if (!user) return;
    setAppearance({
      theme: user.theme,
      font: user.font,
    });
  }, [setAppearance, user?.theme, user?.font]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.font = font;
    root.classList.toggle("dark", darkThemes.has(theme));
  }, [theme, font]);

  return (
    <>
      {children}
      <Toaster theme={theme === "paper" ? "light" : "dark"} />
    </>
  );
}
