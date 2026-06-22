import { AlertTriangle } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/ui/dialog";

type DeleteTaskConfirmDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    taskTitle?: string | null;
    isDeleting?: boolean;
    onConfirm: () => void;
};

export function DeleteTaskConfirmDialog({
    open,
    onOpenChange,
    taskTitle,
    isDeleting = false,
    onConfirm,
}: DeleteTaskConfirmDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[370px] border-border bg-[var(--bg-elev)] p-0 shadow-[0_18px_56px_-44px_rgba(0,0,0,0.95)]">
                <div className="px-5 py-[18px] pr-12 text-left">
                    <div className="flex h-4 items-center gap-1.5 font-mono text-[10px] uppercase leading-none tracking-[0.08em] text-[var(--rose)]">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        <span>Permanent delete</span>
                    </div>
                    <DialogTitle className="mt-2.5 text-base font-semibold leading-5 tracking-normal text-foreground">
                        Delete task?
                    </DialogTitle>
                    <DialogDescription className="mt-2 text-sm leading-5 text-muted-foreground">
                        {taskTitle ? (
                            <>
                                Delete <span className="text-foreground">&quot;{taskTitle}&quot;</span>? This cannot be undone.
                            </>
                        ) : (
                            "Delete this task? This cannot be undone."
                        )}
                    </DialogDescription>
                    <div className="mt-5 flex justify-end gap-2">
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
                            className="h-8 border-[var(--rose)] bg-transparent text-[var(--rose)] hover:bg-[var(--bg-soft)] hover:text-[var(--rose)]"
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
