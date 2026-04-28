//go:build integration

package store_test

// End-to-end integration tests for the audio save pipeline.
//
// These tests boot real Postgres + Redis containers (via testcontainers), wire up
// a SavesHandler with the real sqlc Queries and a real Redis Producer, then drive
// the handler over httptest.  The worker pipeline (Whisper/Gemini) is NOT invoked;
// we only assert the queue-state transitions that are fully deterministic without
// external network calls.
//
// Test 1 — DraftEager: upload (draft + server-probed 30 s) → queue depth 1
//           → commit → row is committed, queue depth still 1.
//
// Test 2 — DraftDeferred: upload (draft + server-probed 1800 s) → queue depth 0
//           → commit with title "Lecture" → row committed, processing_status=pending,
//           source_title="Lecture", queue depth 1.

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	goredis "github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/require"

	"github.com/ksushant6566/mindtab/server/internal/handler"
	"github.com/ksushant6566/mindtab/server/internal/queue"
	"github.com/ksushant6566/mindtab/server/internal/search"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/testutil"
)

// audioE2EEnv wires up the full handler stack against real containers.
type audioE2EEnv struct {
	Router  chi.Router
	Queries *store.Queries
	Redis   *goredis.Client
	UserID  string
	Prober  *audioE2EProber
}

type audioE2EProber struct {
	seconds int32
}

func (p *audioE2EProber) ProbeDuration(_ context.Context, _ string) (int32, error) {
	return p.seconds, nil
}

// setupAudioE2EEnv boots Postgres + Redis containers, creates a real handler,
// mounts routes, and returns a ready environment.
func setupAudioE2EEnv(t *testing.T, userID string) *audioE2EEnv {
	t.Helper()

	pool := testutil.SetupTestDB(t)
	testutil.TruncateAllTables(t, pool)

	redisClient := testutil.SetupTestRedis(t)
	testutil.FlushRedis(t, redisClient)

	q := store.New(pool)
	ctx := context.Background()

	// Insert test user (required for FK constraints on mindmap_content.user_id).
	_, err := q.UpsertUser(ctx, store.UpsertUserParams{
		ID:    userID,
		Name:  testutil.PgText("E2E User"),
		Email: userID + "@example.com",
	})
	require.NoError(t, err)

	producer := queue.NewProducer(redisClient)
	storage := testutil.NewMockStorage()
	prober := &audioE2EProber{}
	// nil searcher is fine — Search endpoint is not under test.
	h := handler.NewSavesHandler(q, producer, &noopSearcher{}, storage, 50<<20, "e2e-secret", prober)

	r := chi.NewRouter()
	r.Post("/saves", h.Create)
	r.Post("/saves/{id}/commit", h.Commit)

	return &audioE2EEnv{
		Router:  r,
		Queries: q,
		Redis:   redisClient,
		UserID:  userID,
		Prober:  prober,
	}
}

// fire sends req through the router and returns the recorded response.
func audioFire(env *audioE2EEnv, req *http.Request) *httptest.ResponseRecorder {
	req = testutil.AuthenticatedRequest(req, env.UserID)
	rr := httptest.NewRecorder()
	env.Router.ServeHTTP(rr, req)
	return rr
}

// queueDepth returns the number of items in the Redis pending list.
func queueDepth(t *testing.T, client *goredis.Client) int64 {
	t.Helper()
	n, err := client.LLen(context.Background(), queue.KeyPending).Result()
	require.NoError(t, err)
	return n
}

// buildAudioMultipart constructs a multipart/form-data request for an audio upload.
func buildAudioMultipart(t *testing.T, mime string, autoCommit bool, payload []byte) (io.Reader, string) {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)

	// Write form fields first.
	if autoCommit {
		_ = mw.WriteField("auto_commit", "true")
	} else {
		_ = mw.WriteField("auto_commit", "false")
	}

	// Audio file part.
	h := make(textproto.MIMEHeader)
	ext := audioExtForMIME(mime)
	h.Set("Content-Disposition", `form-data; name="audio"; filename="note`+ext+`"`)
	h.Set("Content-Type", mime)
	part, err := mw.CreatePart(h)
	require.NoError(t, err)
	_, err = part.Write(payload)
	require.NoError(t, err)

	require.NoError(t, mw.Close())
	return &buf, mw.FormDataContentType()
}

func audioExtForMIME(mime string) string {
	switch mime {
	case "audio/mp4":
		return ".m4a"
	case "audio/mpeg":
		return ".mp3"
	default:
		return ".bin"
	}
}

// minimalMP3 returns bytes recognised as audio/mpeg by the handler.
func minimalMP3() []byte {
	b := make([]byte, 128)
	b[0] = 0xFF
	b[1] = 0xFB
	return b
}

// uploadResponse is the shape returned by POST /saves for media uploads.
type uploadResponse struct {
	ID               string `json:"id"`
	CommitStatus     string `json:"commit_status"`
	ProcessingStatus string `json:"processing_status"`
	MediaURL         string `json:"media_url"`
}

// commitResponse is the shape returned by POST /saves/{id}/commit.
type commitResponse struct {
	ID               string `json:"id"`
	CommitStatus     string `json:"commit_status"`
	ProcessingStatus string `json:"processing_status"`
}

