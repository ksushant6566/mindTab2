import { ArrowLeftToLine, ArrowRightToLine, Command } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { useWorkstationNavigation } from "~/lib/workstation-navigation";

export function WorkstationSidebarControl() {
  const {
    isSidebarPinned,
    isSidebarPreviewVisible,
    toggleSidebarPinned,
    showSidebarPreview,
    scheduleSidebarPreviewClose,
  } = useWorkstationNavigation();
  const label = isSidebarPinned ? "Collapse sidebar" : "Expand sidebar";

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="fixed left-3 top-4 z-50 h-7 w-7"
            aria-label={label}
            aria-expanded={isSidebarPinned || isSidebarPreviewVisible}
            data-testid="sidebar-toggle"
            onMouseEnter={showSidebarPreview}
            onMouseLeave={scheduleSidebarPreviewClose}
            onFocus={showSidebarPreview}
            onBlur={scheduleSidebarPreviewClose}
            onClick={toggleSidebarPinned}
          >
            {isSidebarPinned ? <ArrowLeftToLine className="h-4 w-4" /> : <ArrowRightToLine className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        {isSidebarPinned ? (
          <TooltipContent side="bottom" align="start" sideOffset={8} className="flex items-center gap-3 px-3 py-1.5">
            <span>Toggle sidebar</span>
            <kbd className="inline-flex items-center gap-1 rounded-[var(--r-pill)] bg-secondary px-2 py-0.5 font-mono text-[length:var(--type-code-size)] text-muted-foreground">
              <Command className="h-3 w-3" aria-hidden="true" />
              B
            </kbd>
          </TooltipContent>
        ) : null}
      </Tooltip>
    </TooltipProvider>
  );
}
