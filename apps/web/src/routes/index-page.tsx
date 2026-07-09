import { Suspense, lazy, useEffect, useState } from "react";
import { useAuth } from "~/api/hooks/use-auth";
import { WorkstationFrame } from "~/components/layout";
import { FullscreenLoadingState } from "~/components/patterns";

const Auth = lazy(() => import("~/components/auth"));
const Home = lazy(() => import("~/components/home"));
const Header = lazy(() =>
  import("~/components/header").then((module) => ({ default: module.Header }))
);
const AppSidebar = lazy(() =>
  import("~/components/sidebar").then((module) => ({ default: module.AppSidebar }))
);
const MobilePlaceholder = lazy(() => import("~/components/mobile-placeholder"));
const Onboarding = lazy(() =>
  import("~/components/onboarding").then((module) => ({ default: module.Onboarding }))
);

const PageFallback = () => (
  <FullscreenLoadingState />
);

export function IndexPage() {
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
      <WorkstationFrame sidebar={<AppSidebar />} header={<Header />}>
        <Home />
      </WorkstationFrame>
    </Suspense>
  );
}
