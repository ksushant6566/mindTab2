import { CircleDashed, FolderOpen } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";

type Project = {
    id: string;
    name?: string | null;
    status?: string | null;
};

type JournalProjectSelectProps = {
    value?: string | null;
    projects?: Project[] | null;
    onValueChange: (value: string | null) => void;
    disabled?: boolean;
    className?: string;
};

const pickerContentClassName =
    "border-border bg-[var(--bg-elev)] shadow-[0_18px_44px_-34px_rgba(0,0,0,0.95)]";

const pickerItemClassName =
    "h-8 rounded-[var(--r-2)] py-1.5 pl-8 pr-2 text-xs text-foreground focus:bg-[var(--bg-soft)] focus:text-foreground data-[state=checked]:bg-[var(--bg-soft)]";

export function JournalProjectSelect({
    value,
    projects,
    onValueChange,
    disabled,
    className,
}: JournalProjectSelectProps) {
    const selectedProject = projects?.find((project) => project.id === value);
    const selectedLabel = selectedProject?.name || "No Project";

    return (
        <Select
            value={value || "none"}
            onValueChange={(nextValue) => onValueChange(nextValue === "none" ? null : nextValue)}
            disabled={disabled}
        >
            <SelectTrigger
                className={cn(
                    "h-8 gap-2 rounded-[var(--r-2)] border-input bg-background px-2 text-xs focus:ring-2 focus:ring-ring/30 focus:ring-offset-0 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0",
                    className
                )}
            >
                <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                    {selectedProject ? (
                        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--cyan)]" />
                    ) : (
                        <CircleDashed className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{selectedLabel}</span>
                </div>
            </SelectTrigger>
            <SelectContent className={pickerContentClassName}>
                <SelectGroup>
                    <SelectLabel className="py-1 pl-8 pr-2 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                        Project
                    </SelectLabel>
                    <SelectItem value="none" className={pickerItemClassName}>
                        <span className="flex items-center gap-2">
                            <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />
                            No Project
                        </span>
                    </SelectItem>
                    {projects?.map((project) => (
                        <SelectItem
                            key={project.id}
                            value={project.id}
                            className={pickerItemClassName}
                        >
                            <span className="flex items-center gap-2">
                                <FolderOpen className="h-3.5 w-3.5 text-[var(--cyan)]" />
                                {project.name || "Unnamed Project"}
                            </span>
                        </SelectItem>
                    ))}
                </SelectGroup>
            </SelectContent>
        </Select>
    );
}
