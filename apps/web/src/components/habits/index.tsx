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

export type ViewMode = "table" | "cards";

type HabitsProps = {
    viewMode: ViewMode;
};

export const Habits: React.FC<HabitsProps> = ({ viewMode }) => {
    const successAudioRef = useRef<HTMLAudioElement | null>(null);
    const errorAudioRef = useRef<HTMLAudioElement | null>(null);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false);

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

    const { data: habits, isFetching: isFetchingHabits } = useQuery({
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
    const updateHabit = (values: any) => {
        updateHabitMutation.mutate(values, {
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
        <div className="flex flex-col gap-4">
            {isFetchingHabits ? (
                <HabitTableSkeleton viewMode={viewMode} />
            ) : viewMode === "table" ? (
                <HabitTable
                    habits={(habits as any[]) ?? []}
                    isCreatingHabit={isCreatingHabit}
                    isUpdatingHabit={isUpdatingHabit}
                    isDeletingHabit={isDeletingHabit}
                    deleteHabitVariables={deleteHabitVariables as any}
                    createHabit={createHabit as any}
                    updateHabit={updateHabit as any}
                    deleteHabit={deleteHabit as any}
                    trackHabit={trackHabit as any}
                    untrackHabit={untrackHabit as any}
                    habitTracker={(habitTracker as any[]) ?? []}
                />
            ) : (
                <CollapsedHabits
                    habits={(habits as any[]) ?? []}
                    habitTracker={(habitTracker as any[]) ?? []}
                    trackHabit={trackHabit as any}
                    untrackHabit={untrackHabit as any}
                    setIsCreateDialogOpen={setIsCreateDialogOpen}
                    isCreatingHabit={isCreatingHabit}
                />
            )}
            <CreateHabitDialog
                isOpen={isCreateDialogOpen}
                onOpenChange={setIsCreateDialogOpen}
                onSave={createHabit as any}
                onCancel={() => setIsCreateDialogOpen(false)}
                loading={isCreatingHabit}
            />
        </div>
    );
};
