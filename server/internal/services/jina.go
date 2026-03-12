package services

import (
	"context"
	"fmt"
	"io"
	"net/http"
)

// JinaReader fetches article content via Jina Reader API.
type JinaReader struct {
	apiKey     string
	baseURL    string
	httpClient *http.Client
}

func NewJinaReader(apiKey string) *JinaReader {
	return &JinaReader{
		apiKey:     apiKey,
		baseURL:    "https://r.jina.ai",
		httpClient: &http.Client{},
	}
}

// Extract fetches the article content at the given URL and returns clean markdown.
func (j *JinaReader) Extract(ctx context.Context, articleURL string) (string, error) {
	reqURL := j.baseURL + "/" + articleURL

	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+j.apiKey)
	req.Header.Set("Accept", "text/markdown")

	resp, err := j.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("jina request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("jina: status %d: %s", resp.StatusCode, string(body))
	}

	return string(body), nil
}

// FallbackExtract does a plain HTTP GET as a backup when Jina fails.
func (j *JinaReader) FallbackExtract(ctx context.Context, articleURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", articleURL, nil)
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("User-Agent", "MindTab/1.0")

	resp, err := j.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("http get: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("http: status %d", resp.StatusCode)
	}

	return string(body), nil
}
