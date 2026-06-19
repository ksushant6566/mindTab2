import React, { useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
    habitsQueryOptions,
    habitTrackerQueryOptions,
    useCreateHabit,
    useUpdateHabit,
    useDeleteHabit,
    useTrackHabit,
    useUntrackHabit,
} from "~/api/hooks";
import { CollapsedHabits } from "./collapsed-habits";
import { HabitTable } from "./habit-table";
import { CreateHabitDialog } from "./create-habit-dialog";
import { HabitTableSkeleton } from "./habit-table-skeleton";
import { EditHabitDialog } from "./edit-habit-dialog";

export type ViewMode = "table" | "cards";

type HabitsProps = {
    viewMode: ViewMode;
    weekOffsets?: number[];
};

export const Habits: React.FC<HabitsProps> = ({ viewMode, weekOffsets }) => {
    const successAudioRef = useRef<HTMLAudioElement | null>(null);
    const errorAudioRef = useRef<HTMLAudioElement | null>(null);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false);
    const [editHabitState, setEditHabitState] = React.useState<{
        habit: any;
        mode: "view" | "edit";
    } | null>(null);

    useEffect(() => {
        successAudioRef.current = new Audio("/audio/success.mp3");
        successAudioRef.current.addEventListener("error", (e) => {
            console.error("Audio loading error:", e);
        });
        errorAudioRef.current = new Audio("/audio/error.mp3");
        errorAudioRef.current.addEventListener("error", (e) => {
            console.error("Audio loading error:", e);
        });
    }, []);

    const playSound = (type: "success" | "error") => {
        const audio =
            type === "success"
                ? successAudioRef.current
                : errorAudioRef.current;
        if (audio) {
            audio.currentTime = 0;
            audio
                .play()
                .catch((error) => console.error("Error playing sound:", error));
        }
    };

    const { data: habits, isLoading: isLoadingHabits } = useQuery({
        ...habitsQueryOptions(),
        refetchOnWindowFocus: false,
        refetchOnMount: false,
    });

    const {
        mutate: deleteHabit,
        isPending: isDeletingHabit,
        variables: deleteHabitVariables,
    } = useDeleteHabit();

    const createHabitMutation = useCreateHabit();
    const isCreatingHabit = createHabitMutation.isPending;
    const createHabit = (values: any) => {
        createHabitMutation.mutate(values, {
            onSuccess: () => setIsCreateDialogOpen(false),
            onError: (error: any) => {
                toast.error(error.message || "Failed to create habit", {
                    position: "top-right",
                });
            },
        });
    };

    const updateHabitMutation = useUpdateHabit();
    const isUpdatingHabit = updateHabitMutation.isPending;
    const updateHabit = (values: any, onSuccess?: () => void) => {
        updateHabitMutation.mutate(values, {
            onSuccess,
            onError: (error: any) => {
                toast.error(error.message || "Failed to update habit", {
                    position: "top-right",
                });
            },
        });
    };

    const { data: habitTracker } = useQuery({
        ...habitTrackerQueryOptions(),
        refetchOnWindowFocus: false,
        refetchOnMount: false,
    });

    const trackHabitMutation = useTrackHabit();
    const untrackHabitMutation = useUntrackHabit();

    const trackHabit = ({ habitId, date }: { habitId: string; date: string }) => {
        playSound("success");
        trackHabitMutation.mutate({ id: habitId, date });
    };

    const untrackHabit = ({ habitId, date }: { habitId: string; date: string }) => {
        playSound("error");
        untrackHabitMutation.mutate({ id: habitId, date });
    };

    return (
        <div className="flex h-full min-h-0 flex-col gap-4">
            {isLoadingHabits ? (
                <HabitTableSkeleton viewMode={viewMode} />
            ) : viewMode === "table" ? (
                <HabitTable
                    habits={(habits as any[]) ?? []}
                    isCreatingHabit={isCreatingHabit}
                    isDeletingHabit={isDeletingHabit}
                    deleteHabitVariables={deleteHabitVariables as string | undefined}
                    deleteHabit={deleteHabit as any}
                    trackHabit={trackHabit as any}
                    untrackHabit={untrackHabit as any}
                    habitTracker={(habitTracker as any[]) ?? []}
                    setIsCreateDialogOpen={setIsCreateDialogOpen}
                    onOpenHabit={(habit, mode) => setEditHabitState({ habit, mode })}
                    weekOffsets={weekOffsets}
                />
            ) : (
                <CollapsedHabits
                    habits={(habits as any[]) ?? []}
                    habitTracker={(habitTracker as any[]) ?? []}
                    trackHabit={trackHabit as any}
                    untrackHabit={untrackHabit as any}
                    setIsCreateDialogOpen={setIsCreateDialogOpen}
                    isCreatingHabit={isCreatingHabit}
                    onOpenHabit={(habit, mode) => setEditHabitState({ habit, mode })}
                    deleteHabit={deleteHabit as any}
                    isDeletingHabit={isDeletingHabit}
                    deleteHabitVariables={deleteHabitVariables as string | undefined}
                />
            )}
            <CreateHabitDialog
                isOpen={isCreateDialogOpen}
                onOpenChange={setIsCreateDialogOpen}
                onSave={createHabit as any}
                onCancel={() => setIsCreateDialogOpen(false)}
                loading={isCreatingHabit}
            />
            {editHabitState && (
                <EditHabitDialog
                    isOpen={Boolean(editHabitState)}
                    onOpenChange={(open) => {
                        if (!open) setEditHabitState(null);
                    }}
                    defaultMode={editHabitState.mode}
                    habit={editHabitState.habit}
                    onSave={(habit) => updateHabit(habit, () => setEditHabitState(null))}
                    onCancel={() => setEditHabitState(null)}
                    loading={isUpdatingHabit}
                    habitTracker={(habitTracker as any[]) ?? []}
                    trackHabit={trackHabit as any}
                    untrackHabit={untrackHabit as any}
                />
            )}
        </div>
    );
};
