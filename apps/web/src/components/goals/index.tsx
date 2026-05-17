import { type CheckedState } from "@radix-ui/react-checkbox";
import { Plus } from "lucide-react";
import React, { useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { goalsQueryOptions, useCreateGoal, useUpdateGoal, useDeleteGoal, useArchiveCompletedGoals } from "~/api/hooks";
import { CreateGoalDialog } from "./create-goal-dialog";
import { EditGoalDialog } from "./edit-goal-dialog";
import { GoalSkeleton } from "./goal-skeleton";
import { KanbanGoals } from "./kanban-goals";
import { ListGoals } from "./list-goals";
import { useAppStore } from "@mindtab/core";

export type ViewMode = "list" | "kanban";
type GoalsProps = { viewMode: ViewMode; };

const getGoalProjectId = (goal: any) => goal?.projectId ?? goal?.project?.id ?? null;

export const Goals: React.FC<GoalsProps> = ({ viewMode }) => {
    const { activeProjectId } = useAppStore();
    const [isCreateGoalOpen, setIsCreateGoalOpen] = useState(false);
    const [editGoalId, setEditGoalId] = useState<string | null>(null);
    const [showArchived, setShowArchived] = useState(false);

    const { data: goals, isLoading } = useQuery({
        ...goalsQueryOptions(activeProjectId ? { projectId: activeProjectId, includeArchived: showArchived } : { includeArchived: showArchived }),
    });

    const { mutate: createGoal, isPending: isCreatingGoal } = useCreateGoal();
    const { mutate: updateGoal } = useUpdateGoal();
    const { mutate: deleteGoal, isPending: isDeletingGoal, variables: deleteGoalVariables } = useDeleteGoal();
    const { mutate: archiveCompletedGoals } = useArchiveCompletedGoals();

    const onCreateGoal = (goal: { title: string; description?: string; status?: string; priority?: string; impact?: string; position?: number; projectId?: string | null; completedAt?: string }) => {
        const goalData = activeProjectId ? { ...goal, projectId: activeProjectId } : goal;
        createGoal(goalData);
        setIsCreateGoalOpen(false);
    };

    const onCancelCreateGoal = () => setIsCreateGoalOpen(false);

    const toggleGoalStatus = (goalId: string, checked: CheckedState) => {
        const goal = (goals as any[])?.find((g: any) => g.id === goalId);
        if (!goal) return;
        let newStatus: string;
        if (goal.status === "pending") newStatus = "in_progress";
        else if (goal.status === "in_progress") newStatus = "completed";
        else newStatus = "pending";
        updateGoal({
            id: goalId,
            title: goal.title,
            description: goal.description ?? undefined,
            status: newStatus,
            priority: goal.priority,
            impact: goal.impact,
            position: goal.position,
            projectId: getGoalProjectId(goal),
        });
    };

    const handleDeleteGoal = (goalId: string) => deleteGoal(goalId);
    const handleUpdateGoal = (goalId: string, goal: Record<string, unknown>) => {
        const existingGoal = (goals as any[])?.find((g: any) => g.id === goalId);
        const sanitizedGoal = Object.fromEntries(Object.entries(goal).filter(([_, v]) => v !== undefined));
        if (existingGoal && !("projectId" in sanitizedGoal)) {
            sanitizedGoal.projectId = getGoalProjectId(existingGoal);
        }
        updateGoal({ ...sanitizedGoal, id: goalId } as { id: string; title?: string; description?: string; status?: string; priority?: string; impact?: string; position?: number; projectId?: string | null; completedAt?: string | null });
    };

    const onSaveEditGoal = (goal: Record<string, unknown>) => {
        if (!editGoalId) return;
        const existingGoal = (goals as any[])?.find((g: any) => g.id === editGoalId);
        const sanitizedGoal = Object.fromEntries(Object.entries(goal).filter(([_, v]) => v !== undefined));
        if (existingGoal && !("projectId" in sanitizedGoal)) {
            sanitizedGoal.projectId = getGoalProjectId(existingGoal);
        }
        updateGoal({ ...sanitizedGoal, id: editGoalId } as { id: string; title?: string; description?: string; status?: string; priority?: string; impact?: string; position?: number; projectId?: string | null; completedAt?: string | null });
        setEditGoalId(null);
    };

    const onCancelEditGoal = () => setEditGoalId(null);
    const handleArchiveCompleted = () => { archiveCompletedGoals(); };
    const handleShowArchived = () => { setShowArchived(!showArchived); };

    const sortedPendingGoals = useMemo(() => (goals as any[])?.filter((g: any) => g.status === "pending"), [goals]);
    const sortedInProgressGoals = useMemo(() => (goals as any[])?.filter((g: any) => g.status === "in_progress"), [goals]);
    const sortedCompletedGoals = useMemo(() => (goals as any[])?.filter((g: any) => g.status === "completed"), [goals]);
    const sortedArchivedGoals = useMemo(() => (goals as any[])?.filter((g: any) => g.status === "archived"), [goals]);

    return (
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
            <div className="flex min-h-0 flex-1 flex-col">
                {isLoading ? (
                    <GoalSkeleton viewMode={viewMode} />
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col gap-1">
                        {viewMode === "list" && (
                            <div className="-ml-1 flex justify-start">
                                <Button onClick={() => setIsCreateGoalOpen(true)} disabled={isCreatingGoal} variant="ghost" size="sm" className="flex items-center gap-2 text-sm font-normal">
                                    <Plus className="h-4 w-4" /> Add Goal
                                </Button>
                            </div>
                        )}
                        <CreateGoalDialog open={isCreateGoalOpen} onOpenChange={setIsCreateGoalOpen} onSave={onCreateGoal} onCancel={onCancelCreateGoal} defaultValues={{ projectId: activeProjectId }} loading={isCreatingGoal} />
                        {editGoalId && (goals as any[])?.find((g: any) => g.id === editGoalId) && (
                            <EditGoalDialog open={!!editGoalId} onOpenChange={(open: boolean) => { if (!open) setEditGoalId(null); }} goal={(goals as any[]).find((g: any) => g.id === editGoalId)!} onSave={onSaveEditGoal} onCancel={onCancelEditGoal} />
                        )}
                        {viewMode === "list" ? (
                            <ListGoals pendingGoals={sortedPendingGoals} inProgressGoals={sortedInProgressGoals} completedGoals={sortedCompletedGoals} onEdit={setEditGoalId} onDelete={handleDeleteGoal} onToggleStatus={toggleGoalStatus} onUpdate={handleUpdateGoal} onArchiveCompleted={handleArchiveCompleted} isDeleting={isDeletingGoal} deleteVariables={deleteGoalVariables} />
                        ) : (
                            <KanbanGoals pendingGoals={sortedPendingGoals} inProgressGoals={sortedInProgressGoals} completedGoals={sortedCompletedGoals} archivedGoals={sortedArchivedGoals} onEdit={setEditGoalId} onDelete={handleDeleteGoal} onToggleStatus={toggleGoalStatus} onUpdate={handleUpdateGoal} onCreate={onCreateGoal} onArchiveCompleted={handleArchiveCompleted} onShowArchived={handleShowArchived} showArchived={showArchived} isCreating={isCreatingGoal} isDeleting={isDeletingGoal} deleteVariables={deleteGoalVariables} />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
