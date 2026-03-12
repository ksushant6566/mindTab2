package providers

import (
	"errors"
	"log/slog"
	"testing"
)

type mockProvider struct {
	name string
	err  error
}

func (m *mockProvider) Name() string { return m.name }

func TestChain_FirstProviderSucceeds(t *testing.T) {
	called := []string{}
	chain := NewChain[*mockProvider](slog.Default())
	chain.Add("primary", &mockProvider{name: "primary"})
	chain.Add("fallback", &mockProvider{name: "fallback"})

	err := chain.Execute(func(name string, _ *mockProvider) error {
		called = append(called, name)
		return nil
	})

	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if len(called) != 1 || called[0] != "primary" {
		t.Fatalf("expected only primary called, got %v", called)
	}
}

func TestChain_FallbackOnRetriableError(t *testing.T) {
	called := []string{}
	chain := NewChain[*mockProvider](slog.Default())
	chain.Add("primary", &mockProvider{name: "primary"})
	chain.Add("fallback", &mockProvider{name: "fallback"})

	err := chain.Execute(func(name string, _ *mockProvider) error {
		called = append(called, name)
		if name == "primary" {
			return NewRetriableError("primary", errors.New("timeout"))
		}
		return nil
	})

	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if len(called) != 2 {
		t.Fatalf("expected 2 calls, got %v", called)
	}
}

func TestChain_StopsOnPermanentError(t *testing.T) {
	chain := NewChain[*mockProvider](slog.Default())
	chain.Add("primary", &mockProvider{name: "primary"})
	chain.Add("fallback", &mockProvider{name: "fallback"})

	err := chain.Execute(func(name string, _ *mockProvider) error {
		return NewPermanentError("primary", errors.New("invalid api key"))
	})

	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestChain_AllExhausted(t *testing.T) {
	chain := NewChain[*mockProvider](slog.Default())
	chain.Add("p1", &mockProvider{name: "p1"})
	chain.Add("p2", &mockProvider{name: "p2"})

	err := chain.Execute(func(name string, _ *mockProvider) error {
		return NewRetriableError(name, errors.New("fail"))
	})

	if err == nil {
		t.Fatal("expected error, got nil")
	}
	var exhausted *AllProvidersExhaustedError
	if !errors.As(err, &exhausted) {
		t.Fatalf("expected AllProvidersExhaustedError, got %T", err)
	}
}
