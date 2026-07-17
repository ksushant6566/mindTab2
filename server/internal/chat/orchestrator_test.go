package chat

import "testing"

func TestRepeatedPrefixSuppressor(t *testing.T) {
	tests := []struct {
		name   string
		prefix string
		chunks []string
		want   string
	}{
		{
			name:   "passes through a new continuation",
			prefix: "I will check your workspace.",
			chunks: []string{"The results show progress."},
			want:   "The results show progress.",
		},
		{
			name:   "suppresses a repeated prefix across chunks",
			prefix: "I will check your workspace.",
			chunks: []string{"I will check ", "your workspace.", " The results show progress."},
			want:   " The results show progress.",
		},
		{
			name:   "suppresses leading whitespace with a repeated prefix",
			prefix: "I will check your workspace.",
			chunks: []string{"\n\nI will check your workspace. Here is what I found."},
			want:   " Here is what I found.",
		},
		{
			name:   "flushes an incomplete potential match",
			prefix: "I will check your workspace.",
			chunks: []string{"I will check"},
			want:   "I will check",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			suppressor := newRepeatedPrefixSuppressor(test.prefix)
			var got string
			for _, chunk := range test.chunks {
				got += suppressor.Write(chunk)
			}
			got += suppressor.Flush()
			if got != test.want {
				t.Fatalf("got %q, want %q", got, test.want)
			}
		})
	}
}
