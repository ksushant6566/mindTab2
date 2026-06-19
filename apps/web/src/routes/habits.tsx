import { createRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import Auth from "~/components/auth";
import { HabitsPage } from "~/components/habits/habits-page";
import { Header } from "~/components/header";
import MobilePlaceholder from "~/components/mobile-placeholder";
import { Onboarding } from "~/components/onboarding";
import { useAuth } from "~/api/hooks/use-auth";
import { Route as rootRoute } from "./__root";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/habits",
  component: HabitsRoute,
});

function HabitsRoute() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  if (isMobile) {
    return <MobilePlaceholder />;
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Auth />;
  }

  if (!user.onboardingCompleted) {
    return <Onboarding userName={user.name ?? ""} />;
  }

  return (
    <main className="flex h-screen w-full flex-col items-center overflow-hidden bg-background">
      <div className="mx-auto flex w-full max-w-screen-2xl shrink-0 flex-col items-center px-12 pb-4 pt-6">
        <Header />
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-1 justify-center px-12 pb-6">
        <HabitsPage />
      </div>
    </main>
  );
}
