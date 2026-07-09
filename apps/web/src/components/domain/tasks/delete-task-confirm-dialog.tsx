import { AlertTriangle } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { TaskCardVisual, type TaskCardTask } from "./task-card-visual";

type DeleteTaskConfirmDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    taskTitle?: string | null;
    task?: TaskCardTask | null;
    isDeleting?: boolean;
    onConfirm: () => void;
};

export function DeleteTaskConfirmDialog({
    open,
    onOpenChange,
    taskTitle,
    task,
    isDeleting = false,
    onConfirm,
}: DeleteTaskConfirmDialogProps) {
    const title = task?.title || taskTitle || "Untitled task";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[460px] overflow-hidden border border-border bg-[var(--bg-elev)] p-0 shadow-[var(--shadow-dialog)]">
                <DialogHeader className="border-b border-border px-5 py-4 text-left">
                    <DialogTitle className="pr-8 text-lg font-semibold leading-6 tracking-normal text-foreground">
                        Delete task?
                    </DialogTitle>
                    <DialogDescription className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--tone-danger)]">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        <span>Permanent delete</span>
                    </DialogDescription>
                </DialogHeader>

                <div className="bg-[var(--bg)]/45 px-5 pb-5 pt-4">
                    {task ? (
                        <TaskCardVisual task={task} surface="kanban" readOnly />
                    ) : (
                        <div className="rounded-[var(--r-3)] border border-border bg-card px-3 py-2.5 text-card-foreground">
                            <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                                Task
                            </div>
                            <p className="mt-1 text-sm font-medium leading-5 text-foreground">
                                {title}
                            </p>
                        </div>
                    )}

                    <p className="mt-3 text-sm leading-5 text-muted-foreground">
                        {title ? (
                            <>
                                This will permanently delete <span className="text-foreground">&quot;{title}&quot;</span>. This cannot be undone.
                            </>
                        ) : (
                            "This task will be permanently deleted. This cannot be undone."
                        )}
                    </p>

                    <div className="mt-4 flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8"
                            onClick={() => onOpenChange(false)}
                            disabled={isDeleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 border-[var(--tone-danger)] bg-transparent text-[var(--tone-danger)] hover:bg-[var(--tone-danger)]/10 hover:text-[var(--tone-danger)]"
                            onClick={onConfirm}
                            loading={isDeleting}
                        >
                            Delete
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
