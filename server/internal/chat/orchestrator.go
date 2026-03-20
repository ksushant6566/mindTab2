package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

const systemPrompt = "You are MindTab, a personal productivity assistant. You have access to the user's goals, habits, journals, projects, and saved vault items. Be concise and helpful. When the user asks you to do something, use the available tools to take action. When reporting results, be conversational — don't dump raw data."

const maxToolIterations = 5

// WSServerMessage is the JSON envelope sent from server to client over WebSocket.
type WSServerMessage struct {
	Type           string      `json:"type"`
	ConversationID string      `json:"conversation_id,omitempty"`
	MessageID      string      `json:"message_id,omitempty"`
	Content        string      `json:"content,omitempty"`
	Tool           string      `json:"tool,omitempty"`
	Args           interface{} `json:"args,omitempty"`
	Result         interface{} `json:"result,omitempty"`
	Title          string      `json:"title,omitempty"`
	Code           string      `json:"code,omitempty"`
	Message        string      `json:"message,omitempty"`
}

// WSClientMessage is the JSON envelope received from client over WebSocket.
type WSClientMessage struct {
	Type           string   `json:"type"`
	ConversationID *string  `json:"conversation_id,omitempty"`
	Content        string   `json:"content,omitempty"`
	Attachments    []string `json:"attachments,omitempty"`
}

// Orchestrator coordinates chat interactions between the client, LLM, and tools.
type Orchestrator struct {
	queries  store.Querier
	llmChain *providers.Chain[llm.LLMProvider]
	registry *Registry
}

// NewOrchestrator creates a new Orchestrator.
func NewOrchestrator(queries store.Querier, llmChain *providers.Chain[llm.LLMProvider], registry *Registry) *Orchestrator {
	return &Orchestrator{
		queries:  queries,
		llmChain: llmChain,
		registry: registry,
	}
}

// HandleMessage processes an incoming user message through the full chat pipeline.
func (o *Orchestrator) HandleMessage(ctx context.Context, userID string, msg WSClientMessage, writeChan chan<- WSServerMessage) {
	if o.llmChain == nil {
		writeChan <- WSServerMessage{
			Type:    "error",
			Code:    "not_configured",
			Message: "Chat is not available — LLM providers are not configured.",
		}
		return
	}

	// 1. Resolve or create conversation
	var conversationID pgtype.UUID
	isNewConversation := false

	if msg.ConversationID != nil && *msg.ConversationID != "" {
		parsed, err := uuid.Parse(*msg.ConversationID)
		if err != nil {
			writeChan <- WSServerMessage{
				Type:    "error",
				Code:    "invalid_conversation_id",
				Message: "Invalid conversation ID.",
			}
			return
		}
		conversationID = pgtype.UUID{Bytes: parsed, Valid: true}
	} else {
		conv, err := o.queries.CreateConversation(ctx, userID)
		if err != nil {
			slog.Error("failed to create conversation", "error", err, "userID", userID)
			writeChan <- WSServerMessage{
				Type:    "error",
				Code:    "db_error",
				Message: "Failed to create conversation.",
			}
			return
		}
		conversationID = conv.ID
		isNewConversation = true
	}

	convIDStr := uuidToString(conversationID)

	// 2. Save user message
	attachmentsJSON, _ := json.Marshal(msg.Attachments)
	if msg.Attachments == nil {
		attachmentsJSON = nil
	}

	_, err := o.queries.CreateMessage(ctx, store.CreateMessageParams{
		ConversationID: conversationID,
		Role:           "user",
		Content:        msg.Content,
		Attachments:    attachmentsJSON,
	})
	if err != nil {
		slog.Error("failed to save user message", "error", err, "conversationID", convIDStr)
		writeChan <- WSServerMessage{
			Type:    "error",
			Code:    "db_error",
			Message: "Failed to save message.",
		}
		return
	}

	// 3. Load conversation history
	history, err := o.queries.ListMessages(ctx, store.ListMessagesParams{
		ConversationID: conversationID,
		Limit:          50,
		Offset:         0,
	})
	if err != nil {
		slog.Error("failed to load conversation history", "error", err, "conversationID", convIDStr)
		writeChan <- WSServerMessage{
			Type:    "error",
			Code:    "db_error",
			Message: "Failed to load conversation history.",
		}
		return
	}

	// 4. Build user prompt from history
	userPrompt := buildConversationPrompt(history)

	// 5. Send stream.start
	assistantMsgID := uuid.New().String()
	writeChan <- WSServerMessage{
		Type:           "stream.start",
		ConversationID: convIDStr,
		MessageID:      assistantMsgID,
	}

	// 6. LLM streaming loop with tool call support
	fullResponse, err := o.streamWithTools(ctx, userPrompt, history, writeChan, userID, conversationID)
	if err != nil {
		slog.Error("LLM stream failed", "error", err, "conversationID", convIDStr)
		writeChan <- WSServerMessage{
			Type:    "error",
			Code:    "llm_error",
			Message: fmt.Sprintf("LLM error: %v", err),
		}
		return
	}

	// 7. Save assistant message
	savedMsg, err := o.queries.CreateMessage(ctx, store.CreateMessageParams{
		ConversationID: conversationID,
		Role:           "assistant",
		Content:        fullResponse,
	})
	if err != nil {
		slog.Error("failed to save assistant message", "error", err, "conversationID", convIDStr)
	}

	// 8. Send stream.end
	msgID := assistantMsgID
	if savedMsg.ID.Valid {
		msgID = uuidToString(savedMsg.ID)
	}
	writeChan <- WSServerMessage{
		Type:           "stream.end",
		ConversationID: convIDStr,
		MessageID:      msgID,
	}

	// 9. Generate title for new conversations
	if isNewConversation {
		o.generateTitle(ctx, userID, conversationID, msg.Content, writeChan)
	}

	// 10. Touch conversation updated_at
	if err := o.queries.TouchConversation(ctx, conversationID); err != nil {
		slog.Error("failed to touch conversation", "error", err, "conversationID", convIDStr)
	}
}

