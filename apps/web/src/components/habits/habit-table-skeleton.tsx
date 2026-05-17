import { Skeleton } from "~/components/ui/skeleton";

type ViewMode = "table" | "cards";
type HabitTableSkeletonProps = { viewMode?: ViewMode };

export const HabitTableSkeleton = ({ viewMode = "table" }: HabitTableSkeletonProps) => {
    if (viewMode === "cards") {
        return (
            <div className="flex min-h-0 flex-1 flex-col">
                <div className="mb-3 flex items-center justify-between">
                    <div className="space-y-2">
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="h-4 w-16" />
                    </div>
                    <Skeleton className="h-8 w-28 rounded-[var(--r-2)]" />
                </div>
                <div className="grid grid-cols-1 gap-3 pr-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
                    {Array.from({ length: 6 }).map((_, index) => (
                        <div key={index} className="rounded-[var(--r-3)] border border-border bg-card p-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <Skeleton className="h-4 w-32" />
                                </div>
                                <Skeleton className="size-5 rounded-[var(--r-1)]" />
                            </div>
                            <div className="mt-3 flex gap-1">
                                {Array.from({ length: 7 }).map((__, dayIndex) => (
                                    <Skeleton key={dayIndex} className="size-3 rounded-[var(--r-1)]" />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-3 flex items-center justify-between">
                <div className="space-y-2">
                    <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-8 w-28 rounded-[var(--r-2)]" />
            </div>
            <div className="space-y-5 overflow-hidden pr-3">
                {Array.from({ length: 2 }).map((_, weekIndex) => (
                    <div key={weekIndex} className="border-t border-border pt-4 first:border-t-0 first:pt-0">
                        <div className="mb-4 space-y-2">
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="h-3 w-32" />
                        </div>
                        <div className="space-y-2">
                            {Array.from({ length: 4 }).map((__, rowIndex) => (
                                <div key={rowIndex} className="grid w-full grid-cols-[minmax(148px,1fr)_repeat(7,minmax(40px,46px))_54px] items-center gap-1.5 rounded-[var(--r-3)] px-0.5 py-1.5">
                                    <div className="space-y-2">
                                        <Skeleton className="h-4 w-36" />
                                        <Skeleton className="h-3 w-24" />
                                    </div>
                                    {Array.from({ length: 7 }).map((___, dayIndex) => (
                                        <div key={dayIndex} className="flex h-10 items-center justify-center">
                                            <Skeleton className="size-9 rounded-[var(--r-2)]" />
                                        </div>
                                    ))}
                                    <Skeleton className="h-7 w-14 rounded-[var(--r-2)]" />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
