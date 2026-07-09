import { type CheckedState } from "@radix-ui/react-checkbox";
import React from "react";
import { useCalendarSchedules } from "~/lib/calendar-schedules";
import { DeleteTaskConfirmDialog } from "./delete-task-confirm-dialog";
import { TaskCardVisual, type TaskCardTask } from "./task-card-visual";

type TaskDialogOpenMode = "view" | "edit";

interface TaskProps {
    task: TaskCardTask;
    onEdit: (id: string, mode?: TaskDialogOpenMode) => void;
    onDelete: (id: string) => void;
    onToggleStatus: (id: string, checked: CheckedState) => void;
    onUpdate?: (id: string, task: Record<string, unknown>) => void;
    isDeleting: boolean;
    deleteVariables?: string;
    surface?: "list" | "kanban";
    isDragging?: boolean;
    isOverlay?: boolean;
    dragHandleRef?: React.Ref<HTMLButtonElement>;
    dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
    hideDragHandle?: boolean;
    showCalendarActions?: boolean;
    showProjectMetadata?: boolean;
    nativeDragTaskId?: string;
}

export const Task: React.FC<TaskProps> = ({
    task,
    onEdit,
    onDelete,
    onToggleStatus,
    isDeleting,
    deleteVariables,
    surface = "list",
    isDragging = false,
    isOverlay = false,
    dragHandleRef,
    dragHandleProps,
    hideDragHandle = false,
    showCalendarActions = false,
    showProjectMetadata = true,
    nativeDragTaskId,
}) => {
    return (
        <TaskCard
            task={task}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleStatus={onToggleStatus}
            isDeleting={isDeleting}
            deleteVariables={deleteVariables}
            surface={surface}
            isDragging={isDragging}
            isOverlay={isOverlay}
            dragHandleRef={dragHandleRef}
            dragHandleProps={dragHandleProps}
            hideDragHandle={hideDragHandle}
            showCalendarActions={showCalendarActions}
            showProjectMetadata={showProjectMetadata}
            nativeDragTaskId={nativeDragTaskId}
        />
    );
};

const TaskCard: React.FC<Required<Pick<TaskProps, "task" | "onEdit" | "onDelete" | "onToggleStatus" | "isDeleting" | "surface" | "hideDragHandle" | "showCalendarActions" | "showProjectMetadata">> & Pick<TaskProps, "deleteVariables" | "isDragging" | "isOverlay" | "dragHandleRef" | "dragHandleProps" | "nativeDragTaskId">> = ({
    task,
    onEdit,
    onDelete,
    onToggleStatus,
    isDeleting,
    deleteVariables,
    surface,
    isDragging,
    isOverlay,
    dragHandleRef,
    dragHandleProps,
    hideDragHandle,
    showCalendarActions,
    showProjectMetadata,
    nativeDragTaskId,
}) => {
    const { schedules, unscheduleTask } = useCalendarSchedules();
    const cardRef = React.useRef<HTMLElement>(null);
    const schedule = schedules[task.id];
    const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);

    const handleNativeDragStart = (event: React.DragEvent<HTMLButtonElement>) => {
        if (!nativeDragTaskId) return;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", nativeDragTaskId);

        const card = cardRef.current;
        if (card) {
            const rect = card.getBoundingClientRect();
            event.dataTransfer.setDragImage(card, event.clientX - rect.left, event.clientY - rect.top);
        }
    };

    return (
        <>
        <TaskCardVisual
            ref={cardRef}
            task={task}
            surface={surface}
            isDragging={isDragging}
            isOverlay={isOverlay}
            hideDragHandle={hideDragHandle}
            showCalendarActions={showCalendarActions}
            showProjectMetadata={showProjectMetadata}
            hasSchedule={!!schedule}
            nativeDragTaskId={nativeDragTaskId}
            dragHandleRef={dragHandleRef}
            dragHandleProps={dragHandleProps}
            onNativeDragStart={handleNativeDragStart}
            onOpen={() => onEdit(task.id, "view")}
            onEdit={() => onEdit(task.id, "edit")}
            onDelete={() => setDeleteConfirmOpen(true)}
            onUnschedule={() => unscheduleTask(task.id)}
            onToggleStatus={(checked) => onToggleStatus(task.id, checked)}
            isDeleting={isDeleting && deleteVariables === task.id}
        />
        <DeleteTaskConfirmDialog
            open={deleteConfirmOpen}
            onOpenChange={setDeleteConfirmOpen}
            taskTitle={task.title}
            task={task}
            isDeleting={isDeleting && deleteVariables === task.id}
            onConfirm={() => {
                onDelete(task.id);
                setDeleteConfirmOpen(false);
            }}
        />
        </>
    );
};
