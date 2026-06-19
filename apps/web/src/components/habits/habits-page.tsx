import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Habits } from "./index";
import { Button } from "~/components/ui/button";

const WEEKS_PER_PAGE = 8;
const MAX_HISTORY_WEEKS = 52;
const MAX_PAGE_INDEX = Math.ceil(MAX_HISTORY_WEEKS / WEEKS_PER_PAGE) - 1;

export function HabitsPage() {
    const [pageIndex, setPageIndex] = useState(0);
    const weekOffsets = useMemo(() => getHistoryWeekOffsets(pageIndex), [pageIndex]);
    const rangeLabel = useMemo(() => getWeekRangeLabel(weekOffsets), [weekOffsets]);

    return (
        <div className="flex h-full min-h-0 w-full max-w-screen-xl flex-col gap-4">
            <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold leading-8 tracking-normal text-foreground">Habits</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Weekly tracking history for the past year. Click a habit to open its calendar.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="gap-2"
                        onClick={() => setPageIndex((value) => Math.min(value + 1, MAX_PAGE_INDEX))}
                        disabled={pageIndex >= MAX_PAGE_INDEX}
                    >
                        <ChevronLeft className="h-4 w-4" />
                        Older
                    </Button>
                    <div className="min-w-[190px] rounded-[var(--r-2)] border border-border bg-[var(--bg-elev)] px-3 py-2 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                        {rangeLabel}
                    </div>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="gap-2"
                        onClick={() => setPageIndex((value) => Math.max(value - 1, 0))}
                        disabled={pageIndex === 0}
                    >
                        Newer
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="min-h-0 flex-1 rounded-[var(--r-3)] border border-border bg-[var(--bg-elev)] p-4">
                <Habits viewMode="table" weekOffsets={weekOffsets} />
            </div>
        </div>
    );
}

function getHistoryWeekOffsets(pageIndex: number) {
    const endOffset = -pageIndex * WEEKS_PER_PAGE;
    const startOffset = Math.max(-MAX_HISTORY_WEEKS + 1, endOffset - WEEKS_PER_PAGE + 1);

    return Array.from(
        { length: endOffset - startOffset + 1 },
        (_, index) => startOffset + index
    );
}

function getWeekRangeLabel(offsets: number[]) {
    const start = offsets[0];
    const end = offsets[offsets.length - 1];

    if (start === undefined || end === undefined) return "";
    if (end === 0) return `${Math.abs(start)} weeks ago - this week`;
    return `${Math.abs(start)} - ${Math.abs(end)} weeks ago`;
}
