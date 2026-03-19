package services

import (
	"bytes"
	"context"
	"io"
	"os"
	"path/filepath"
	"testing"
)

func TestLocalStorage_SaveAndGet(t *testing.T) {
	dir := t.TempDir()
	s := NewLocalStorage(dir)

	ctx := context.Background()
	data := []byte("hello world")
	key := "user1/content1/file.txt"

	err := s.Save(ctx, key, bytes.NewReader(data), "text/plain")
	if err != nil {
		t.Fatalf("save: %v", err)
	}

	fullPath := filepath.Join(dir, key)
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		t.Fatal("file not found on disk")
	}

	rc, err := s.Get(ctx, key)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer rc.Close()

	got, _ := io.ReadAll(rc)
	if string(got) != "hello world" {
		t.Fatalf("expected 'hello world', got %q", string(got))
	}
}

func TestLocalStorage_Delete(t *testing.T) {
	dir := t.TempDir()
	s := NewLocalStorage(dir)

	ctx := context.Background()
	key := "user1/content1/file.txt"
	s.Save(ctx, key, bytes.NewReader([]byte("data")), "text/plain")

	err := s.Delete(ctx, key)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}

	fullPath := filepath.Join(dir, key)
	if _, err := os.Stat(fullPath); !os.IsNotExist(err) {
		t.Fatal("file still exists after delete")
	}
}

func TestLocalStorage_GetNotFound(t *testing.T) {
	dir := t.TempDir()
	s := NewLocalStorage(dir)

	_, err := s.Get(context.Background(), "nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent key")
	}
}
