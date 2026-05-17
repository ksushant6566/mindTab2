import {
    DndContext, DragEndEvent, DragOverlay, DragStartEvent, KeyboardSensor, PointerSensor, useSensor, useSensors, pointerWithin, CollisionDetection, rectIntersection,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { type CheckedState } from "@radix-ui/react-checkbox";
import React, { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useUpdateGoalPositions } from "~/api/hooks";
import { DroppableColumn } from "./droppable-column";
import { Goal } from "./goal";
import { SortableGoal } from "./sortable-goal";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { ArchiveIcon, ChevronDownIcon, CornerDownLeftIcon, EyeOffIcon, PlusIcon, SlidersHorizontalIcon } from "lucide-react";
import { cn } from "~/lib/utils";

type TGoal = any;
type GoalStatus = "pending" | "in_progress" | "completed" | "archived";

interface KanbanGoalsProps {
    pendingGoals?: TGoal[]; inProgressGoals?: TGoal[]; completedGoals?: TGoal[]; archivedGoals?: TGoal[];
    onEdit: (id: string) => void; onDelete: (id: string) => void; onToggleStatus: (id: string, checked: CheckedState) => void;
    onUpdate?: (id: string, goal: Record<string, unknown>) => void;
    onCreate?: (goal: { title: string; description?: string; status?: string; priority?: string; impact?: string; position?: number; projectId?: string | null; completedAt?: string }) => void;
    onArchiveCompleted?: () => void; onShowArchived?: () => void; showArchived?: boolean;
    isCreating?: boolean;
    isDeleting: boolean; deleteVariables?: string;
}

export const KanbanGoals: React.FC<KanbanGoalsProps> = ({
    pendingGoals = [], inProgressGoals = [], completedGoals = [], archivedGoals = [],
    onEdit, onDelete, onToggleStatus, onUpdate, onCreate, onArchiveCompleted, onShowArchived, showArchived = false, isCreating = false, isDeleting, deleteVariables,
}) => {
    const qc = useQueryClient();
    const [activeId, setActiveId] = React.useState<string | null>(null);
    const [localPendingGoals, setLocalPendingGoals] = React.useState<TGoal[]>([]);
    const [localInProgressGoals, setLocalInProgressGoals] = React.useState<TGoal[]>([]);
    const [localCompletedGoals, setLocalCompletedGoals] = React.useState<TGoal[]>([]);
    const [localArchivedGoals, setLocalArchivedGoals] = React.useState<TGoal[]>([]);
    const [creatingStatus, setCreatingStatus] = React.useState<GoalStatus | null>(null);
    const sequenceRef = useRef(0);

    useEffect(() => {
        setLocalPendingGoals(pendingGoals); setLocalInProgressGoals(inProgressGoals);
        setLocalCompletedGoals(completedGoals); setLocalArchivedGoals(archivedGoals);
    }, [pendingGoals, inProgressGoals, completedGoals, archivedGoals]);

    const { mutate: updatePositions } = useUpdateGoalPositions();

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor));
    const handleDragStart = (event: DragStartEvent) => { setActiveId(event.active.id as string); };

    const findContainer = (id: string): GoalStatus | undefined => {
        if (id === "pending" || id === "in_progress" || id === "completed" || id === "archived") return id;
        const goal = [...localPendingGoals, ...localInProgressGoals, ...localCompletedGoals, ...localArchivedGoals].find((g) => g.id === id);
        return goal?.status;
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) { setActiveId(null); return; }
        const activeGoal = [...localPendingGoals, ...localInProgressGoals, ...localCompletedGoals, ...localArchivedGoals].find((g) => g.id === active.id);
        if (!activeGoal) { setActiveId(null); return; }
        const overContainer = findContainer(over.id as string);
        if (!overContainer) { setActiveId(null); return; }

        const getGoals = (status: string) => {
            if (status === "pending") return [...localPendingGoals];
            if (status === "in_progress") return [...localInProgressGoals];
            if (status === "completed") return [...localCompletedGoals];
            return [...localArchivedGoals];
        };
        const setGoals = (status: string, goals: TGoal[]) => {
            if (status === "pending") setLocalPendingGoals(goals);
            else if (status === "in_progress") setLocalInProgressGoals(goals);
            else if (status === "completed") setLocalCompletedGoals(goals);
            else setLocalArchivedGoals(goals);
        };

        const sourceGoals = getGoals(activeGoal.status);
        const destinationGoals = getGoals(overContainer);
        const oldIndex = sourceGoals.findIndex((g: any) => g.id === active.id);
        let newIndex = over.id === overContainer ? destinationGoals.length : destinationGoals.findIndex((g: any) => g.id === over.id);
        if (newIndex === -1) newIndex = destinationGoals.length;

        const isSameContainer = activeGoal.status === overContainer;
        const updates: { id: string; position: number; status: GoalStatus }[] = [];

        if (isSameContainer) {
            const reorderedGoals = arrayMove(sourceGoals, oldIndex, newIndex);
            reorderedGoals.forEach((goal: any, index: number) => { updates.push({ id: goal.id, position: index, status: goal.status }); });
            setGoals(overContainer, reorderedGoals);
        } else {
            sourceGoals.splice(oldIndex, 1);
            const updatedGoal = { ...activeGoal, status: overContainer };
            destinationGoals.splice(newIndex, 0, updatedGoal);
            sourceGoals.forEach((goal: any, index: number) => { updates.push({ id: goal.id, position: index, status: goal.status }); });
            destinationGoals.forEach((goal: any, index: number) => { updates.push({ id: goal.id, position: index, status: goal.id === activeGoal.id ? overContainer : goal.status }); });
            setGoals(activeGoal.status, sourceGoals);
            setGoals(overContainer, destinationGoals);
        }

        const sequence = ++sequenceRef.current;
        updatePositions(
            { goals: updates, sequence } as any,
            {
                onError: (_err: any, _vars: any, context: any) => {
                    if (context?.sequence === sequenceRef.current) {
                        setLocalPendingGoals(pendingGoals);
                        setLocalInProgressGoals(inProgressGoals);
                        setLocalCompletedGoals(completedGoals);
                        setLocalArchivedGoals(archivedGoals);
                        context?.previousGoals?.forEach(([key, data]: any) => qc.setQueryData(key, data));
                    }
                },
                onSettled: (_data: any, _err: any, _vars: any, context: any) => {
                    if (context?.sequence === sequenceRef.current) {
                        qc.invalidateQueries({ queryKey: ["goals"] });
                    }
                },
            }
        );
        setActiveId(null);
    };

    const handleDragCancel = () => { setActiveId(null); };

    const activeGoal = React.useMemo(
        () => [...localPendingGoals, ...localInProgressGoals, ...localCompletedGoals, ...localArchivedGoals].find((g) => g.id === activeId),
        [activeId, localPendingGoals, localInProgressGoals, localCompletedGoals, localArchivedGoals]
    );

    const collisionDetectionStrategy: CollisionDetection = useCallback((args) => {
        const rectIntersectionCollisions = rectIntersection(args);
        if (rectIntersectionCollisions.length > 0) return rectIntersectionCollisions;
        const containerCollisions = pointerWithin(args);
        if (containerCollisions.length > 0) {
            const columnIds = ["pending", "in_progress", "completed", "archived"];
            const columnCollision = containerCollisions.find((c) => columnIds.includes(c.id as string));
            if (columnCollision) return [columnCollision];
        }
        return [];
    }, []);

    const renderGoals = (goals: TGoal[]) => goals.map((goal: any) => (
        <SortableGoal
            key={goal.id}
            goal={goal}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleStatus={onToggleStatus}
            onUpdate={onUpdate}
            isDeleting={isDeleting}
            deleteVariables={deleteVariables}
            surface="kanban"
        />
    ));

    const getLocalGoalsByStatus = (status: GoalStatus) => {
        if (status === "pending") return localPendingGoals;
        if (status === "in_progress") return localInProgressGoals;
        if (status === "completed") return localCompletedGoals;
        return localArchivedGoals;
    };

    const handleCreateGoal = (status: GoalStatus, goal: { title: string; description?: string; priority: string; impact: string }) => {
        onCreate?.({
            ...goal,
            status,
            position: getLocalGoalsByStatus(status).length,
            completedAt: status === "completed" ? new Date().toISOString() : undefined,
        });
        setCreatingStatus(null);
    };

    const renderCreateAction = (status: GoalStatus) => {
        if (!onCreate || status === "archived") return null;

        return (
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 rounded-[var(--r-2)] px-2 font-mono text-[10px] uppercase tracking-[0.08em]"
                onClick={() => setCreatingStatus(status)}
            >
                <PlusIcon className="mr-1 h-3.5 w-3.5" />
                Add
            </Button>
        );
    };

    return (
        <DndContext sensors={sensors} collisionDetection={collisionDetectionStrategy} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
            <ScrollArea className="relative min-h-0 w-full flex-1 overflow-y-auto">
                <div className="grid min-h-full w-full min-w-[780px] gap-3 pb-6" style={{ gridTemplateColumns: showArchived ? "repeat(4, minmax(240px, 1fr))" : "repeat(3, minmax(260px, 1fr))" }}>
                    <DroppableColumn id="pending" title="To Do" count={localPendingGoals.length} description="Queued, clarified, ready to pull" action={renderCreateAction("pending")} onCreate={() => setCreatingStatus("pending")}>
                        <SortableContext items={localPendingGoals.map((g: any) => g.id)} strategy={verticalListSortingStrategy}>{renderGoals(localPendingGoals)}</SortableContext>
                    </DroppableColumn>
                    <DroppableColumn id="in_progress" title="In Progress" count={localInProgressGoals.length} description="Active commitments, limited by focus" action={renderCreateAction("in_progress")} onCreate={() => setCreatingStatus("in_progress")}>
                        <SortableContext items={localInProgressGoals.map((g: any) => g.id)} strategy={verticalListSortingStrategy}>{renderGoals(localInProgressGoals)}</SortableContext>
                    </DroppableColumn>
                    <DroppableColumn
                        id="completed"
                        title="Done"
                        count={localCompletedGoals.length}
                        description="Finished work waiting to be cleared"
                        action={
                            <div className="flex items-center gap-1">
                                {renderCreateAction("completed")}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild className="focus-visible:ring-0 focus-visible:ring-offset-0">
                                        <Button variant="ghost" size="sm" className="h-7 px-2 rounded-[var(--r-2)] focus-visible:ring-0 focus-visible:ring-offset-0" title="Archive options">
                                            <ArchiveIcon className="h-3.5 w-3.5 mr-1" /><ChevronDownIcon className="h-3 w-3" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48 focus-visible:ring-0 focus-visible:ring-offset-0">
                                        <DropdownMenuItem onClick={onArchiveCompleted} className="cursor-pointer"><ArchiveIcon className="h-4 w-4 mr-2" />Archive completed</DropdownMenuItem>
                                        <DropdownMenuItem onClick={onShowArchived} className="cursor-pointer"><ArchiveIcon className="h-4 w-4 mr-2" />{showArchived ? "Hide archived" : "Show archived"}</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        }
                        onCreate={() => setCreatingStatus("completed")}
                    >
                        <SortableContext items={localCompletedGoals.map((g: any) => g.id)} strategy={verticalListSortingStrategy}>{renderGoals(localCompletedGoals)}</SortableContext>
                    </DroppableColumn>
                    {showArchived && (
                        <DroppableColumn
                            id="archived"
                            title="Archive"
                            count={localArchivedGoals.length}
                            description="Quiet storage for closed loops"
                            action={<TooltipProvider><Tooltip delayDuration={0}><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 px-2 rounded-[var(--r-2)] focus-visible:ring-0 focus-visible:ring-offset-0" onClick={onShowArchived}><EyeOffIcon className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent><p>Hide archived goals</p></TooltipContent></Tooltip></TooltipProvider>}
                        >
                            <SortableContext items={localArchivedGoals.map((g: any) => g.id)} strategy={verticalListSortingStrategy}>{renderGoals(localArchivedGoals)}</SortableContext>
                        </DroppableColumn>
                    )}
                </div>
            </ScrollArea>
            <DragOverlay>
                {activeGoal ? (
                    <div className="w-[320px]">
                        <Goal
                            goal={activeGoal}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            onToggleStatus={onToggleStatus}
                            onUpdate={onUpdate}
                            isDeleting={isDeleting}
                            deleteVariables={deleteVariables}
                            surface="kanban"
                            isOverlay
                        />
                    </div>
                ) : null}
            </DragOverlay>
            <QuickGoalDialog
                status={creatingStatus}
                open={creatingStatus !== null}
                isCreating={isCreating}
                onOpenChange={(open) => {
                    if (!open) setCreatingStatus(null);
                }}
                onSave={(goal) => {
                    if (!creatingStatus) return;
                    handleCreateGoal(creatingStatus, goal);
                }}
            />
        </DndContext>
    );
};

