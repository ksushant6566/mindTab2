package providers

import "fmt"

// ProviderError wraps an error with provider context and retriability.
type ProviderError struct {
	Provider  string
	Err       error
	Retriable bool
}

func (e *ProviderError) Error() string {
	return fmt.Sprintf("provider %s: %v", e.Provider, e.Err)
}

func (e *ProviderError) Unwrap() error {
	return e.Err
}

// NewRetriableError creates a retriable provider error (timeout, rate limit, 5xx).
func NewRetriableError(provider string, err error) *ProviderError {
	return &ProviderError{Provider: provider, Err: err, Retriable: true}
}

// NewPermanentError creates a permanent provider error (auth failure, invalid input).
func NewPermanentError(provider string, err error) *ProviderError {
	return &ProviderError{Provider: provider, Err: err, Retriable: false}
}

// IsRetriable checks if an error is a retriable provider error.
func IsRetriable(err error) bool {
	if pe, ok := err.(*ProviderError); ok {
		return pe.Retriable
	}
	return false
}

// AllProvidersExhaustedError is returned when all providers in a chain have failed.
type AllProvidersExhaustedError struct {
	Errors []error
}

func (e *AllProvidersExhaustedError) Error() string {
	return fmt.Sprintf("all providers exhausted (%d failures)", len(e.Errors))
}
