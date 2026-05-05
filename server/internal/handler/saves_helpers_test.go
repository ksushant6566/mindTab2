package handler

import (
	"fmt"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestIsYouTubeURL(t *testing.T) {
	tests := map[string]struct {
		url  string
		want bool
	}{
		"youtube.com/watch":           {url: "https://www.youtube.com/watch?v=abc123", want: true},
		"youtube.com/shorts":          {url: "https://www.youtube.com/shorts/abc123", want: true},
		"youtube.com/embed":           {url: "https://www.youtube.com/embed/abc123", want: true},
		"youtube.com/v":               {url: "https://www.youtube.com/v/abc123", want: true},
		"youtu.be short link":         {url: "https://youtu.be/abc123", want: true},
		"m.youtube.com":               {url: "https://m.youtube.com/watch?v=abc123", want: true},
		"youtube-nocookie.com":        {url: "https://www.youtube-nocookie.com/embed/abc123", want: true},
		"not youtube":                 {url: "https://example.com/article", want: false},
		"youtube.com root":            {url: "https://www.youtube.com/", want: false},
		"youtu.be root":               {url: "https://youtu.be/", want: false},
		"invalid url":                 {url: "not a url", want: false},
		"empty":                       {url: "", want: false},
		"youtube.com/channel (false)": {url: "https://www.youtube.com/channel/UCxyz", want: false},
	}

	for name, tc := range tests {
		t.Run(name, func(t *testing.T) {
			got := isYouTubeURL(tc.url)
			if got != tc.want {
				t.Errorf("isYouTubeURL(%q) = %v, want %v", tc.url, got, tc.want)
			}
		})
	}
}

func TestIsInstagramReelURL(t *testing.T) {
	tests := map[string]struct {
		url  string
		want bool
	}{
		"reel":              {url: "https://www.instagram.com/reel/C123abc/", want: true},
		"reels":             {url: "https://www.instagram.com/reels/C123abc/", want: true},
		"reel no slash":     {url: "https://instagram.com/reel/C123abc", want: true},
		"reel with query":   {url: "https://www.instagram.com/reel/C123abc/?igsh=abc", want: true},
		"mobile post":       {url: "https://m.instagram.com/p/C123abc/", want: false},
		"tv":                {url: "https://www.instagram.com/tv/C123abc/", want: true},
		"profile":           {url: "https://www.instagram.com/mindtab/", want: false},
		"stories":           {url: "https://www.instagram.com/stories/mindtab/123", want: false},
		"explore":           {url: "https://www.instagram.com/explore/tags/productivity/", want: false},
		"root":              {url: "https://www.instagram.com/", want: false},
		"not instagram":     {url: "https://example.com/reel/C123abc/", want: false},
		"spoofed host":      {url: "https://instagram.com.example.com/reel/C123abc/", want: false},
		"invalid":           {url: "not a url", want: false},
		"missing shortcode": {url: "https://www.instagram.com/reel/", want: false},
	}

	for name, tc := range tests {
		t.Run(name, func(t *testing.T) {
			got := isInstagramReelURL(tc.url)
			if got != tc.want {
				t.Errorf("isInstagramReelURL(%q) = %v, want %v", tc.url, got, tc.want)
			}
		})
	}
}

func TestImageExtFromMIME(t *testing.T) {
	tests := map[string]struct {
		mime string
		want string
	}{
		"jpeg":  {mime: "image/jpeg", want: ".jpg"},
		"png":   {mime: "image/png", want: ".png"},
		"webp":  {mime: "image/webp", want: ".webp"},
		"gif":   {mime: "image/gif", want: ""},
		"empty": {mime: "", want: ""},
	}

	for name, tc := range tests {
		t.Run(name, func(t *testing.T) {
			got := imageExtFromMIME(tc.mime)
			if got != tc.want {
				t.Errorf("imageExtFromMIME(%q) = %q, want %q", tc.mime, got, tc.want)
			}
		})
	}
}

func TestNullableStringSlice(t *testing.T) {
	t.Run("nil returns non-nil empty slice", func(t *testing.T) {
		got := nullableStringSlice(nil)
		if got == nil {
			t.Error("nullableStringSlice(nil) returned nil, want non-nil empty slice")
		}
		if len(got) != 0 {
			t.Errorf("nullableStringSlice(nil) has len %d, want 0", len(got))
		}
	})

	t.Run("non-nil passes through", func(t *testing.T) {
		input := []string{"a", "b", "c"}
		got := nullableStringSlice(input)
		if len(got) != len(input) {
			t.Errorf("nullableStringSlice(%v) has len %d, want %d", input, len(got), len(input))
		}
		for i, v := range input {
			if got[i] != v {
				t.Errorf("nullableStringSlice(%v)[%d] = %q, want %q", input, i, got[i], v)
			}
		}
	})
}

func TestSignAndVerifyMediaURL(t *testing.T) {
	h := &SavesHandler{jwtSecret: "test-secret-key"}
	key := "user-123/image-abc.jpg"
	ttl := 1 * time.Hour

	t.Run("signMediaURL returns non-empty string containing key", func(t *testing.T) {
		signed := h.signMediaURL(key, ttl)
		if signed == "" {
			t.Fatal("signMediaURL returned empty string")
		}
		if !strings.Contains(signed, key) {
			t.Errorf("signMediaURL result %q does not contain key %q", signed, key)
		}
	})

	t.Run("valid signature verifies correctly", func(t *testing.T) {
		signed := h.signMediaURL(key, ttl)

		// Parse the signed URL to extract sig and exp.
		parsed, err := url.Parse(signed)
		if err != nil {
			t.Fatalf("failed to parse signed URL: %v", err)
		}
		sig := parsed.Query().Get("sig")
		expStr := parsed.Query().Get("exp")

		var exp int64
		if _, err := fmt.Sscanf(expStr, "%d", &exp); err != nil {
			t.Fatalf("failed to parse exp %q: %v", expStr, err)
		}

		if !h.verifyMediaSignature(key, sig, exp) {
			t.Error("verifyMediaSignature returned false for a valid signature")
		}
	})

	t.Run("tampered signature returns false", func(t *testing.T) {
		signed := h.signMediaURL(key, ttl)

		parsed, err := url.Parse(signed)
		if err != nil {
			t.Fatalf("failed to parse signed URL: %v", err)
		}
		expStr := parsed.Query().Get("exp")

		var exp int64
		fmt.Sscanf(expStr, "%d", &exp)

		tamperedSig := "tampered-invalid-signature"
		if h.verifyMediaSignature(key, tamperedSig, exp) {
			t.Error("verifyMediaSignature returned true for a tampered signature")
		}
	})

	t.Run("expired timestamp returns false", func(t *testing.T) {
		signed := h.signMediaURL(key, ttl)

		parsed, err := url.Parse(signed)
		if err != nil {
			t.Fatalf("failed to parse signed URL: %v", err)
		}
		sig := parsed.Query().Get("sig")

		// exp = 0 is always in the past.
		if h.verifyMediaSignature(key, sig, 0) {
			t.Error("verifyMediaSignature returned true for an expired timestamp (exp=0)")
		}
	})
}
