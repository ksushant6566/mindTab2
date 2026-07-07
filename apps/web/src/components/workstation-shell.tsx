import { Suspense, lazy } from "react";
import { useAuth } from "~/api/hooks/use-auth";

const Auth = lazy(() => import("~/components/auth"));
const Header = lazy(() =>
    import("~/components/header").then((module) => ({ default: module.Header }))
);
const AppSidebar = lazy(() =>
    import("~/components/sidebar").then((module) => ({ default: module.AppSidebar }))
);

const PageFallback = () => (
    <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
    </div>
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
            <main className="flex h-screen w-full overflow-hidden bg-background">
                <AppSidebar />
                <div className="flex min-w-0 flex-1 flex-col items-center overflow-hidden">
                    <div className="mx-auto flex w-full max-w-screen-2xl shrink-0 flex-col items-center px-10 pb-4 pt-6">
                        <Header />
                    </div>
                    <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-1 justify-center px-10 pb-6">
                        {children}
                    </div>
                </div>
            </main>
        </Suspense>
    );
}
