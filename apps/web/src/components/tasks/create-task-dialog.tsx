import React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { CreateTask, CreateTaskProps } from "./create-task";

type CreateTaskDialogProps = CreateTaskProps & { open: boolean; onOpenChange: (open: boolean) => void; };

export const CreateTaskDialog: React.FC<CreateTaskDialogProps> = ({ open, onOpenChange, ...props }) => {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg overflow-hidden border border-border bg-[var(--bg-elev)] p-0 shadow-[0_20px_64px_-48px_rgba(0,0,0,0.95)] md:max-w-xl">
                <DialogHeader className="sr-only">
                    <DialogTitle>Create Task</DialogTitle>
                    <DialogDescription>Create a new task, add a title, description, and other details.</DialogDescription>
                </DialogHeader>
                <CreateTask {...props} />
            </DialogContent>
        </Dialog>
    );
};
