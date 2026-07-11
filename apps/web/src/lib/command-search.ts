export type CommandSearchKind =
  | "action"
  | "navigation"
  | "task"
  | "note"
  | "project"
  | "chat"
  | "vault"
  | "settings";

export type CommandSearchCandidate = {
  label: string;
  description?: string;
  aliases?: string[];
  keywords?: string[];
  kind: CommandSearchKind;
  projectId?: string | null;
  timestamp?: string | null;
};

export type CommandSearchResult<T> = {
  item: T;
  score: number;
  reason: "Exact" | "Starts with" | "Phrase" | "Words" | "Fuzzy" | "Filtered";
};

type RankCommandItemsOptions = {
  activeProjectId?: string | null;
  limit?: number;
};

const prefixKinds: Record<string, CommandSearchKind[]> = {
  task: ["task"],
  tasks: ["task"],
  note: ["note"],
  notes: ["note"],
  project: ["project"],
  projects: ["project"],
  chat: ["chat"],
  chats: ["chat"],
  vault: ["vault"],
  save: ["vault"],
  saves: ["vault"],
  setting: ["settings"],
  settings: ["settings"],
  command: ["action", "navigation", "settings"],
  commands: ["action", "navigation", "settings"],
};

const intentTerms: Partial<Record<CommandSearchKind, Set<string>>> = {
  action: new Set(["add", "create", "new", "start"]),
  navigation: new Set(["go", "open", "show", "view"]),
  task: new Set(["task", "tasks", "todo", "todos"]),
  note: new Set(["note", "notes", "document", "documents"]),
  project: new Set(["project", "projects", "workspace", "workspaces"]),
  chat: new Set(["chat", "chats", "conversation", "conversations"]),
  vault: new Set(["bookmark", "bookmarks", "save", "saved", "saves", "vault"]),
  settings: new Set(["preference", "preferences", "setting", "settings"]),
};

const kindTieBreak: Record<CommandSearchKind, number> = {
  action: 8,
  navigation: 7,
  task: 6,
  note: 5,
  project: 4,
  chat: 3,
  vault: 2,
  settings: 1,
};

type NormalizedCandidate = {
  label: string;
  description: string;
  aliases: string[];
  keywords: string[];
  labelWords: string[];
  aliasWords: string[];
  descriptionWords: string[];
  keywordWords: string[];
};

const normalizedCandidateCache = new WeakMap<CommandSearchCandidate, NormalizedCandidate>();

export function rankCommandItems<T extends CommandSearchCandidate>(
  items: T[],
  rawQuery: string,
  options: RankCommandItemsOptions = {},
): Array<CommandSearchResult<T>> {
  const parsed = parseQuery(rawQuery);
  if (!parsed.query && parsed.kinds.length === 0) return [];

  return items
    .map((item, index) => {
      if (parsed.kinds.length > 0 && !parsed.kinds.includes(item.kind)) return null;

      const match = parsed.query
        ? scoreTextMatch(item, parsed.query)
        : { score: 1000, reason: "Filtered" as const };
      if (match.score <= 0) return null;

      const intentBoost = hasKindIntent(parsed.tokens, item.kind) ? 55 : 0;
      const projectBoost = options.activeProjectId && item.projectId === options.activeProjectId ? 28 : 0;
      const recencyBoost = getRecencyBoost(item.timestamp);
      const score = match.score + intentBoost + projectBoost + recencyBoost + kindTieBreak[item.kind] / 100;

      return { item, score, reason: match.reason, index };
    })
    .filter((result): result is CommandSearchResult<T> & { index: number } => result !== null)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, options.limit ?? 20)
    .map(({ item, score, reason }) => ({ item, score, reason }));
}

export function getCommandSearchQuery(rawQuery: string) {
  return parseQuery(rawQuery).query;
}

function parseQuery(rawQuery: string) {
  const normalized = normalizeSearchText(rawQuery);
  const prefixMatch = normalized.match(/^([a-z]+):\s*(.*)$/);
  const kinds = prefixMatch ? prefixKinds[prefixMatch[1] ?? ""] ?? [] : [];
  const query = prefixMatch && kinds.length > 0 ? prefixMatch[2] ?? "" : normalized;
  return {
    query,
    kinds,
    tokens: query.split(" ").filter(Boolean),
  };
}

