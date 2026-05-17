import { CheckedState } from "@radix-ui/react-checkbox";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Flame, Repeat2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { cn, getTimeAgo } from "~/lib/utils";
import { EditHabit, EditHabitProps } from "./edit-habit";
import { HabitCell } from "./habit-cell";
import {
    getCompletedSet,
    getCurrentStreak,
    getTodayKey,
    isHabitCompleted,
} from "./habit-utils";

type TEditHabitDialogProps = EditHabitProps & {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    defaultMode?: "edit" | "view";
    habitTracker: any[];
    trackHabit: (habit: { habitId: string; date: string }) => void;
    untrackHabit: (habit: { habitId: string; date: string }) => void;
};

export const EditHabitDialog = ({
    isOpen,
    onOpenChange,
    defaultMode = "edit",
    habit,
    onCancel,
    habitTracker,
    trackHabit,
    untrackHabit,
    ...props
}: TEditHabitDialogProps) => {
    const [mode, setMode] = useState<"edit" | "view">(defaultMode);

    useEffect(() => {
        if (isOpen) setMode(defaultMode);
    }, [isOpen, defaultMode]);

    const frequencyLabel = habit.frequency === "weekly" ? "Weekly" : "Daily";
    const today = getTodayKey();
    const completedSet = useMemo(() => getCompletedSet(habitTracker), [habitTracker]);
    const isCompletedToday = isHabitCompleted(completedSet, habit.id, today);
    const streak = useMemo(() => getCurrentStreak(completedSet, habit.id), [completedSet, habit.id]);
    const createdLabel = useMemo(() => {
        if (!habit.createdAt) return "Unknown";
        return getTimeAgo(new Date(habit.createdAt));
    }, [habit.createdAt]);

    const handleCancel = () => {
        if (defaultMode === "view") {
            setMode("view");
            return;
        }

        onCancel();
    };

    const handleTodayCheckedChange = (checked: CheckedState) => {
        if (checked === true) trackHabit({ habitId: habit.id, date: today });
        else if (checked === false) untrackHabit({ habitId: habit.id, date: today });
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl overflow-hidden border border-border bg-[var(--bg-elev)] p-0 shadow-[0_20px_64px_-48px_rgba(0,0,0,0.95)]">
                <DialogHeader className="border-b border-border px-5 py-4 text-left">
                    <DialogTitle className="pr-8 text-lg font-semibold leading-6 tracking-normal text-foreground">
                        {habit.title}
                    </DialogTitle>
                    <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                        <span>{frequencyLabel}</span>
                        <span className="text-[var(--text-4)]">·</span>
                        <span>{createdLabel}</span>
                    </DialogDescription>
                </DialogHeader>

                <div className="bg-[var(--bg)]/45 px-5 pb-5 pt-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="inline-flex rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] p-0.5">
                            {(["view", "edit"] as const).map((item) => (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => setMode(item)}
                                    className={cn(
                                        "h-6 rounded-[calc(var(--r-2)-1px)] px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground transition-colors",
                                        mode === item && "bg-primary text-primary-foreground"
                                    )}
                                >
                                    {item}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                            <Repeat2 className="h-3 w-3" />
                            <span>{frequencyLabel}</span>
                        </div>
                    </div>

                    {mode === "view" ? (
                        <div className="space-y-3">
                            <p className="text-sm leading-5 text-muted-foreground">
                                {habit.description || "No description yet."}
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                <HabitDetail label="Frequency" value={frequencyLabel} icon={<Repeat2 className="h-3 w-3" />} />
                                <HabitDetail label="Streak" value={`${streak} day${streak === 1 ? "" : "s"}`} icon={<Flame className="h-3 w-3 text-[var(--amber)]" />} />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <HabitDetail label="Created" value={createdLabel} icon={<CalendarDays className="h-3 w-3" />} />
                                <HabitDetail label="Reward" value="10 XP per completion" icon={<CheckCircle2 className="h-3 w-3" />} />
                            </div>
                            <div className="rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] px-3 py-3">
                                <div className="flex items-center gap-3">
                                    <div className="size-9 shrink-0">
                                        <HabitCell
                                            habit={habit}
                                            date={today}
                                            isEditable
                                            isChecked={isCompletedToday}
                                            onCheckedChange={handleTodayCheckedChange}
                                        />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                                            Today
                                        </div>
                                        <div className="mt-0.5 truncate text-sm font-medium text-foreground">
                                            {isCompletedToday ? "Done today" : "Mark complete for today"}
                                        </div>
                                    </div>
                                    <span
                                        className={cn(
                                            "ml-auto rounded-[var(--r-1)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em]",
                                            isCompletedToday ? "text-[var(--green)]" : "text-muted-foreground"
                                        )}
                                    >
                                        {isCompletedToday ? "Completed" : "10 XP"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <EditHabit
                            habit={habit}
                            onCancel={handleCancel}
                            {...props}
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

function HabitDetail({
    label,
    value,
    icon,
}: {
    label: string;
    value: string;
    icon?: ReactNode;
}) {
    return (
        <div className="rounded-[var(--r-2)] border border-border bg-[var(--bg-soft)] px-2.5 py-2">
            <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-foreground">
                {icon}
                <span className="truncate">{value}</span>
            </div>
        </div>
    );
}
