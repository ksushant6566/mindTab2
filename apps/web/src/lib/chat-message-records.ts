import type {
  ChatContentPart,
  ChatMessageRecord,
  ChatToolCall,
} from "~/lib/web-chat-context";

export type RenderableChatMessage = {
  id: string;
  role: "user" | "assistant";
  parts: ChatContentPart[];
  createdAt: string;
};

export function normalizeChatMessages(messages: ChatMessageRecord[]): RenderableChatMessage[] {
  const toolResults = new Map<string, unknown>();
  const fallbackToolResults = new Map<string, unknown[]>();

  messages.forEach((message, index) => {
    if (message.role !== "assistant" || !Array.isArray(message.tool_calls)) return;
    const results: unknown[] = [];
    for (let resultIndex = index + 1; resultIndex < messages.length; resultIndex += 1) {
      const candidate = messages[resultIndex];
      if (candidate?.role !== "tool") break;
      results.push(parseJSON(candidate.content));
    }
    if (results.length > 0) fallbackToolResults.set(message.id, results);
  });

  for (const message of messages) {
    if (message.role !== "tool" || !message.tool_call_id) continue;
    toolResults.set(message.tool_call_id, parseJSON(message.content));
  }

  const normalized: RenderableChatMessage[] = [];
  let assistantText = "";

  for (const message of messages) {
    if (message.role === "tool") continue;
    if (message.role !== "user" && message.role !== "assistant") continue;

    const previousMessage = normalized.at(-1);
    const continuesAssistantTurn = message.role === "assistant" && previousMessage?.role === "assistant";
    if (!continuesAssistantTurn) assistantText = "";

    const toolCalls = normalizeToolCalls(
      message.tool_calls,
      toolResults,
      fallbackToolResults.get(message.id) ?? [],
      message.id,
    );
    let content = toolCalls.length > 0 && looksLikeToolJSON(message.content)
      ? ""
      : message.content;
    if (continuesAssistantTurn && content) {
      content = stripRepeatedAssistantPrefix(content, assistantText);
    }

    const parts: ChatContentPart[] = [];
    if (content) {
      parts.push({ id: `${message.id}-text`, type: "text", content });
    }
    for (const toolCall of toolCalls) {
      parts.push({ id: `${message.id}-${toolCall.callId}`, type: "tool", toolCall });
    }
    if (parts.length === 0) continue;

    if (continuesAssistantTurn && previousMessage) {
      previousMessage.parts.push(...parts);
      previousMessage.createdAt = message.created_at;
    } else {
      normalized.push({
        id: message.id,
        role: message.role,
        parts,
        createdAt: message.created_at,
      });
    }

    if (message.role === "assistant" && content) assistantText += content;
  }

  return normalized;
}

export function buildChatTranscript(title: string, messages: RenderableChatMessage[]) {
  const sections = [`# ${title}`];
  for (const message of messages) {
    sections.push(`## ${message.role === "user" ? "You" : "MindTab"}`);
    for (const part of message.parts) {
      if (part.type === "tool") {
        sections.push(`_Workspace step: ${part.toolCall.tool.replaceAll("_", " ")}_`);
      } else if (part.content) {
        sections.push(part.content);
      }
    }
  }
  return sections.join("\n\n");
}

function normalizeToolCalls(
  raw: unknown,
  toolResults: Map<string, unknown>,
  fallbackResults: unknown[],
  messageId: string,
): ChatToolCall[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const record = item && typeof item === "object"
      ? item as Record<string, unknown>
      : {};
    const rawCallId = firstNonEmptyString(record.ID, record.id, record.call_id);
    const callId = rawCallId ?? `${messageId}-${index}`;
    const tool = String(record.Name ?? record.name ?? record.tool ?? "tool");
    const argsValue = record.Arguments ?? record.arguments ?? record.args;
    const args = typeof argsValue === "string" ? parseJSON(argsValue) : argsValue;
    const result = (rawCallId ? toolResults.get(rawCallId) : undefined)
      ?? fallbackResults[index]
      ?? record.result;
    const hasError = Boolean(result && typeof result === "object" && "error" in result);
    return {
      callId,
      tool,
      args: args && typeof args === "object" && !Array.isArray(args)
        ? args as Record<string, unknown>
        : {},
      result,
      status: hasError ? "error" : "done",
    };
  });
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function stripRepeatedAssistantPrefix(value: string, previous: string) {
  const previousText = previous.trim();
  const candidate = value.trimStart();
  if (!previousText || !candidate.startsWith(previousText)) return value;
  return candidate.slice(previousText.length).trimStart();
}

function parseJSON(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function looksLikeToolJSON(value: string) {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}