function scoreTextMatch(item: CommandSearchCandidate, query: string) {
  const {
    label,
    description,
    aliases,
    keywords,
    labelWords,
    aliasWords,
    descriptionWords,
    keywordWords,
  } = getNormalizedCandidate(item);

  if (label === query) return { score: 1500, reason: "Exact" as const };
  if (aliases.includes(query)) return { score: 1450, reason: "Exact" as const };
  if (label.startsWith(query)) return { score: 1320, reason: "Starts with" as const };
  if (aliases.some((alias) => alias.startsWith(query))) return { score: 1270, reason: "Starts with" as const };
  if (containsAtWordBoundary(label, query)) return { score: 1200, reason: "Phrase" as const };
  if (label.includes(query)) return { score: 1140, reason: "Phrase" as const };
  if (aliases.some((alias) => alias.includes(query))) return { score: 1080, reason: "Phrase" as const };
  if (description.includes(query)) return { score: 900, reason: "Phrase" as const };
  if (keywords.some((keyword) => keyword.includes(query))) return { score: 820, reason: "Phrase" as const };

  const queryTokens = query.split(" ").filter(Boolean);
  const tokenScores = queryTokens.map((token) => Math.max(
    bestTokenScore(token, labelWords, 1),
    bestTokenScore(token, aliasWords, 0.96),
    bestTokenScore(token, descriptionWords, 0.82),
    bestTokenScore(token, keywordWords, 0.72),
  ));

  if (tokenScores.length === 0 || tokenScores.some((score) => score < 0.5)) {
    return { score: 0, reason: "Fuzzy" as const };
  }

  const average = tokenScores.reduce((sum, score) => sum + score, 0) / tokenScores.length;
  const fuzzy = tokenScores.some((score) => score < 0.9);
  return {
    score: (fuzzy ? 560 : 690) + average * 260,
    reason: fuzzy ? "Fuzzy" as const : "Words" as const,
  };
}

function getNormalizedCandidate(item: CommandSearchCandidate) {
  const cached = normalizedCandidateCache.get(item);
  if (cached) return cached;

  const label = normalizeSearchText(item.label);
  const description = normalizeSearchText(item.description ?? "");
  const aliases = (item.aliases ?? []).map(normalizeSearchText);
  const keywords = (item.keywords ?? []).map(normalizeSearchText);
  const normalized = {
    label,
    description,
    aliases,
    keywords,
    labelWords: words(label),
    aliasWords: words(aliases.join(" ")),
    descriptionWords: words(description),
    keywordWords: words(keywords.join(" ")),
  };
  normalizedCandidateCache.set(item, normalized);
  return normalized;
}

function bestTokenScore(token: string, candidates: string[], fieldWeight: number) {
  let best = 0;
  for (const candidate of candidates) {
    let score = 0;
    if (candidate === token) score = 1;
    else if (candidate.startsWith(token)) score = 0.92;
    else if (candidate.includes(token) && token.length >= 3) score = 0.8;
    else if (token.length >= 3 && candidate.length >= 3) {
      const distance = boundedDamerauLevenshtein(token, candidate, allowedDistance(token.length));
      if (distance !== null) score = Math.max(0.52, 1 - distance / Math.max(token.length, candidate.length));
    }
    best = Math.max(best, score * fieldWeight);
  }
  return best;
}

function boundedDamerauLevenshtein(left: string, right: string, maximum: number) {
  if (Math.abs(left.length - right.length) > maximum) return null;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  let beforePrevious = previous.slice();

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = current[0] ?? leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      let distance = Math.min(
        (previous[rightIndex] ?? 0) + 1,
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + substitutionCost,
      );
      if (
        leftIndex > 1
        && rightIndex > 1
        && left[leftIndex - 1] === right[rightIndex - 2]
        && left[leftIndex - 2] === right[rightIndex - 1]
      ) {
        distance = Math.min(distance, (beforePrevious[rightIndex - 2] ?? 0) + 1);
      }
      current[rightIndex] = distance;
      rowMinimum = Math.min(rowMinimum, distance);
    }
    if (rowMinimum > maximum) return null;
    beforePrevious = previous.slice();
    previous.splice(0, previous.length, ...current);
  }

  const distance = previous[right.length] ?? maximum + 1;
  return distance <= maximum ? distance : null;
}

function allowedDistance(length: number) {
  if (length <= 4) return 1;
  if (length <= 8) return 2;
  return 3;
}

function hasKindIntent(tokens: string[], kind: CommandSearchKind) {
  const terms = intentTerms[kind];
  return Boolean(terms && tokens.some((token) => terms.has(token)));
}

function getRecencyBoost(timestamp?: string | null) {
  if (!timestamp) return 0;
  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time)) return 0;
  const ageInDays = Math.max(0, (Date.now() - time) / 86_400_000);
  return Math.max(0, 18 - Math.log2(ageInDays + 1) * 3);
}

function containsAtWordBoundary(value: string, query: string) {
  const index = value.indexOf(query);
  return index >= 0 && (index === 0 || value[index - 1] === " ");
}

function words(value: string) {
  return value.split(/[^a-z0-9]+/).filter(Boolean);
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
