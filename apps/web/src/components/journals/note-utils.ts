export type MentionType = "journal" | "goal" | "habit";

export type MentionedItem = {
    id: string;
    label: string;
    type: MentionType;
};

export type JournalLike = {
    id: string;
    title?: string | null;
    content?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    projectId?: string | null;
    project?: {
        id: string;
        name?: string | null;
        status?: string | null;
    } | null;
    projectName?: string | null;
    [key: string]: unknown;
};

const entityMap: Record<string, string> = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": "\"",
    "&#39;": "'",
};

export function getJournalProjectName(journal?: JournalLike | null) {
    return journal?.project?.name || journal?.projectName || null;
}

export function formatJournalDate(value?: string | null) {
    if (!value) return "Undated";

    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
    }).format(new Date(value));
}

export function stripHtmlToText(html?: string | null) {
    if (!html) return "";

    if (typeof DOMParser !== "undefined") {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        return normalizeText(doc.body.textContent ?? "");
    }

    return normalizeText(
        html
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, (entity) => entityMap[entity] ?? " ")
    );
}

export function getJournalExcerpt(html?: string | null, maxLength = 220) {
    const text = stripHtmlToText(html);
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength).trim()}...`;
}

export function countWords(html?: string | null) {
    const text = stripHtmlToText(html);
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
}

export function getMentionedItems(content?: string | null) {
    const mentionedItems: Record<MentionType, MentionedItem[]> = {
        journal: [],
        goal: [],
        habit: [],
    };

    if (!content || typeof DOMParser === "undefined") return mentionedItems;

    const parser = new DOMParser();
    const doc = parser.parseFromString(content, "text/html");
    const mentionSpans = doc.querySelectorAll(".mention");
    const mentionedIdsSet = new Set<string>();

    mentionSpans.forEach((span) => {
        const [type, id] = span.getAttribute("data-id")?.split(":") || [];
        const label = span.getAttribute("data-label");
        const mentionType = type as MentionType;
        const dedupeKey = `${mentionType}:${id}`;

        if (
            id &&
            label &&
            ["journal", "goal", "habit"].includes(mentionType) &&
            !mentionedIdsSet.has(dedupeKey)
        ) {
            mentionedItems[mentionType].push({
                id,
                label: label.includes(":") ? label.split(":").slice(1).join(":") : label,
                type: mentionType,
            });
            mentionedIdsSet.add(dedupeKey);
        }
    });

    return mentionedItems;
}

function normalizeText(value: string) {
    return value.replace(/\s+/g, " ").trim();
}
