package ai

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"fmt"
	"io"
)

// CredentialCipher encrypts user-supplied provider keys before persistence.
// The configured secret is domain-separated and hashed so deployments may use
// either a dedicated secret or the existing JWT secret without exposing it as
// raw AES key material.
type CredentialCipher struct {
	aead cipher.AEAD
}

func NewCredentialCipher(secret string) (*CredentialCipher, error) {
	if secret == "" {
		return nil, fmt.Errorf("AI credential encryption secret is empty")
	}
	key := sha256.Sum256([]byte("mindtab:ai-provider-credentials:v1:" + secret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, fmt.Errorf("create credential cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create credential AEAD: %w", err)
	}
	return &CredentialCipher{aead: aead}, nil
}

func (c *CredentialCipher) Encrypt(plainText string) (cipherText []byte, nonce []byte, err error) {
	if plainText == "" {
		return nil, nil, fmt.Errorf("API key is empty")
	}
	nonce = make([]byte, c.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, nil, fmt.Errorf("create credential nonce: %w", err)
	}
	return c.aead.Seal(nil, nonce, []byte(plainText), nil), nonce, nil
}

func (c *CredentialCipher) Decrypt(cipherText, nonce []byte) (string, error) {
	plainText, err := c.aead.Open(nil, nonce, cipherText, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt provider credential: %w", err)
	}
	return string(plainText), nil
}

func KeyHint(apiKey string) string {
	if len(apiKey) <= 4 {
		return apiKey
	}
	return apiKey[len(apiKey)-4:]
}
