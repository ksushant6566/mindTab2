package providers

import "log/slog"

// Chain tries providers in order, falling back on retriable errors.
type Chain[T any] struct {
	providers []namedProvider[T]
	logger    *slog.Logger
}

type namedProvider[T any] struct {
	name     string
	provider T
}

// NewChain creates a new provider chain.
func NewChain[T any](logger *slog.Logger) *Chain[T] {
	return &Chain[T]{logger: logger}
}

// Add appends a provider to the chain.
func (c *Chain[T]) Add(name string, provider T) {
	c.providers = append(c.providers, namedProvider[T]{name: name, provider: provider})
}

// Len returns the number of providers in the chain.
func (c *Chain[T]) Len() int {
	return len(c.providers)
}

// Execute tries each provider in order. fn receives the provider name and instance.
// On retriable errors, it falls back to the next provider.
// On permanent errors, it stops immediately.
// Returns AllProvidersExhaustedError if all providers fail with retriable errors.
func (c *Chain[T]) Execute(fn func(name string, provider T) error) error {
	var errs []error

	for i, np := range c.providers {
		err := fn(np.name, np.provider)
		if err == nil {
			return nil
		}

		if !IsRetriable(err) {
			return err
		}

		errs = append(errs, err)
		if i < len(c.providers)-1 {
			c.logger.Warn("provider failed, trying next",
				"provider", np.name,
				"error", err,
				"next", c.providers[i+1].name,
			)
		}
	}

	return &AllProvidersExhaustedError{Errors: errs}
}
