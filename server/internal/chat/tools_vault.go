package chat

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/search"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

// ---------------------------------------------------------------------------
// SearchVaultTool
// ---------------------------------------------------------------------------

// SearchVaultArgs holds arguments for SearchVaultTool.
type SearchVaultArgs struct {
	Query string `json:"query" validate:"required,min=1"`
	Limit *int   `json:"limit" validate:"omitempty,min=1,max=50"`
}

// SearchVaultTool performs semantic search over saved vault content.
type SearchVaultTool struct {
	queries store.Querier
	search  *search.SemanticSearch
}

// NewSearchVaultTool returns a new SearchVaultTool.
func NewSearchVaultTool(queries store.Querier, search *search.SemanticSearch) *SearchVaultTool {
	return &SearchVaultTool{queries: queries, search: search}
}

func (t *SearchVaultTool) Name() string { return "search_vault" }

func (t *SearchVaultTool) Description() string {
	return "Semantic search over saved content (vault/saves). Returns items ranked by relevance."
}

func (t *SearchVaultTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"query": jsonSchema("string", nil, "Search query text"),
			"limit": jsonSchema("integer", nil, "Max number of results (default 10)"),
		}, []string{"query"}),
	}
}

func (t *SearchVaultTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args SearchVaultArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse search_vault args: %w", err)
	}
	return &args, nil
}

func (t *SearchVaultTool) Execute(ctx context.Context, userID string, argsAny any) (any, error) {
	if t.search == nil {
		return nil, fmt.Errorf("vault search is not available")
	}

	args := argsAny.(*SearchVaultArgs)

	limit := 10
	if args.Limit != nil && *args.Limit > 0 {
		limit = *args.Limit
	}

	results, err := t.search.Search(ctx, userID, args.Query, limit)
	if err != nil {
		return nil, fmt.Errorf("search vault: %w", err)
	}

	type resultItem struct {
		ID         string  `json:"id"`
		Title      string  `json:"title"`
		Summary    string  `json:"summary"`
		Similarity float64 `json:"similarity"`
	}

	items := make([]resultItem, 0, len(results))
	for _, sr := range results {
		title := ""
		if sr.SourceTitle != nil {
			title = *sr.SourceTitle
		}
		summary := ""
		if sr.Summary != nil {
			summary = *sr.Summary
		}
		items = append(items, resultItem{
			ID:         sr.ID.String(),
			Title:      title,
			Summary:    summary,
			Similarity: sr.Similarity,
		})
	}

	return map[string]interface{}{"results": items}, nil
}

// ---------------------------------------------------------------------------
// GetVaultItemTool
// ---------------------------------------------------------------------------

// GetVaultItemArgs holds arguments for GetVaultItemTool.
type GetVaultItemArgs struct {
	ID string `json:"id" validate:"required,uuid"`
}

// GetVaultItemTool retrieves full details of a vault item by ID.
type GetVaultItemTool struct {
	queries store.Querier
}

// NewGetVaultItemTool returns a new GetVaultItemTool.
func NewGetVaultItemTool(queries store.Querier) *GetVaultItemTool {
	return &GetVaultItemTool{queries: queries}
}

func (t *GetVaultItemTool) Name() string { return "get_vault_item" }

func (t *GetVaultItemTool) Description() string {
	return "Get full details of a saved vault item by ID."
}

func (t *GetVaultItemTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"id": jsonSchema("string", nil, "Vault item UUID"),
		}, []string{"id"}),
	}
}

func (t *GetVaultItemTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args GetVaultItemArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse get_vault_item args: %w", err)
	}
	return &args, nil
}

func (t *GetVaultItemTool) Execute(ctx context.Context, userID string, argsAny any) (any, error) {
	args := argsAny.(*GetVaultItemArgs)

	itemUUID, err := uuid.Parse(args.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid vault item id: %w", err)
	}

	content, err := t.queries.GetContentByID(ctx, store.GetContentByIDParams{
		ID:     pgtype.UUID{Bytes: itemUUID, Valid: true},
		UserID: userID,
	})
	if err != nil {
		return nil, fmt.Errorf("get vault item: %w", err)
	}

	// Build a clean content string from available text
	bodyText := pgtextToString(content.Summary)
	if bodyText == "" {
		bodyText = pgtextToString(content.ExtractedText)
	}

	return map[string]interface{}{
		"id":      uuidToString(content.ID),
		"title":   pgtextToString(content.SourceTitle),
		"summary": pgtextToString(content.Summary),
		"tags":    content.Tags,
		"content": bodyText,
	}, nil
}
