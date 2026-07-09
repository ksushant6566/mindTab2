import { NoteProjectSelectControl, type NoteProjectOption } from "~/components/domain/notes";

type NoteProjectSelectProps = {
    value?: string | null;
    projects?: NoteProjectOption[] | null;
    onValueChange: (value: string | null) => void;
    disabled?: boolean;
    className?: string;
};

export function NoteProjectSelect({
    value,
    projects,
    onValueChange,
    disabled,
    className,
}: NoteProjectSelectProps) {
    return (
        <NoteProjectSelectControl
            value={value}
            projects={projects}
            onValueChange={onValueChange}
            disabled={disabled}
            className={className}
        />
    );
}
