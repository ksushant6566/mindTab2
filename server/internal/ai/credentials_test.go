package ai

import "testing"

func TestCredentialCipherRoundTrip(t *testing.T) {
	cipher, err := NewCredentialCipher("test-secret")
	if err != nil {
		t.Fatal(err)
	}

	encrypted, nonce, err := cipher.Encrypt("sk-example-secret")
	if err != nil {
		t.Fatal(err)
	}
	if string(encrypted) == "sk-example-secret" {
		t.Fatal("credential was stored as plain text")
	}

	decrypted, err := cipher.Decrypt(encrypted, nonce)
	if err != nil {
		t.Fatal(err)
	}
	if decrypted != "sk-example-secret" {
		t.Fatalf("decrypted = %q", decrypted)
	}
}

func TestKeyHint(t *testing.T) {
	if got := KeyHint("sk-example-1234"); got != "1234" {
		t.Fatalf("KeyHint = %q", got)
	}
}
