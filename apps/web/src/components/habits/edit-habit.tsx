import { HabitForm } from "./habit-form";

export type EditHabitProps = {
    onSave: (habit: any) => void;
    onCancel: () => void;
    habit: any;
    loading?: boolean;
};

export const EditHabit = ({ onSave, onCancel, habit, loading }: EditHabitProps) => {
    return (
        <HabitForm
            mode="edit"
            habit={habit}
            onSave={onSave}
            onCancel={onCancel}
            loading={loading}
        />
    );
};
