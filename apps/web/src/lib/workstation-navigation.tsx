import * as React from "react";
import { useRouter } from "@tanstack/react-router";
import { useAuth } from "~/api/hooks/use-auth";

export const SIDEBAR_STORAGE_KEY = "mindtab-sidebar";
export const LAST_LOCATION_STORAGE_KEY_PREFIX = "mindtab-last-location";

type WorkstationNavigationContextValue = {
  isSidebarPinned: boolean;
  isSidebarPreviewVisible: boolean;
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  navigateBack: () => void;
  navigateForward: () => void;
  toggleSidebarPinned: () => void;
  showSidebarPreview: () => void;
  keepSidebarPreviewOpen: () => void;
  scheduleSidebarPreviewClose: () => void;
  holdSidebarPreviewOpen: () => void;
  releaseSidebarPreviewHold: () => void;
};

const WorkstationNavigationContext = React.createContext<WorkstationNavigationContextValue | null>(null);
const PREVIEW_CLOSE_DELAY_MS = 160;

type NavigationEntry = {
  navigable: boolean;
};

type NavigationHistoryState = {
  currentIndex: number;
  entries: Map<number, NavigationEntry>;
};

type HistoryLocation = {
  href: string;
  pathname: string;
  search: string;
  hash: string;
  state: { __TSR_index: number };
};

function isAppDestination(pathname: string) {
  return pathname !== "/login" && !pathname.startsWith("/login/") && !pathname.startsWith("/auth/");
}

function createNavigationEntry(location: HistoryLocation): NavigationEntry {
  return {
    navigable: isAppDestination(location.pathname),
  };
}

function getLastLocationStorageKey(userId: string) {
  return `${LAST_LOCATION_STORAGE_KEY_PREFIX}:${userId}`;
}

function isBareDashboardLocation(location: HistoryLocation) {
  return location.pathname === "/" && !location.search && !location.hash;
}

function isPersistableLocation(pathname: string) {
  return pathname === "/"
    || pathname === "/chat"
    || pathname.startsWith("/chat/")
    || pathname === "/vault"
    || pathname.startsWith("/vault/")
    || pathname === "/settings"
    || pathname.startsWith("/users/");
}

function readLastLocation(userId: string) {
  try {
    const value = window.localStorage.getItem(getLastLocationStorageKey(userId));
    if (!value) return null;

    const destination = new URL(value, window.location.origin);
    if (destination.origin !== window.location.origin || !isPersistableLocation(destination.pathname)) {
      return null;
    }

    const href = `${destination.pathname}${destination.search}${destination.hash}`;
    return href === "/" ? null : href;
  } catch {
    return null;
  }
}

function persistLastLocation(userId: string, location: HistoryLocation) {
  if (!isPersistableLocation(location.pathname) || isBareDashboardLocation(location)) return;

  try {
    window.localStorage.setItem(getLastLocationStorageKey(userId), location.href);
  } catch {
    // Navigation remains functional when browser storage is unavailable.
  }
}

function findNavigationIndex(
  state: NavigationHistoryState,
  direction: "back" | "forward",
) {
  const candidates = [...state.entries.entries()]
    .filter(([index, entry]) => {
      if (!entry.navigable) return false;
      return direction === "back" ? index < state.currentIndex : index > state.currentIndex;
    })
    .map(([index]) => index)
    .sort((left, right) => direction === "back" ? right - left : left - right);

  return candidates[0];
}

function readInitialPinnedState() {
  if (typeof window === "undefined") return true;

  try {
    const storage = JSON.parse(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) || "{}") as {
      collapsed?: boolean;
    };
    return !storage.collapsed;
  } catch {
    return true;
  }
}

function persistPinnedState(isPinned: boolean) {
  try {
    const storage = JSON.parse(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) || "{}") as Record<string, unknown>;
    window.localStorage.setItem(
      SIDEBAR_STORAGE_KEY,
      JSON.stringify({ ...storage, collapsed: !isPinned }),
    );
  } catch {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify({ collapsed: !isPinned }));
  }
}

