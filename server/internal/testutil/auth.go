package testutil

import (
	"context"
	"net/http"

	"github.com/ksushant6566/mindtab/server/internal/middleware"
)

// WithUserID injects a user ID into the context, bypassing auth middleware.
func WithUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, middleware.UserIDKey, userID)
}

// AuthenticatedRequest wraps an http.Request with a user ID in context.
func AuthenticatedRequest(r *http.Request, userID string) *http.Request {
	return r.WithContext(WithUserID(r.Context(), userID))
}
