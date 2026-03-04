package auth

import (
	"context"
	"fmt"

	"google.golang.org/api/idtoken"
)

// GoogleUser holds info extracted from a verified Google ID token.
type GoogleUser struct {
	ID      string
	Email   string
	Name    string
	Picture string
}

// VerifyGoogleIDToken verifies the token with Google's public keys
// and extracts user info.
func VerifyGoogleIDToken(ctx context.Context, idTokenStr, clientID string) (*GoogleUser, error) {
	payload, err := idtoken.Validate(ctx, idTokenStr, clientID)
	if err != nil {
		return nil, fmt.Errorf("failed to verify Google ID token: %w", err)
	}

	sub, ok := payload.Claims["sub"].(string)
	if !ok || sub == "" {
		return nil, fmt.Errorf("missing sub claim in Google ID token")
	}

	email, _ := payload.Claims["email"].(string)
	name, _ := payload.Claims["name"].(string)
	picture, _ := payload.Claims["picture"].(string)

	return &GoogleUser{
		ID:      sub,
		Email:   email,
		Name:    name,
		Picture: picture,
	}, nil
}
