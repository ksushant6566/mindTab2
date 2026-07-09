import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

type TaskStatus = "pending" | "in_progress" | "completed" | "archived";

export function ListTaskSection({
  id,
  title,
  count,
  description,
  action,
  children,
}: {
  id: TaskStatus;
  title: string;
  count: number;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { setNodeRef, isOver, active } = useDroppable({ id });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "rounded-[var(--r-4)] border border-border bg-[var(--bg)]/55 transition-all duration-150 [transition-timing-function:var(--ease-out)]",
        isOver && active && "border-[var(--ink-line)] bg-[var(--bg-elev)] shadow-[var(--shadow-drop-target)]"
      )}
    >
      <header className="sticky top-0 z-10 rounded-t-[var(--r-4)] border-b border-border bg-[var(--bg)]/90 px-3 py-2.5 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-foreground">{title}</h3>
              <span className="rounded-[var(--r-2)] border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
                {count}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{description}</p>
          </div>
          {isOver && active ? (
            <span className="rounded-[var(--r-2)] bg-primary px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-primary-foreground">
              Drop
            </span>
          ) : action}
        </div>
      </header>
      <div className="flex flex-col gap-2 p-2.5">
        {children}
        {count === 0 && (
          <div className="flex min-h-20 items-center justify-center rounded-[var(--r-3)] border border-dashed border-border bg-[var(--bg-soft)]/35 px-4 text-center text-xs leading-5 text-muted-foreground">
            Drop a task here when it belongs in {title.toLowerCase()}.
          </div>
        )}
      </div>
    </section>
  );
}