export function WorkstationNavigationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [isSidebarPinned, setIsSidebarPinned] = React.useState(readInitialPinnedState);
  const [isSidebarPreviewVisible, setIsSidebarPreviewVisible] = React.useState(false);
  const [navigationHistory, setNavigationHistory] = React.useState<NavigationHistoryState>(() => {
    const location = router.history.location as HistoryLocation;
    return {
      currentIndex: location.state.__TSR_index,
      entries: new Map([[location.state.__TSR_index, createNavigationEntry(location)]]),
    };
  });
  const previewCloseTimer = React.useRef<number | null>(null);
  const isPreviewHeld = React.useRef(false);

  React.useEffect(() => {
    return router.history.subscribe(({ location, action }) => {
      const nextLocation = location as HistoryLocation;
      const nextIndex = nextLocation.state.__TSR_index;

      setIsSidebarPreviewVisible(false);
      setNavigationHistory((current) => {
        const entries = new Map(current.entries);

        if (action.type === "PUSH") {
          for (const index of entries.keys()) {
            if (index >= nextIndex) entries.delete(index);
          }
        }

        entries.set(nextIndex, createNavigationEntry(nextLocation));
        return { currentIndex: nextIndex, entries };
      });
    });
  }, [router]);

  React.useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;

    const handleLocation = (location: HistoryLocation) => {
      if (isBareDashboardLocation(location)) {
        router.history.replace(readLastLocation(user.id) ?? "/?view=calendar");
        return;
      }

      persistLastLocation(user.id, location);
    };

    handleLocation(router.history.location as HistoryLocation);
    return router.history.subscribe(({ location }) => {
      handleLocation(location as HistoryLocation);
    });
  }, [isAuthenticated, isLoading, router, user]);

  const previousNavigationIndex = findNavigationIndex(navigationHistory, "back");
  const nextNavigationIndex = findNavigationIndex(navigationHistory, "forward");
  const canNavigateBack = previousNavigationIndex !== undefined;
  const canNavigateForward = nextNavigationIndex !== undefined;

  const navigateBack = React.useCallback(() => {
    if (previousNavigationIndex === undefined) return;
    router.history.go(previousNavigationIndex - navigationHistory.currentIndex);
  }, [navigationHistory.currentIndex, previousNavigationIndex, router]);

  const navigateForward = React.useCallback(() => {
    if (nextNavigationIndex === undefined) return;
    router.history.go(nextNavigationIndex - navigationHistory.currentIndex);
  }, [navigationHistory.currentIndex, nextNavigationIndex, router]);

  const keepSidebarPreviewOpen = React.useCallback(() => {
    if (previewCloseTimer.current !== null) {
      window.clearTimeout(previewCloseTimer.current);
      previewCloseTimer.current = null;
    }
  }, []);

  React.useEffect(() => {
    return () => keepSidebarPreviewOpen();
  }, [keepSidebarPreviewOpen]);

  const toggleSidebarPinned = React.useCallback(() => {
    keepSidebarPreviewOpen();
    setIsSidebarPreviewVisible(false);
    setIsSidebarPinned((current) => {
      const next = !current;
      persistPinnedState(next);
      return next;
    });
  }, [keepSidebarPreviewOpen]);

  React.useEffect(() => {
    const handleSidebarShortcut = (event: KeyboardEvent) => {
      if (event.repeat || event.defaultPrevented) return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "b") return;
      if (isEditableTarget(event.target)) return;

      event.preventDefault();
      toggleSidebarPinned();
    };

    window.addEventListener("keydown", handleSidebarShortcut);
    return () => window.removeEventListener("keydown", handleSidebarShortcut);
  }, [toggleSidebarPinned]);

  const showSidebarPreview = React.useCallback(() => {
    keepSidebarPreviewOpen();
    if (!isSidebarPinned) setIsSidebarPreviewVisible(true);
  }, [isSidebarPinned, keepSidebarPreviewOpen]);

  const scheduleSidebarPreviewClose = React.useCallback(() => {
    keepSidebarPreviewOpen();
    if (isSidebarPinned || isPreviewHeld.current) return;

    previewCloseTimer.current = window.setTimeout(() => {
      setIsSidebarPreviewVisible(false);
      previewCloseTimer.current = null;
    }, PREVIEW_CLOSE_DELAY_MS);
  }, [isSidebarPinned, keepSidebarPreviewOpen]);

  const holdSidebarPreviewOpen = React.useCallback(() => {
    isPreviewHeld.current = true;
    keepSidebarPreviewOpen();
    if (!isSidebarPinned) setIsSidebarPreviewVisible(true);
  }, [isSidebarPinned, keepSidebarPreviewOpen]);

  const releaseSidebarPreviewHold = React.useCallback(() => {
    isPreviewHeld.current = false;
  }, []);

  const value = React.useMemo(
    () => ({
      isSidebarPinned,
      isSidebarPreviewVisible,
      canNavigateBack,
      canNavigateForward,
      navigateBack,
      navigateForward,
      toggleSidebarPinned,
      showSidebarPreview,
      keepSidebarPreviewOpen,
      scheduleSidebarPreviewClose,
      holdSidebarPreviewOpen,
      releaseSidebarPreviewHold,
    }),
    [
      isSidebarPinned,
      isSidebarPreviewVisible,
      canNavigateBack,
      canNavigateForward,
      keepSidebarPreviewOpen,
      holdSidebarPreviewOpen,
      navigateBack,
      navigateForward,
      releaseSidebarPreviewHold,
      scheduleSidebarPreviewClose,
      showSidebarPreview,
      toggleSidebarPinned,
    ],
  );

  return (
    <WorkstationNavigationContext.Provider value={value}>
      {children}
    </WorkstationNavigationContext.Provider>
  );
}

export function useWorkstationNavigation() {
  const context = React.useContext(WorkstationNavigationContext);
  if (!context) throw new Error("useWorkstationNavigation must be used within WorkstationNavigationProvider");
  return context;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest("input, textarea, select, [contenteditable='true']") !== null;
}
