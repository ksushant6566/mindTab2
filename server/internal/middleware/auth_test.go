//go:build integration

package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/ksushant6566/mindtab/server/internal/middleware"
)

const testSecret = "test-jwt-secret"

// generateTestJWT creates a signed JWT for testing using the same claims
// structure that auth.ValidateAccessToken expects.
func generateTestJWT(secret, userID string, expiry time.Time) string {
	type testClaims struct {
		UserID string `json:"sub"`
		Email  string `json:"email"`
		jwt.RegisteredClaims
	}

	now := time.Now()
	claims := testClaims{
		UserID: userID,
		Email:  "test@example.com",
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiry),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		panic("generateTestJWT: failed to sign token: " + err.Error())
	}
	return signed
}

// echoUserIDHandler is a simple downstream handler that writes the user ID
// extracted from context so tests can assert it was propagated correctly.
func echoUserIDHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := middleware.UserIDFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(userID))
	})
}

func TestAuth_ValidJWT(t *testing.T) {
	const wantUserID = "user-abc-123"

	token := generateTestJWT(testSecret, wantUserID, time.Now().Add(15*time.Minute))

	handler := middleware.Auth(testSecret)(echoUserIDHandler())

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d (body: %s)", rec.Code, rec.Body.String())
	}

	gotUserID := rec.Body.String()
	if gotUserID != wantUserID {
		t.Errorf("expected userID %q in context, got %q", wantUserID, gotUserID)
	}
}

func TestAuth_ExpiredJWT(t *testing.T) {
	// Create a token that expired one hour ago.
	token := generateTestJWT(testSecret, "user-expired", time.Now().Add(-1*time.Hour))

	handler := middleware.Auth(testSecret)(echoUserIDHandler())

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401 for expired token, got %d", rec.Code)
	}
}

func TestAuth_MissingToken(t *testing.T) {
	handler := middleware.Auth(testSecret)(echoUserIDHandler())

	// No Authorization header set.
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401 for missing token, got %d", rec.Code)
	}
}
