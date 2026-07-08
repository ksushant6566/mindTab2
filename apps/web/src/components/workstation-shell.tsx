import { Suspense, lazy } from "react";
import { useAuth } from "~/api/hooks/use-auth";
import { WorkstationFrame } from "~/components/layout";
import { FullscreenLoadingState } from "~/components/patterns";

const Auth = lazy(() => import("~/components/auth"));
const Header = lazy(() =>
    import("~/components/header").then((module) => ({ default: module.Header }))
);
const AppSidebar = lazy(() =>
    import("~/components/sidebar").then((module) => ({ default: module.AppSidebar }))
);

const PageFallback = () => (
    <FullscreenLoadingState />
);

export function WorkstationShell({ children }: { children: React.ReactNode }) {
    const { user, isAuthenticated, isLoading } = useAuth();

    if (isLoading) return <PageFallback />;

    if (!isAuthenticated || !user) {
        return (
            <Suspense fallback={<PageFallback />}>
                <Auth />
            </Suspense>
        );
    }

    return (
        <Suspense fallback={<PageFallback />}>
            <WorkstationFrame sidebar={<AppSidebar />} header={<Header />}>
                {children}
            </WorkstationFrame>
        </Suspense>
    );
}
