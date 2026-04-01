package testutil

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
)

// JSONRequest builds an *http.Request with a JSON body.
func JSONRequest(method, path string, body any) *http.Request {
	var buf bytes.Buffer
	if body != nil {
		json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	return req
}

// MultipartRequest builds a multipart/form-data request with a file field.
func MultipartRequest(path, fieldName, fileName string, fileData []byte, mimeType string) *http.Request {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	part, _ := w.CreateFormFile(fieldName, fileName)
	part.Write(fileData)
	w.Close()
	req := httptest.NewRequest(http.MethodPost, path, &buf)
	req.Header.Set("Content-Type", w.FormDataContentType())
	return req
}

// AssertStatus checks the response status code.
func AssertStatus(t *testing.T, resp *httptest.ResponseRecorder, expected int) {
	t.Helper()
	if resp.Code != expected {
		t.Fatalf("expected status %d, got %d; body: %s", expected, resp.Code, resp.Body.String())
	}
}

// DecodeJSON decodes a JSON response body into T.
func DecodeJSON[T any](t *testing.T, resp *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.NewDecoder(resp.Body).Decode(&v); err != nil {
		t.Fatalf("failed to decode JSON: %v; body: %s", err, resp.Body.String())
	}
	return v
}

// ReadBody reads the full response body as a string.
func ReadBody(resp *httptest.ResponseRecorder) string {
	b, _ := io.ReadAll(resp.Body)
	return string(b)
}
