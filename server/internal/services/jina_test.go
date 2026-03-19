package services

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestJinaReader_Extract(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Error("missing auth header")
		}
		if r.Header.Get("Accept") != "text/markdown" {
			t.Error("missing accept header")
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("# Test Article\n\nThis is the content."))
	}))
	defer server.Close()

	client := NewJinaReader("test-key")
	client.baseURL = server.URL

	result, err := client.Extract(context.Background(), "https://example.com/article")
	if err != nil {
		t.Fatalf("extract: %v", err)
	}

	if result == "" {
		t.Fatal("expected non-empty result")
	}
}

func TestJinaReader_ExtractError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("internal error"))
	}))
	defer server.Close()

	client := NewJinaReader("test-key")
	client.baseURL = server.URL

	_, err := client.Extract(context.Background(), "https://example.com/article")
	if err == nil {
		t.Fatal("expected error on 500")
	}
}
