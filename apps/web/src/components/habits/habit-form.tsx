import { type ChangeEvent, type FormEvent, type KeyboardEvent, useRef, useState } from "react";
import { Plus, Repeat2, Save, X } from "lucide-react";
import { RichTextEditor } from "~/components/text-editor";
import { Button } from "~/components/ui/button";
import { isRichTextEmpty, sanitizeRichText } from "~/lib/rich-text";
import { cn, handleCmdEnterSubmit } from "~/lib/utils";

type HabitFormProps = {
    mode: "create" | "edit";
    habit?: any;
    onSave: (habit: any) => void;
    onCancel: () => void;
    loading?: boolean;
    showHeader?: boolean;
};

export function HabitForm({
    mode,
    habit,
    onSave,
    onCancel,
    loading,
    showHeader = false,
}: HabitFormProps) {
    const [formData, setFormData] = useState<any>({
        id: habit?.id,
        title: habit?.title ?? "",
        description: habit?.description ?? "",
        frequency: habit?.frequency ?? "daily",
    });
    const titleRef = useRef<HTMLInputElement>(null);

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        setFormData((prev: any) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        const title = String(formData.title ?? "").trim();
        if (!title) return;

        onSave({
            ...formData,
            title,
            description: isRichTextEmpty(formData.description) ? "" : sanitizeRichText(formData.description),
            frequency: formData.frequency || "daily",
        });
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "ArrowUp") {
            event.preventDefault();
            titleRef.current?.focus();
        }
    };

    return (
        <form onSubmit={handleSubmit} onKeyDown={handleCmdEnterSubmit} className="overflow-hidden">
            {showHeader && (
                <div className="border-b border-border px-5 py-4">
                    <h2 className="text-lg font-semibold leading-6 tracking-normal text-foreground">
                        New Habit
                    </h2>
                    <div className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                        Daily / Weekly
                    </div>
                </div>
            )}

            <div className={cn("space-y-3", showHeader && "bg-[var(--bg)]/45 px-5 pb-5 pt-4")}>
                <input
                    type="text"
                    id={mode === "create" ? "create-habit-title" : "edit-habit-title"}
                    name="title"
                    placeholder="Habit"
                    value={formData.title || ""}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    required
                    className="h-9 w-full rounded-[var(--r-2)] border border-input bg-background px-3 text-sm font-medium text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[var(--ink-line)] focus:ring-2 focus:ring-ring/30"
                    ref={titleRef}
                    autoFocus
                />
                <RichTextEditor
                    content={formData.description || ""}
                    onContentChange={(description) => setFormData((prev: any) => ({ ...prev, description }))}
                    placeholder="Description"
                    className="habit-description-editor overflow-hidden rounded-[var(--r-2)] border border-input bg-background transition-[border-color,box-shadow] duration-150 focus-within:border-[var(--ink-line)] focus-within:ring-2 focus-within:ring-ring/30"
                    editorContentClassName="w-full"
                />

                <div className="space-y-1">
                    <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">Frequency</span>
                    <div className="grid grid-cols-2 gap-2">
                        {(["daily", "weekly"] as const).map((frequency) => {
                            const selected = formData.frequency === frequency;
                            return (
                                <button
                                    key={frequency}
                                    type="button"
                                    onClick={() => setFormData((prev: any) => ({ ...prev, frequency }))}
                                    className={cn(
                                        "flex h-9 items-center justify-center gap-1.5 rounded-[var(--r-2)] border border-input bg-background px-3 text-xs font-medium capitalize text-muted-foreground transition-all duration-150 [transition-timing-function:var(--ease-out)]",
                                        "hover:border-[var(--border-2)] hover:bg-[var(--bg-soft)] hover:text-foreground",
                                        selected && "border-primary bg-primary text-primary-foreground shadow-[0_0_0_1px_var(--ink)]"
                                    )}
                                >
                                    <Repeat2 className="h-3.5 w-3.5" />
                                    {frequency}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                    <Button size="sm" variant="ghost" className="h-8" onClick={onCancel} type="button" disabled={loading}>
                        <X className="mr-1.5 h-3.5 w-3.5" />
                        Cancel
                    </Button>
                    <Button size="sm" type="submit" className="h-8" disabled={loading || !String(formData.title ?? "").trim()} loading={loading}>
                        {mode === "create" ? <Plus className="mr-1.5 h-3.5 w-3.5" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                        {mode === "create" ? "Add Habit" : "Save"}
                    </Button>
                </div>
            </div>
        </form>
    );
}