// streamWithTools runs the LLM with streaming and handles tool call loops.
func (o *Orchestrator) streamWithTools(
	ctx context.Context,
	userPrompt string,
	history []store.MindmapMessage,
	writeChan chan<- WSServerMessage,
	userID string,
	conversationID pgtype.UUID,
) (string, error) {
	toolDefs := o.registry.Definitions()
	var fullText strings.Builder

	// We may need to re-call the LLM after tool executions.
	// Keep an accumulated prompt that includes tool results.
	currentPrompt := userPrompt

	for iteration := 0; iteration <= maxToolIterations; iteration++ {
		var pendingToolCalls []llm.ToolCall
		var iterText strings.Builder

		req := llm.LLMRequest{
			SystemPrompt: systemPrompt,
			UserPrompt:   currentPrompt,
			MaxTokens:    4096,
			Temperature:  0.7,
		}

		streamErr := o.llmChain.Execute(func(name string, provider llm.LLMProvider) error {
			return provider.StreamComplete(ctx, req, toolDefs, func(delta llm.StreamDelta) error {
				if delta.Content != "" {
					iterText.WriteString(delta.Content)
					writeChan <- WSServerMessage{
						Type:    "stream.delta",
						Content: delta.Content,
					}
				}
				if len(delta.ToolCalls) > 0 {
					pendingToolCalls = append(pendingToolCalls, delta.ToolCalls...)
					for _, tc := range delta.ToolCalls {
						var argsData interface{}
						_ = json.Unmarshal([]byte(tc.Arguments), &argsData)
						writeChan <- WSServerMessage{
							Type: "stream.tool_call",
							Tool: tc.Name,
							Args: argsData,
						}
					}
				}
				return nil
			})
		})

		if streamErr != nil {
			return fullText.String(), fmt.Errorf("stream: %w", streamErr)
		}

		fullText.WriteString(iterText.String())

		// No tool calls — we're done
		if len(pendingToolCalls) == 0 {
			break
		}

		// Execute each tool call and build follow-up prompt
		var toolResultParts []string
		for _, tc := range pendingToolCalls {
			result, execErr := o.registry.Execute(ctx, userID, tc.Name, tc.Arguments)

			// Send tool result to client
			if execErr != nil {
				writeChan <- WSServerMessage{
					Type:   "stream.tool_result",
					Tool:   tc.Name,
					Result: map[string]string{"error": execErr.Error()},
				}
				toolResultParts = append(toolResultParts,
					fmt.Sprintf("[Tool %s error: %v]", tc.Name, execErr))
			} else {
				writeChan <- WSServerMessage{
					Type:   "stream.tool_result",
					Tool:   tc.Name,
					Result: result,
				}
				resultJSON, _ := json.Marshal(result)
				toolResultParts = append(toolResultParts,
					fmt.Sprintf("[Tool %s result: %s]", tc.Name, string(resultJSON)))
			}

			// Save tool call message to DB
			toolCallJSON, _ := json.Marshal([]llm.ToolCall{tc})
			o.queries.CreateMessage(ctx, store.CreateMessageParams{
				ConversationID: conversationID,
				Role:           "assistant",
				Content:        iterText.String(),
				ToolCalls:      toolCallJSON,
			})

			// Save tool result message to DB
			resultContent := ""
			if execErr != nil {
				resultContent = fmt.Sprintf("Error: %v", execErr)
			} else {
				rb, _ := json.Marshal(result)
				resultContent = string(rb)
			}
			o.queries.CreateMessage(ctx, store.CreateMessageParams{
				ConversationID: conversationID,
				Role:           "tool",
				Content:        resultContent,
				ToolCallID:     pgtype.Text{String: tc.ID, Valid: tc.ID != ""},
			})
		}

		// Append tool results to prompt for next iteration
		currentPrompt = currentPrompt + "\n\nAssistant used tools. Results:\n" + strings.Join(toolResultParts, "\n") + "\n\nPlease respond to the user based on the tool results."
	}

	return fullText.String(), nil
}

