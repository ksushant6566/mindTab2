package queue

import (
	"testing"
	"time"
)

func TestCalculateBackoff_Exponential(t *testing.T) {
	base := 30 * time.Second

	cases := []struct {
		attempt  int
		expected time.Duration
	}{
		{1, 30 * time.Second},
		{2, 60 * time.Second},
		{3, 120 * time.Second},
	}

	for _, tc := range cases {
		// CalculateBackoff applies jitter: result = base - base/4 + rand(0, base/2)
		// Without jitter the raw delay equals expected. With jitter the range is:
		// [expected*0.75, expected*1.25) — so we just verify the no-jitter base.
		// Run a bunch of samples and confirm the minimum is within reasonable bounds.
		const samples = 200
		min := time.Duration(1<<63 - 1)
		max := time.Duration(0)
		for i := 0; i < samples; i++ {
			got := CalculateBackoff(tc.attempt, base)
			if got < min {
				min = got
			}
			if got > max {
				max = got
			}
		}

		// The raw delay before jitter is tc.expected.
		// Jitter formula: delay = delay - delay/4 + rand(0, delay/2)
		//   min possible  = delay * 0.75
		//   max possible  = delay * 1.25 (exclusive, approaching)
		minExpected := time.Duration(float64(tc.expected) * 0.74)
		maxExpected := time.Duration(float64(tc.expected) * 1.26)

		if min < minExpected || max > maxExpected {
			t.Errorf("attempt %d: got range [%v, %v], want within [%v, %v]",
				tc.attempt, min, max, minExpected, maxExpected)
		}
	}
}

func TestCalculateBackoff_CappedAt10Min(t *testing.T) {
	base := 30 * time.Second
	cap := 10 * time.Minute

	const samples = 200
	for i := 0; i < samples; i++ {
		got := CalculateBackoff(20, base)
		// The raw delay is capped at 10 min before jitter is applied.
		// Jitter: result = cap - cap/4 + rand(0, cap/2) which is within [7.5m, 12.5m)
		// But since jitter uses the capped value, the maximum observed value is < cap*1.25.
		maxAllowed := time.Duration(float64(cap) * 1.26)
		if got > maxAllowed {
			t.Errorf("attempt 20: got %v, want <= %v", got, maxAllowed)
		}
		// Minimum after jitter is cap * 0.75 = 7.5 min
		minAllowed := time.Duration(float64(cap) * 0.74)
		if got < minAllowed {
			t.Errorf("attempt 20: got %v, want >= %v", got, minAllowed)
		}
	}
}

func TestCalculateBackoff_Jitter(t *testing.T) {
	base := 30 * time.Second

	results := make(map[time.Duration]struct{})
	for i := 0; i < 100; i++ {
		d := CalculateBackoff(3, base)
		results[d] = struct{}{}
	}

	// With 100 samples from a continuous distribution, we expect significant variety.
	// If jitter is working, we should see many distinct values. A single value means no jitter.
	if len(results) < 5 {
		t.Errorf("expected jitter to produce varied results; got only %d distinct values over 100 samples", len(results))
	}
}
