import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { CreateHabit, CreateHabitProps } from "./create-habit";

type TCreateHabitDialogProps = CreateHabitProps & { isOpen: boolean; onOpenChange: (open: boolean) => void; };

export const CreateHabitDialog = ({ isOpen, onOpenChange, ...props }: TCreateHabitDialogProps) => {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg overflow-hidden border border-border bg-[var(--bg-elev)] p-0 shadow-[0_20px_64px_-48px_rgba(0,0,0,0.95)] md:max-w-xl">
                <DialogHeader className="sr-only">
                    <DialogTitle>Create new habit</DialogTitle>
                    <DialogDescription>Add a new habit to track daily or weekly.</DialogDescription>
                </DialogHeader>
                <CreateHabit {...props} />
            </DialogContent>
        </Dialog>
    );
};
