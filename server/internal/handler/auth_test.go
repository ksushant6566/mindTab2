package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestValidateOAuthReturnTo(t *testing.T) {
	h := &AuthHandler{allowedOrigins: []string{
		"https://app.mindtab.in",
		"http://localhost:5173",
	}}

	tests := map[string]struct {
		raw     string
		wantErr bool
	}{
		"production callback": {
			raw: "https://app.mindtab.in/oauth/google/callback",
		},
		"localhost callback": {
			raw: "http://localhost:5173/oauth/google/callback",
		},
		"api callback path is not a web return URL": {
			raw:     "https://app.mindtab.in/auth/google/callback",
			wantErr: true,
		},
		"unallowed origin": {
			raw:     "https://evil.example/oauth/google/callback",
			wantErr: true,
		},
		"relative URL": {
			raw:     "/oauth/google/callback",
			wantErr: true,
		},
	}

	for name, tc := range tests {
		t.Run(name, func(t *testing.T) {
			_, err := h.validateOAuthReturnTo(tc.raw)
			if (err != nil) != tc.wantErr {
				t.Fatalf("validateOAuthReturnTo(%q) error = %v, wantErr %v", tc.raw, err, tc.wantErr)
			}
		})
	}
}

func TestPublicURLForRequestUsesForwardedHeaders(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "http://internal:8080/auth/google/start", nil)
	req.Header.Set("X-Forwarded-Proto", "https")
	req.Header.Set("X-Forwarded-Host", "api.mindtab.in")

	got := publicURLForRequest(req, googleOAuthCallbackPath)
	want := "https://api.mindtab.in/auth/google/callback"
	if got != want {
		t.Fatalf("publicURLForRequest() = %q, want %q", got, want)
	}
}

func TestGoogleOAuthCallbackURLPrefersPublicAPIURL(t *testing.T) {
	h := &AuthHandler{apiPublicURL: "http://localhost:8080"}
	req := httptest.NewRequest(http.MethodGet, "http://api:8080/auth/google/start", nil)

	got := h.googleOAuthCallbackURL(req)
	want := "http://localhost:8080/auth/google/callback"
	if got != want {
		t.Fatalf("googleOAuthCallbackURL() = %q, want %q", got, want)
	}
}