function QuickGoalDialog({
    status,
    open,
    isCreating,
    onOpenChange,
    onSave,
}: {
    status: GoalStatus | null;
    open: boolean;
    isCreating: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (goal: { title: string; description?: string; priority: string; impact: string }) => void;
}) {
    const [title, setTitle] = React.useState("");
    const [description, setDescription] = React.useState("");
    const [priority, setPriority] = React.useState("priority_4");
    const [impact, setImpact] = React.useState("medium");
    const [detailsOpen, setDetailsOpen] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const statusCopy: Record<GoalStatus, { title: string; eyebrow: string; placeholder: string; helper: string }> = {
        pending: {
            title: "Add to To Do",
            eyebrow: "Queued, clarified, ready to pull",
            placeholder: "What needs a next move?",
            helper: "Enter adds. Shift+Enter opens details.",
        },
        in_progress: {
            title: "Add to In Progress",
            eyebrow: "Active commitments, limited by focus",
            placeholder: "What are you committing to now?",
            helper: "Created directly in In Progress.",
        },
        completed: {
            title: "Add to Done",
            eyebrow: "Finished work waiting to be cleared",
            placeholder: "What did you just finish?",
            helper: "Useful for logging completed work.",
        },
        archived: {
            title: "Add to Archive",
            eyebrow: "Quiet storage for closed loops",
            placeholder: "What should be stored?",
            helper: "Archive creation is intentionally rare.",
        },
    };

    const activeStatus = status ?? "pending";
    const copy = statusCopy[activeStatus];

    const reset = React.useCallback(() => {
        setTitle("");
        setDescription("");
        setPriority("priority_4");
        setImpact("medium");
        setDetailsOpen(false);
    }, []);

    const close = () => {
        reset();
        onOpenChange(false);
    };

    const submit = () => {
        const cleanTitle = title.trim();
        if (!cleanTitle || isCreating) return;

        onSave({
            title: cleanTitle,
            description: description.trim() || undefined,
            priority,
            impact,
        });
        reset();
    };

    const handleTitleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Escape") {
            event.preventDefault();
            close();
            return;
        }

        if (event.key === "Enter" && event.shiftKey) {
            event.preventDefault();
            setDetailsOpen(true);
            return;
        }

        if (event.key === "Enter") {
            event.preventDefault();
            submit();
        }
    };

    const handleTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Escape") {
            event.preventDefault();
            close();
            return;
        }

        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            submit();
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) reset();
                onOpenChange(nextOpen);
            }}
        >
            <DialogContent
                className="max-w-lg overflow-hidden border border-border bg-[var(--bg-elev)] p-0 shadow-[0_20px_64px_-48px_rgba(0,0,0,0.95)]"
                onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    inputRef.current?.focus();
                }}
            >
                <DialogHeader className="border-b border-border px-5 py-4 text-left">
                    <DialogTitle className="pr-8 text-lg font-semibold leading-6 tracking-normal text-foreground">
                        {copy.title}
                    </DialogTitle>
                    <DialogDescription className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                        {copy.eyebrow}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 bg-[var(--bg)]/45 px-5 pb-5 pt-4">
                    <input
                        ref={inputRef}
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        onKeyDown={handleTitleKeyDown}
                        placeholder={copy.placeholder}
                        className="h-9 w-full rounded-[var(--r-2)] border border-input bg-background px-3 text-sm font-medium text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[var(--ink-line)] focus:ring-2 focus:ring-ring/30"
                    />

                    {detailsOpen && (
                        <div className="space-y-2">
                            <textarea
                                value={description}
                                onChange={(event) => setDescription(event.target.value)}
                                onKeyDown={handleTextareaKeyDown}
                                placeholder="What does a good outcome look like?"
                                className="min-h-20 w-full resize-none rounded-[var(--r-2)] border border-input bg-background px-3 py-2 text-sm leading-5 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[var(--ink-line)] focus:ring-2 focus:ring-ring/30"
                            />
                            <div className="grid grid-cols-2 gap-2">
                                <ComposerSelect
                                    label="Priority"
                                    value={priority}
                                    onChange={setPriority}
                                    options={[
                                        ["priority_1", "P1"],
                                        ["priority_2", "P2"],
                                        ["priority_3", "P3"],
                                        ["priority_4", "P4"],
                                    ]}
                                />
                                <ComposerSelect
                                    label="Impact"
                                    value={impact}
                                    onChange={setImpact}
                                    options={[
                                        ["low", "Low"],
                                        ["medium", "Medium"],
                                        ["high", "High"],
                                    ]}
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={() => setDetailsOpen((value) => !value)}
                            className={cn(
                                "inline-flex h-7 items-center gap-1.5 rounded-[var(--r-2)] px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                                detailsOpen && "bg-secondary text-foreground"
                            )}
                        >
                            <SlidersHorizontalIcon className="h-3.5 w-3.5" />
                            Details
                        </button>
                        <div className="flex items-center gap-2">
                            <span className="hidden font-mono text-[10px] text-muted-foreground lg:inline">{copy.helper}</span>
                            <Button type="button" size="sm" className="h-8" onClick={submit} disabled={!title.trim() || isCreating} loading={isCreating} hideContentWhenLoading>
                                <CornerDownLeftIcon className="mr-1.5 h-3.5 w-3.5" />
                                Add
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function ComposerSelect({
    label,
    value,
    onChange,
    options,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: Array<[string, string]>;
}) {
    return (
        <label className="space-y-1">
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
            <select
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="h-8 w-full rounded-[var(--r-2)] border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-[var(--ink-line)] focus:ring-2 focus:ring-ring/30"
            >
                {options.map(([optionValue, optionLabel]) => (
                    <option key={optionValue} value={optionValue}>
                        {optionLabel}
                    </option>
                ))}
            </select>
        </label>
    );
}
