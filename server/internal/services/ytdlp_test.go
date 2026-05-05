package services

import (
	"testing"
)

func TestCleanVTT(t *testing.T) {
	t.Run("realistic VTT with timestamps, headers, sequence numbers, and HTML tags", func(t *testing.T) {
		input := `WEBVTT

1
00:00:01.000 --> 00:00:04.000
Hello, welcome to the video.

2
00:00:04.000 --> 00:00:08.000
<b>Today</b> we will learn about Go.

3
00:00:08.000 --> 00:00:12.000
Today we will learn about Go.
`
		want := "Hello, welcome to the video. Today we will learn about Go."
		got := cleanVTT(input)
		if got != want {
			t.Errorf("cleanVTT() = %q, want %q", got, want)
		}
	})

	t.Run("empty input returns empty output", func(t *testing.T) {
		got := cleanVTT("")
		if got != "" {
			t.Errorf("cleanVTT(\"\") = %q, want %q", got, "")
		}
	})

	t.Run("only headers and timestamps returns empty output", func(t *testing.T) {
		input := `WEBVTT

1
00:00:01.000 --> 00:00:05.000
`
		got := cleanVTT(input)
		if got != "" {
			t.Errorf("cleanVTT() = %q, want empty string", got)
		}
	})

	t.Run("duplicate consecutive lines are deduplicated", func(t *testing.T) {
		input := `WEBVTT

1
00:00:01.000 --> 00:00:04.000
Duplicate line.

2
00:00:04.000 --> 00:00:08.000
Duplicate line.

3
00:00:08.000 --> 00:00:12.000
Unique line.
`
		want := "Duplicate line. Unique line."
		got := cleanVTT(input)
		if got != want {
			t.Errorf("cleanVTT() = %q, want %q", got, want)
		}
	})
}

func TestStripHTMLTags(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "bold tag stripped",
			input: "<b>bold</b>",
			want:  "bold",
		},
		{
			name:  "no tags unchanged",
			input: "no tags",
			want:  "no tags",
		},
		{
			name:  "multiple tags stripped",
			input: "<i>italic</i> and <b>bold</b>",
			want:  "italic and bold",
		},
		{
			name:  "empty string returns empty string",
			input: "",
			want:  "",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := stripHTMLTags(tc.input)
			if got != tc.want {
				t.Errorf("stripHTMLTags(%q) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}

func TestDownloadFormat(t *testing.T) {
	got := DownloadFormat(360)
	want := "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best[height<=360]/best"
	if got != want {
		t.Fatalf("DownloadFormat(360) = %q, want %q", got, want)
	}
}
