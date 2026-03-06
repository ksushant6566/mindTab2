import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { useState, useEffect } from "react";
import { useAuth } from "~/api/hooks/use-auth";
import Auth from "~/components/auth";
import Home from "~/components/home";
import { Header } from "~/components/header";
import { Onboarding } from "~/components/onboarding";
import MobilePlaceholder from "~/components/mobile-placeholder";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: IndexPage,
});

function IndexPage() {
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
    <main className="flex min-h-screen w-full flex-col items-center bg-background">
      <div className="w-full flex flex-col items-center p-6 px-12 max-w-screen-2xl mx-auto">
        <Header />
      </div>
      <Home />
    </main>
  );
}
