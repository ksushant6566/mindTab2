package services

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/ksushant6566/mindtab/server/internal/providers"
)

func TestXPostIDFromURL(t *testing.T) {
	tests := map[string]struct {
		rawURL string
		want   string
		ok     bool
	}{
		"x.com status":       {rawURL: "https://x.com/mindtab/status/1234567890", want: "1234567890", ok: true},
		"twitter.com status": {rawURL: "https://twitter.com/mindtab/status/1234567890?s=20", want: "1234567890", ok: true},
		"mobile twitter":     {rawURL: "https://mobile.twitter.com/mindtab/status/1234567890", want: "1234567890", ok: true},
		"unsupported host":   {rawURL: "https://example.com/mindtab/status/123", ok: false},
		"missing status id":  {rawURL: "https://x.com/mindtab", ok: false},
		"empty status id":    {rawURL: "https://x.com/mindtab/status/", ok: false},
	}

	for name, tc := range tests {
		t.Run(name, func(t *testing.T) {
			got, err := XPostIDFromURL(tc.rawURL)
			if tc.ok && err != nil {
				t.Fatalf("XPostIDFromURL() error = %v", err)
			}
			if !tc.ok && err == nil {
				t.Fatal("XPostIDFromURL() error = nil, want error")
			}
			if got != tc.want {
				t.Fatalf("XPostIDFromURL() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestXClientFetchPost(t *testing.T) {
	var sawRequest bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawRequest = true
		if r.URL.Path != "/tweets/1234567890" {
			t.Fatalf("path = %q, want /tweets/1234567890", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Fatalf("authorization = %q, want bearer token", r.Header.Get("Authorization"))
		}
		query := r.URL.Query()
		if !strings.Contains(query.Get("expansions"), "author_id") {
			t.Fatalf("expansions = %q, want author expansion", query.Get("expansions"))
		}
		if !strings.Contains(query.Get("media.fields"), "alt_text") {
			t.Fatalf("media.fields = %q, want alt_text", query.Get("media.fields"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"data": {
				"id": "1234567890",
				"text": "short text",
				"note_tweet": {"text": "long form post text"},
				"author_id": "42",
				"conversation_id": "1234567890",
				"lang": "en",
				"created_at": "2026-05-10T18:26:37Z",
				"public_metrics": {
					"retweet_count": 2,
					"reply_count": 3,
					"like_count": 5,
					"quote_count": 7,
					"bookmark_count": 11,
					"impression_count": 13
				},
				"attachments": {"media_keys": ["3_abc"]},
				"referenced_tweets": [{"type": "quoted", "id": "999"}]
			},
			"includes": {
				"users": [
					{"id": "42", "name": "MindTab", "username": "mindtab"},
					{"id": "77", "name": "Quoted", "username": "quoted_user"}
				],
				"media": [
					{"media_key": "3_abc", "type": "photo", "url": "https://pbs.twimg.com/media/abc.jpg", "alt_text": "screenshot", "width": 1200, "height": 800}
				],
				"tweets": [
					{"id": "999", "text": "quoted post", "author_id": "77"}
				]
			}
		}`))
	}))
	defer server.Close()

	client := NewXClient("test-token")
	client.SetBaseURL(server.URL)

	got, err := client.FetchPost(context.Background(), "https://x.com/mindtab/status/1234567890")
	if err != nil {
		t.Fatalf("FetchPost() error = %v", err)
	}
	if !sawRequest {
		t.Fatal("server did not receive request")
	}
	if got.ID != "1234567890" {
		t.Fatalf("ID = %q, want 1234567890", got.ID)
	}
	if got.URL != "https://x.com/mindtab/status/1234567890" {
		t.Fatalf("URL = %q, want canonical x URL", got.URL)
	}
	if got.Text != "long form post text" {
		t.Fatalf("Text = %q, want note_tweet text", got.Text)
	}
	if got.AuthorUsername != "mindtab" || got.AuthorName != "MindTab" {
		t.Fatalf("author = %q/%q, want MindTab/mindtab", got.AuthorName, got.AuthorUsername)
	}
	if got.CreatedAt != time.Date(2026, 5, 10, 18, 26, 37, 0, time.UTC) {
		t.Fatalf("CreatedAt = %v, want parsed time", got.CreatedAt)
	}
	if got.PublicMetrics.LikeCount != 5 || got.PublicMetrics.ImpressionCount != 13 {
		t.Fatalf("metrics = %#v, want parsed metrics", got.PublicMetrics)
	}
	if len(got.Media) != 1 || got.Media[0].AltText != "screenshot" {
		t.Fatalf("media = %#v, want parsed media", got.Media)
	}
	if len(got.ReferencedTweets) != 1 || got.ReferencedTweets[0].AuthorUsername != "quoted_user" {
		t.Fatalf("referenced tweets = %#v, want quoted author", got.ReferencedTweets)
	}
}

func TestXClientFetchPostRequiresBearerToken(t *testing.T) {
	client := NewXClient("")
	if _, err := client.FetchPost(context.Background(), "https://x.com/mindtab/status/123"); err == nil {
		t.Fatal("FetchPost() error = nil, want missing token error")
	}
}

func TestXClientFetchPostClassifiesHTTPStatusErrors(t *testing.T) {
	tests := map[string]struct {
		status    int
		retriable bool
	}{
		"bad request is permanent":  {status: http.StatusBadRequest, retriable: false},
		"unauthorized is permanent": {status: http.StatusUnauthorized, retriable: false},
		"forbidden is permanent":    {status: http.StatusForbidden, retriable: false},
		"not found is permanent":    {status: http.StatusNotFound, retriable: false},
		"rate limit is retriable":   {status: http.StatusTooManyRequests, retriable: true},
		"server error is retriable": {status: http.StatusInternalServerError, retriable: true},
		"bad gateway is retriable":  {status: http.StatusBadGateway, retriable: true},
		"unavailable is retriable":  {status: http.StatusServiceUnavailable, retriable: true},
	}

	for name, tc := range tests {
		t.Run(name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(`{"error":"upstream"}`))
			}))
			defer server.Close()

			client := NewXClient("test-token")
			client.SetBaseURL(server.URL)

			_, err := client.FetchPost(context.Background(), "https://x.com/mindtab/status/123")
			assertProviderError(t, err, "x", tc.retriable)
		})
	}
}

func TestXClientFetchPostClassifiesRequestErrorsRetriable(t *testing.T) {
	client := NewXClient("test-token")
	client.SetHTTPClient(&http.Client{Transport: failingRoundTripper{err: temporaryRequestError{}}})

	_, err := client.FetchPost(context.Background(), "https://x.com/mindtab/status/123")
	assertProviderError(t, err, "x", true)
}

func assertProviderError(t *testing.T, err error, provider string, retriable bool) {
	t.Helper()
	var providerErr *providers.ProviderError
	if !errors.As(err, &providerErr) {
		t.Fatalf("error = %v, want *providers.ProviderError", err)
	}
	if providerErr.Provider != provider {
		t.Fatalf("provider = %q, want %q", providerErr.Provider, provider)
	}
	if providerErr.Retriable != retriable {
		t.Fatalf("Retriable = %v, want %v", providerErr.Retriable, retriable)
	}
}

type failingRoundTripper struct {
	err error
}

func (f failingRoundTripper) RoundTrip(*http.Request) (*http.Response, error) {
	return nil, f.err
}

type temporaryRequestError struct{}

func (temporaryRequestError) Error() string {
	return "temporary network timeout"
}

func (temporaryRequestError) Timeout() bool {
	return true
}

func (temporaryRequestError) Temporary() bool {
	return true
}
