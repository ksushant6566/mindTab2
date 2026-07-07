import { Suspense, lazy, useEffect, useState } from "react";
import { useAuth } from "~/api/hooks/use-auth";

const Auth = lazy(() => import("~/components/auth"));
const HabitsPage = lazy(() =>
  import("~/components/habits/habits-page").then((module) => ({ default: module.HabitsPage }))
);
const Header = lazy(() =>
  import("~/components/header").then((module) => ({ default: module.Header }))
);
const MobilePlaceholder = lazy(() => import("~/components/mobile-placeholder"));
const Onboarding = lazy(() =>
  import("~/components/onboarding").then((module) => ({ default: module.Onboarding }))
);

const PageFallback = () => (
  <div className="flex h-screen items-center justify-center bg-background">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
  </div>
);

export function HabitsRoutePage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  if (isMobile) {
    return (
      <Suspense fallback={<PageFallback />}>
        <MobilePlaceholder />
      </Suspense>
    );
  }

  if (isLoading) {
    return <PageFallback />;
  }

  if (!isAuthenticated || !user) {
    return (
      <Suspense fallback={<PageFallback />}>
        <Auth />
      </Suspense>
    );
  }

  if (!user.onboardingCompleted) {
    return (
      <Suspense fallback={<PageFallback />}>
        <Onboarding userName={user.name ?? ""} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PageFallback />}>
      <main className="flex h-screen w-full flex-col items-center overflow-hidden bg-background">
        <div className="mx-auto flex w-full max-w-screen-2xl shrink-0 flex-col items-center px-12 pb-4 pt-6">
          <Header />
        </div>
        <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-1 justify-center px-12 pb-6">
          <HabitsPage />
        </div>
      </main>
    </Suspense>
  );
}
