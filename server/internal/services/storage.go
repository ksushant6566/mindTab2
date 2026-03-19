package services

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// StorageProvider abstracts media file storage.
type StorageProvider interface {
	Save(ctx context.Context, key string, data io.Reader, contentType string) error
	Get(ctx context.Context, key string) (io.ReadCloser, error)
	Delete(ctx context.Context, key string) error
	URL(key string) string
}

// LocalStorage stores files on the local filesystem.
type LocalStorage struct {
	basePath string
}

func NewLocalStorage(basePath string) *LocalStorage {
	return &LocalStorage{basePath: basePath}
}

func (s *LocalStorage) Save(_ context.Context, key string, data io.Reader, _ string) error {
	fullPath := filepath.Join(s.basePath, key)

	if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
		return fmt.Errorf("create directory: %w", err)
	}

	f, err := os.Create(fullPath)
	if err != nil {
		return fmt.Errorf("create file: %w", err)
	}
	defer f.Close()

	if _, err := io.Copy(f, data); err != nil {
		return fmt.Errorf("write file: %w", err)
	}

	return nil
}

func (s *LocalStorage) Get(_ context.Context, key string) (io.ReadCloser, error) {
	fullPath := filepath.Join(s.basePath, key)
	f, err := os.Open(fullPath)
	if err != nil {
		return nil, fmt.Errorf("open file: %w", err)
	}
	return f, nil
}

func (s *LocalStorage) Delete(_ context.Context, key string) error {
	fullPath := filepath.Join(s.basePath, key)
	if err := os.Remove(fullPath); err != nil {
		return fmt.Errorf("delete file: %w", err)
	}
	return nil
}

func (s *LocalStorage) URL(key string) string {
	return "/media/" + key
}
