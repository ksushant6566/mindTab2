package providers

import (
	"errors"
	"fmt"
	"testing"
)

func TestIsRetriableHandlesWrappedProviderErrors(t *testing.T) {
	base := errors.New("rate limited")
	err := fmt.Errorf("fetch post: %w", NewRetriableError("x", base))

	if !IsRetriable(err) {
		t.Fatal("IsRetriable() = false, want true for wrapped retriable provider error")
	}
}