// noopSearcher satisfies the handler's searcher interface with no-ops.
type noopSearcher struct{}

func (n *noopSearcher) Search(_ context.Context, _, _ string, _ int) ([]search.SearchResult, error) {
	return nil, nil
}

// ============================================================
// Test 1 — Audio draft + eager (≤60 s) + commit
// ============================================================

func TestAudio_E2E_DraftEagerCommit(t *testing.T) {
	const userID = "e2e-user-eager"
	env := setupAudioE2EEnv(t, userID)
	env.Prober.seconds = 30

	// Stage 1: upload as draft + eager (30 s <= 60 s threshold).
	body, ct := buildAudioMultipart(t, "audio/mpeg", false, minimalMP3())
	req := httptest.NewRequest(http.MethodPost, "/saves", body)
	req.Header.Set("Content-Type", ct)

	rr := audioFire(env, req)
	require.Equal(t, http.StatusCreated, rr.Code, "Stage1 body: %s", rr.Body.String())

	var created uploadResponse
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&created))
	require.Equal(t, "draft", created.CommitStatus, "expect draft after upload")
	require.Equal(t, "pending", created.ProcessingStatus, "eager upload: processing_status must be pending")
	require.NotEmpty(t, created.ID, "expect non-empty id")

	// Queue must have exactly 1 job (the eager processing job).
	require.EqualValues(t, 1, queueDepth(t, env.Redis), "eager upload: queue depth must be 1")

	// Stage 2: commit the draft.
	commitBody := strings.NewReader(`{}`)
	creq := httptest.NewRequest(http.MethodPost, "/saves/"+created.ID+"/commit", commitBody)
	creq.Header.Set("Content-Type", "application/json")
	crr := audioFire(env, creq)
	require.Equal(t, http.StatusOK, crr.Code, "commit body: %s", crr.Body.String())

	var committed commitResponse
	require.NoError(t, json.NewDecoder(crr.Body).Decode(&committed))
	require.Equal(t, "committed", committed.CommitStatus, "expect committed after commit call")
	// processing_status should remain pending (already queued, worker has not run yet).
	require.Equal(t, "pending", committed.ProcessingStatus)

	// Verify DB row directly.
	row, err := env.Queries.GetContentByID(context.Background(), store.GetContentByIDParams{
		ID:     testutil.PgUUIDFromString(t, created.ID),
		UserID: userID,
	})
	require.NoError(t, err)
	require.Equal(t, "committed", row.CommitStatus, "DB commit_status must be committed")
	// Do not assert processing_status in DB — it may have been picked up by a stray worker.

	// Queue depth is still 1 (no additional job was enqueued by commit, pending job still there).
	require.EqualValues(t, 1, queueDepth(t, env.Redis))
}

// ============================================================
// Test 2 — Audio draft + deferred (>60 s) + commit triggers processing
// ============================================================

func TestAudio_E2E_DraftDeferredCommit(t *testing.T) {
	const userID = "e2e-user-deferred"
	env := setupAudioE2EEnv(t, userID)
	env.Prober.seconds = 1800

	// Stage 1: upload as draft + deferred (1800 s > 60 s threshold).
	body, ct := buildAudioMultipart(t, "audio/mpeg", false, minimalMP3())
	req := httptest.NewRequest(http.MethodPost, "/saves", body)
	req.Header.Set("Content-Type", ct)

	rr := audioFire(env, req)
	require.Equal(t, http.StatusCreated, rr.Code, "Stage1 body: %s", rr.Body.String())

	var created uploadResponse
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&created))
	require.Equal(t, "draft", created.CommitStatus, "expect draft after deferred upload")
	require.Equal(t, "deferred", created.ProcessingStatus, "deferred upload: processing_status must be deferred")
	require.NotEmpty(t, created.ID)

	// No job must have been enqueued yet.
	require.EqualValues(t, 0, queueDepth(t, env.Redis), "deferred upload: queue must be empty")

	// Stage 2: commit with a title override — this should flip processing to pending and enqueue.
	commitBody := strings.NewReader(`{"title":"Lecture"}`)
	creq := httptest.NewRequest(http.MethodPost, "/saves/"+created.ID+"/commit", commitBody)
	creq.Header.Set("Content-Type", "application/json")
	crr := audioFire(env, creq)
	require.Equal(t, http.StatusOK, crr.Code, "commit body: %s", crr.Body.String())

	var committed commitResponse
	require.NoError(t, json.NewDecoder(crr.Body).Decode(&committed))
	require.Equal(t, "committed", committed.CommitStatus)
	require.Equal(t, "pending", committed.ProcessingStatus, "deferred commit: processing_status must flip to pending")

	// Exactly 1 job enqueued by the commit.
	require.EqualValues(t, 1, queueDepth(t, env.Redis), "deferred commit: queue depth must be 1")

	// Verify DB row.
	row, err := env.Queries.GetContentByID(context.Background(), store.GetContentByIDParams{
		ID:     testutil.PgUUIDFromString(t, created.ID),
		UserID: userID,
	})
	require.NoError(t, err)
	require.Equal(t, "committed", row.CommitStatus)
	require.Equal(t, "pending", row.ProcessingStatus)
	require.True(t, row.SourceTitle.Valid)
	require.Equal(t, "Lecture", row.SourceTitle.String, "title override must be persisted in DB")
}
