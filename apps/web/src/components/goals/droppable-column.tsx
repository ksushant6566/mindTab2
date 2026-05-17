import { useDroppable } from "@dnd-kit/core";
import React from "react";
import { cn } from "~/lib/utils";

interface DroppableColumnProps {
    id: string;
    title: string | React.ReactNode;
    count?: number;
    description?: string;
    action?: React.ReactNode;
    onCreate?: () => void;
    children: React.ReactNode;
}

export const DroppableColumn: React.FC<DroppableColumnProps> = ({ id, title, count = 0, description, action, onCreate, children }) => {
    const { setNodeRef, isOver, active } = useDroppable({ id });

    return (
        <section
            ref={setNodeRef}
            className={cn(
                "flex min-h-full min-w-[240px] flex-col rounded-[var(--r-4)] border border-border bg-[var(--bg)]/70 transition-all duration-150 [transition-timing-function:var(--ease-out)]",
                isOver && active && "border-[var(--ink-line)] bg-[var(--bg-elev)] shadow-[0_0_0_1px_var(--ink-line),0_20px_60px_-46px_rgba(250,250,250,0.75)]"
            )}
        >
            <header className="sticky top-0 z-10 rounded-t-[var(--r-4)] border-b border-border bg-[var(--bg)]/90 px-3 py-3 backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="truncate font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-foreground">{title}</h3>
                            <span className="rounded-[var(--r-2)] border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
                                {count}
                            </span>
                        </div>
                        {description && <p className="mt-1 truncate text-xs text-muted-foreground">{description}</p>}
                    </div>
                    {isOver && active ? (
                        <span className="rounded-[var(--r-2)] bg-primary px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-primary-foreground">
                            Drop
                        </span>
                    ) : action}
                </div>
            </header>
            <div
                className={cn(
                    "flex flex-1 flex-col gap-2.5 p-2.5 transition-transform duration-150 [transition-timing-function:var(--ease-out)]",
                    isOver && active && "scale-[1.01]"
                )}
            >
                {children}
                {count === 0 && (
                    <button
                        type="button"
                        onClick={onCreate}
                        disabled={!onCreate}
                        className={cn(
                            "flex min-h-28 items-center justify-center rounded-[var(--r-3)] border border-dashed border-border bg-[var(--bg-soft)]/45 px-4 text-center text-xs leading-5 text-muted-foreground transition-colors",
                            onCreate && "hover:border-[var(--border-2)] hover:bg-[var(--bg-soft)] hover:text-foreground",
                        )}
                    >
                        {onCreate ? "Create the first goal here" : "Drop a goal here or move one forward when it becomes real."}
                    </button>
                )}
            </div>
        </section>
    );
};
