import * as React from "react";
import { cn } from "~/lib/utils";
import { useWorkstationNavigation } from "~/lib/workstation-navigation";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

type WorkstationFrameProps = {
  sidebar: React.ReactNode;
  header: React.ReactNode;
  children: React.ReactNode;
};

export function WorkstationFrame({ sidebar, header, children }: WorkstationFrameProps) {
  return (
    <WorkstationFrameContent sidebar={sidebar} header={header}>
      {children}
    </WorkstationFrameContent>
  );
}

function WorkstationFrameContent({ sidebar, header, children }: WorkstationFrameProps) {
  const {
    isSidebarPinned,
    isSidebarPreviewVisible,
    keepSidebarPreviewOpen,
    scheduleSidebarPreviewClose,
  } = useWorkstationNavigation();
  const isSidebarVisible = isSidebarPinned || isSidebarPreviewVisible;
  const sidebarState = isSidebarPinned ? "pinned" : isSidebarPreviewVisible ? "preview" : "closed";
  const inactiveSidebarProps = !isSidebarVisible ? ({ inert: "" } as Record<string, string>) : {};

  return (
    <main className="relative flex h-screen w-full overflow-hidden bg-background">
      <div
        aria-hidden="true"
        className={cn(
          "h-screen shrink-0 transition-[width] duration-200 ease-out",
          isSidebarPinned ? "w-[300px]" : "w-0",
        )}
      />
      <div
        data-testid="sidebar-presentation"
        data-state={sidebarState}
        aria-hidden={!isSidebarVisible}
        {...inactiveSidebarProps}
        className={cn(
          "absolute inset-y-0 left-0 z-40 h-screen w-[300px] transition-transform duration-200 ease-out",
          isSidebarVisible
            ? "translate-x-0 shadow-[var(--shadow-elevated)]"
            : "pointer-events-none -translate-x-full",
        )}
        onMouseEnter={keepSidebarPreviewOpen}
        onMouseLeave={scheduleSidebarPreviewClose}
      >
        {sidebar}
      </div>
      <div data-testid="workstation-content" className="flex min-w-0 flex-1 flex-col items-center overflow-hidden">
        <div className="w-full shrink-0">
          <div className="mx-auto flex w-full max-w-screen-2xl flex-col items-center px-10 py-3">
            {header}
          </div>
        </div>
        <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-1 justify-center px-10 pb-6 pt-4">
          {children}
        </div>
      </div>
    </main>
  );
}

export function HeaderBar({ children, navigationInset = false }: { children: React.ReactNode; navigationInset?: boolean }) {
  return (
    <div className={cn("flex h-10 w-full items-center justify-between gap-6", navigationInset && "pl-24")}>
      {children}
    </div>
  );
}

export function HeaderMeta({ children, ...props }: React.ComponentProps<"time">) {
  return (
    <time
      className="hidden whitespace-nowrap text-[length:var(--type-body-size)] font-[var(--type-label-weight)] leading-[var(--type-body-line)] text-foreground md:inline"
      {...props}
    >
      {children}
    </time>
  );
}

type PageProps = DivProps & {
  width?: "full" | "content" | "wide";
};

const pageWidths = {
  full: "max-w-none",
  content: "max-w-5xl",
  wide: "max-w-7xl",
} satisfies Record<NonNullable<PageProps["width"]>, string>;

export const Page = React.forwardRef<HTMLDivElement, PageProps>(
  ({ className, width = "wide", ...props }, ref) => (
    <div
      ref={ref}
      className={cn("mx-auto flex min-h-0 w-full flex-1 flex-col px-4 py-5 sm:px-6 lg:px-8", pageWidths[width], className)}
      {...props}
    />
  )
);
Page.displayName = "Page";

export const PageHeader = React.forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <header ref={ref} className={cn("mb-5 flex min-h-10 shrink-0 items-center justify-between gap-4", className)} {...props} />
));
PageHeader.displayName = "PageHeader";

export const PageBody = React.forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("min-h-0 flex-1", className)} {...props} />
));
PageBody.displayName = "PageBody";

type SurfaceProps = DivProps & {
  variant?: "base" | "elevated" | "soft" | "transparent";
  interactive?: boolean;
};

const surfaceVariants = {
  base: "border border-border bg-card text-card-foreground shadow-[var(--shadow-inset)]",
  elevated: "border border-border bg-[var(--bg-elev)] text-foreground shadow-[var(--shadow-elevated)]",
  soft: "border border-border bg-[var(--bg-soft)] text-foreground",
  transparent: "bg-transparent text-foreground",
} satisfies Record<NonNullable<SurfaceProps["variant"]>, string>;

