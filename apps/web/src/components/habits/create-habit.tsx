import { HabitForm } from "./habit-form";

export type CreateHabitProps = {
    onSave: (habit: any) => void;
    onCancel: () => void;
    loading?: boolean;
};

export const CreateHabit = ({ onSave, onCancel, loading }: CreateHabitProps) => {
    return (
        <HabitForm
            mode="create"
            onSave={onSave}
            onCancel={onCancel}
            loading={loading}
            showHeader
        />
    );
};
