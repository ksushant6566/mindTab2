import { Suspense, lazy, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "~/api/hooks/use-auth";

const Auth = lazy(() => import("~/components/auth"));

export function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      void navigate({ to: "/" });
    }
  }, [isAuthenticated, navigate]);

  if (isLoading) return null;

  return (
    <Suspense fallback={null}>
      <Auth />
    </Suspense>
  );
}