// generateTitle creates a conversation title from the first user message.
func (o *Orchestrator) generateTitle(
	ctx context.Context,
	userID string,
	conversationID pgtype.UUID,
	firstMessage string,
	writeChan chan<- WSServerMessage,
) {
	convIDStr := uuidToString(conversationID)

	titleReq := llm.LLMRequest{
		SystemPrompt: "Generate a short title (3-6 words) for this conversation based on the user's first message. Return only the title, nothing else.",
		UserPrompt:   firstMessage,
		MaxTokens:    50,
		Temperature:  0.5,
	}

	var title string
	err := o.llmChain.Execute(func(name string, provider llm.LLMProvider) error {
		resp, err := provider.Complete(ctx, titleReq)
		if err != nil {
			return err
		}
		title = strings.TrimSpace(resp.Text)
		return nil
	})

	if err != nil {
		slog.Error("failed to generate conversation title", "error", err, "conversationID", convIDStr)
		return
	}

	// Update title in DB
	if err := o.queries.UpdateConversationTitle(ctx, store.UpdateConversationTitleParams{
		ID:     conversationID,
		UserID: userID,
		Title:  pgtype.Text{String: title, Valid: true},
	}); err != nil {
		slog.Error("failed to update conversation title", "error", err, "conversationID", convIDStr)
		return
	}

	// Notify client
	writeChan <- WSServerMessage{
		Type:           "conversation.title",
		ConversationID: convIDStr,
		Title:          title,
	}
}

// buildConversationPrompt converts DB message history into a single text prompt
// suitable for the LLM. This flattens multi-turn history into a readable format.
func buildConversationPrompt(messages []store.MindmapMessage) string {
	if len(messages) == 0 {
		return ""
	}

	var b strings.Builder
	for _, msg := range messages {
		switch msg.Role {
		case "user":
			b.WriteString("User: ")
			b.WriteString(msg.Content)
			b.WriteString("\n\n")
		case "assistant":
			b.WriteString("Assistant: ")
			b.WriteString(msg.Content)
			b.WriteString("\n\n")
		case "tool":
			b.WriteString("Tool result: ")
			b.WriteString(msg.Content)
			b.WriteString("\n\n")
		}
	}
	return strings.TrimSpace(b.String())
}
