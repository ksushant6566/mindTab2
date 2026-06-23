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

func TestGoogleStartRedirectsWrongHostToCanonicalAPIHost(t *testing.T) {
	h := &AuthHandler{
		googleClientSecret: "google-secret",
		apiPublicURL:       "https://api.mindtab.in",
	}
	req := httptest.NewRequest(
		http.MethodGet,
		"https://app.mindtab.in/auth/google/start?return_to=https%3A%2F%2Fapp.mindtab.in%2Foauth%2Fgoogle%2Fcallback",
		nil,
	)
	rr := httptest.NewRecorder()

	h.GoogleStart(rr, req)

	if rr.Code != http.StatusFound {
		t.Fatalf("GoogleStart status = %d, want %d", rr.Code, http.StatusFound)
	}
	wantLocation := "https://api.mindtab.in/auth/google/start?return_to=https%3A%2F%2Fapp.mindtab.in%2Foauth%2Fgoogle%2Fcallback"
	if got := rr.Header().Get("Location"); got != wantLocation {
		t.Fatalf("Location = %q, want %q", got, wantLocation)
	}
	if got := rr.Header().Values("Set-Cookie"); len(got) != 0 {
		t.Fatalf("Set-Cookie headers = %v, want none before canonical redirect", got)
	}
}

func TestCanonicalGoogleOAuthStartURLNoRedirectOnAPIHost(t *testing.T) {
	h := &AuthHandler{apiPublicURL: "https://api.mindtab.in"}
	req := httptest.NewRequest(http.MethodGet, "https://api.mindtab.in/auth/google/start", nil)

	if got := h.canonicalGoogleOAuthStartURL(req); got != "" {
		t.Fatalf("canonicalGoogleOAuthStartURL() = %q, want empty", got)
	}
}