export const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(
  ({ className, variant = "base", interactive = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-[var(--r-3)]",
        surfaceVariants[variant],
        interactive && "transition-colors hover:border-[var(--border-2)] hover:bg-[var(--bg-hover)]",
        className
      )}
      {...props}
    />
  )
);
Surface.displayName = "Surface";

type PanelProps = SurfaceProps & {
  padding?: "none" | "sm" | "md" | "lg";
};

const panelPadding = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
} satisfies Record<NonNullable<PanelProps["padding"]>, string>;

export const Panel = React.forwardRef<HTMLDivElement, PanelProps>(
  ({ className, padding = "md", variant = "base", ...props }, ref) => (
    <Surface ref={ref} variant={variant} className={cn("min-w-0", panelPadding[padding], className)} {...props} />
  )
);
Panel.displayName = "Panel";

export const PanelHeader = React.forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex min-h-9 items-center justify-between gap-3 border-b border-border px-4 py-3", className)} {...props} />
));
PanelHeader.displayName = "PanelHeader";

export const PanelBody = React.forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("min-h-0 px-4 py-3", className)} {...props} />
));
PanelBody.displayName = "PanelBody";

export const PanelFooter = React.forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center justify-end gap-2 border-t border-border px-4 py-3", className)} {...props} />
));
PanelFooter.displayName = "PanelFooter";

type StackProps = DivProps & {
  gap?: "xs" | "sm" | "md" | "lg" | "xl";
};

const gaps = {
  xs: "gap-1.5",
  sm: "gap-2",
  md: "gap-3",
  lg: "gap-4",
  xl: "gap-6",
} satisfies Record<NonNullable<StackProps["gap"]>, string>;

export const Stack = React.forwardRef<HTMLDivElement, StackProps>(({ className, gap = "md", ...props }, ref) => (
  <div ref={ref} className={cn("flex min-w-0 flex-col", gaps[gap], className)} {...props} />
));
Stack.displayName = "Stack";

type InlineProps = DivProps & {
  gap?: StackProps["gap"];
  align?: "start" | "center" | "end" | "baseline";
};

const alignments = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  baseline: "items-baseline",
} satisfies Record<NonNullable<InlineProps["align"]>, string>;

export const Inline = React.forwardRef<HTMLDivElement, InlineProps>(({ className, gap = "sm", align = "center", ...props }, ref) => (
  <div ref={ref} className={cn("flex min-w-0", alignments[align], gaps[gap], className)} {...props} />
));
Inline.displayName = "Inline";

export const Cluster = React.forwardRef<HTMLDivElement, InlineProps>(({ className, gap = "sm", align = "center", ...props }, ref) => (
  <div ref={ref} className={cn("flex min-w-0 flex-wrap", alignments[align], gaps[gap], className)} {...props} />
));
Cluster.displayName = "Cluster";

type ResponsiveGridProps = DivProps & {
  minColumnWidth?: "sm" | "md" | "lg";
  gap?: StackProps["gap"];
};

const gridWidths = {
  sm: "grid-cols-[repeat(auto-fit,minmax(180px,1fr))]",
  md: "grid-cols-[repeat(auto-fit,minmax(240px,1fr))]",
  lg: "grid-cols-[repeat(auto-fit,minmax(320px,1fr))]",
} satisfies Record<NonNullable<ResponsiveGridProps["minColumnWidth"]>, string>;

export const ResponsiveGrid = React.forwardRef<HTMLDivElement, ResponsiveGridProps>(
  ({ className, minColumnWidth = "md", gap = "md", ...props }, ref) => (
    <div ref={ref} className={cn("grid min-w-0", gridWidths[minColumnWidth], gaps[gap], className)} {...props} />
  )
);
ResponsiveGrid.displayName = "ResponsiveGrid";

type ScrollPanelProps = DivProps & {
  orientation?: "vertical" | "horizontal" | "both";
};

const overflow = {
  vertical: "overflow-y-auto overflow-x-hidden",
  horizontal: "overflow-x-auto overflow-y-hidden",
  both: "overflow-auto",
} satisfies Record<NonNullable<ScrollPanelProps["orientation"]>, string>;

export const ScrollPanel = React.forwardRef<HTMLDivElement, ScrollPanelProps>(
  ({ className, orientation = "vertical", ...props }, ref) => (
    <div ref={ref} className={cn("min-h-0 min-w-0 scrollbar-gutter-stable", overflow[orientation], className)} {...props} />
  )
);
ScrollPanel.displayName = "ScrollPanel";
