import * as React from "react";

export const SIDEBAR_STORAGE_KEY = "mindtab-sidebar";

type WorkstationNavigationContextValue = {
  isSidebarPinned: boolean;
  isSidebarPreviewVisible: boolean;
  toggleSidebarPinned: () => void;
  showSidebarPreview: () => void;
  keepSidebarPreviewOpen: () => void;
  scheduleSidebarPreviewClose: () => void;
  holdSidebarPreviewOpen: () => void;
  releaseSidebarPreviewHold: () => void;
};

const WorkstationNavigationContext = React.createContext<WorkstationNavigationContextValue | null>(null);
const PREVIEW_CLOSE_DELAY_MS = 160;

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
  const [isSidebarPinned, setIsSidebarPinned] = React.useState(readInitialPinnedState);
  const [isSidebarPreviewVisible, setIsSidebarPreviewVisible] = React.useState(false);
  const previewCloseTimer = React.useRef<number | null>(null);
  const isPreviewHeld = React.useRef(false);

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
      keepSidebarPreviewOpen,
      holdSidebarPreviewOpen,
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
