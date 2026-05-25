import React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { CreateTask, CreateTaskProps } from "./create-task";

type CreateTaskDialogProps = CreateTaskProps & { open: boolean; onOpenChange: (open: boolean) => void; };

export const CreateTaskDialog: React.FC<CreateTaskDialogProps> = ({ open, onOpenChange, ...props }) => {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogHeader>
                <DialogTitle className="sr-only">Create Task</DialogTitle>
                <DialogDescription className="sr-only">Create a new task, add a title, description, and other details.</DialogDescription>
            </DialogHeader>
            <DialogContent className="max-w-lg md:max-w-xl border-none p-0">
                <CreateTask {...props} />
            </DialogContent>
        </Dialog>
    );
};
