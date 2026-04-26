package handler

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/search"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/testutil"
)

// --- mock implementations for handler-level interfaces ---

type mockSearcher struct {
	results []search.SearchResult
	err     error
}

func (m *mockSearcher) Search(_ context.Context, _ string, _ string, _ int) ([]search.SearchResult, error) {
	if m.err != nil {
		return nil, m.err
	}
	return m.results, nil
}

// newTestHandler builds a SavesHandler with the provided mock dependencies.
func newTestHandler(q store.Querier, e enqueuer, s searcher) *SavesHandler {
	return NewSavesHandler(q, e, s, testutil.NewMockStorage(), 10<<20, "test-secret")
}

// savesRouter mounts the saves handler on a chi router with user ID in context.
func savesRouter(h *SavesHandler) chi.Router {
	r := chi.NewRouter()
	r.Post("/saves", func(w http.ResponseWriter, r *http.Request) {
		h.Create(w, r)
	})
	r.Get("/saves", func(w http.ResponseWriter, r *http.Request) {
		h.List(w, r)
	})
	r.Post("/saves/search", func(w http.ResponseWriter, r *http.Request) {
		h.Search(w, r)
	})
	r.Get("/saves/{id}", func(w http.ResponseWriter, r *http.Request) {
		h.Get(w, r)
	})
	r.Delete("/saves/{id}", func(w http.ResponseWriter, r *http.Request) {
		h.Delete(w, r)
	})
	r.Post("/saves/{id}/commit", func(w http.ResponseWriter, r *http.Request) {
		h.Commit(w, r)
	})
	return r
}

// mediaRouter mounts the ServeMedia handler on a chi router.
func mediaRouter(h *SavesHandler, storage *testutil.MockStorageProvider) chi.Router {
	r := chi.NewRouter()
	r.Get("/media/*", h.ServeMedia(storage))
	return r
}

// fire sends a request through a router and returns the recorded response.
func fire(router chi.Router, req *http.Request) *httptest.ResponseRecorder {
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)
	return rr
}

// --- helpers for creating valid JPEG bytes ---

// minimalJPEG returns bytes that http.DetectContentType identifies as image/jpeg.
func minimalJPEG() []byte {
	// JPEG starts with FF D8 FF. We need at least 512 bytes for DetectContentType.
	data := make([]byte, 600)
	data[0] = 0xFF
	data[1] = 0xD8
	data[2] = 0xFF
	data[3] = 0xE0 // JFIF APP0 marker
	return data
}

// minimalGIF returns bytes that http.DetectContentType identifies as image/gif.
func minimalGIF() []byte {
	data := make([]byte, 600)
	copy(data, []byte("GIF89a"))
	return data
}

// --- helpers for signed URL generation ---

func signURL(secret, key string, exp int64) string {
	mac := hmac.New(sha256.New, []byte(secret))
	fmt.Fprintf(mac, "%s:%d", key, exp)
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return fmt.Sprintf("/media/%s?sig=%s&exp=%d", key, sig, exp)
}

// ============================================================
// TestSaves_Create (11 subtests)
// ============================================================

func TestSaves_Create(t *testing.T) {
	contentID := uuid.New()
	jobID := uuid.New()

	baseQuerier := func() *store.QuerierMock {
		return &store.QuerierMock{
			CreateContentFunc: func(_ context.Context, arg store.CreateContentParams) (store.CreateContentRow, error) {
				row := testutil.NewCreateContentRow(testutil.WithContentID(contentID))
				// Mirror back media fields so the handler can build a correct response.
				row.MediaKey = arg.MediaKey
				row.MediaMime = arg.MediaMime
				row.MediaFileBytes = arg.MediaFileBytes
				row.ProcessingStatus = arg.ProcessingStatus
				row.CommitStatus = arg.CommitStatus
				return row, nil
			},
			CreateContentWithExtractedFunc: func(_ context.Context, arg store.CreateContentWithExtractedParams) (store.CreateContentWithExtractedRow, error) {
				return store.CreateContentWithExtractedRow{
					ID:               testutil.PgUUID(contentID),
					UserID:           arg.UserID,
					SourceType:       arg.SourceType,
					ProcessingStatus: "pending",
					CommitStatus:     "committed",
					CreatedAt:        testutil.PgTimestamptz(time.Now()),
				}, nil
			},
			CreateJobFunc: func(_ context.Context, _ store.CreateJobParams) (pgtype.UUID, error) {
				return testutil.PgUUID(jobID), nil
			},
		}
	}

	t.Run("ArticleURL", func(t *testing.T) {
		q := baseQuerier()
		h := newTestHandler(q, &testutil.MockProducer{}, &mockSearcher{})
		router := savesRouter(h)

		req := testutil.JSONRequest(http.MethodPost, "/saves", map[string]string{
			"url": "https://example.com/article",
		})
		req = testutil.AuthenticatedRequest(req, "test-user")

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusCreated)

		body := testutil.DecodeJSON[saveResponse](t, resp)
		if body.Status != "pending" {
			t.Errorf("expected status 'pending', got %q", body.Status)
		}
		if body.ID == "" {
			t.Error("expected non-empty ID")
		}
	})

	t.Run("YouTubeURL", func(t *testing.T) {
		var capturedType string
		q := &store.QuerierMock{
			CreateContentFunc: func(_ context.Context, arg store.CreateContentParams) (store.CreateContentRow, error) {
				capturedType = arg.SourceType
				return testutil.NewCreateContentRow(testutil.WithContentID(contentID)), nil
			},
			CreateJobFunc: func(_ context.Context, _ store.CreateJobParams) (pgtype.UUID, error) {
				return testutil.PgUUID(jobID), nil
			},
		}
		h := newTestHandler(q, &testutil.MockProducer{}, &mockSearcher{})
		router := savesRouter(h)

		req := testutil.JSONRequest(http.MethodPost, "/saves", map[string]string{
			"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
		})
		req = testutil.AuthenticatedRequest(req, "test-user")

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusCreated)

		if capturedType != "youtube" {
			t.Errorf("expected content_type 'youtube', got %q", capturedType)
		}
	})

	t.Run("ImageUpload", func(t *testing.T) {
		storage := testutil.NewMockStorage()
		q := baseQuerier()
		producer := &testutil.MockProducer{}
		h := NewSavesHandler(q, producer, &mockSearcher{}, storage, 10<<20, "test-secret")
		router := savesRouter(h)

		imageData := minimalJPEG()
		req := testutil.MultipartRequest("/saves", "image", "photo.jpg", imageData, "image/jpeg")
		req = testutil.AuthenticatedRequest(req, "test-user")

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusCreated)

		// Verify storage.Save was called (one file stored).
		if len(storage.Files) != 1 {
			t.Errorf("expected 1 file in storage, got %d", len(storage.Files))
		}
		for key := range storage.Files {
			if !strings.HasPrefix(key, "test-user/") {
				t.Errorf("expected storage key to start with 'test-user/', got %q", key)
			}
			if !strings.HasSuffix(key, ".jpg") {
				t.Errorf("expected storage key to end with '.jpg', got %q", key)
			}
		}

		// Verify the response shape: processing_status + media_url.
		type imageCreateResponse struct {
			ID               string `json:"id"`
			CommitStatus     string `json:"commit_status"`
			ProcessingStatus string `json:"processing_status"`
			MediaURL         string `json:"media_url"`
		}
		body := testutil.DecodeJSON[imageCreateResponse](t, resp)
		if body.ProcessingStatus != "pending" {
			t.Errorf("expected processing_status 'pending', got %q", body.ProcessingStatus)
		}
		if body.MediaURL == "" {
			t.Error("expected media_url to be set in image upload response")
		}
		if body.CommitStatus != "committed" {
			t.Errorf("expected commit_status 'committed', got %q", body.CommitStatus)
		}
		if body.ID == "" {
			t.Error("expected non-empty id in image upload response")
		}

		// Verify a job was enqueued.
		if len(producer.Enqueued) != 1 {
			t.Errorf("expected 1 enqueued job, got %d", len(producer.Enqueued))
		}
	})

	t.Run("EmptyURL", func(t *testing.T) {
		h := newTestHandler(baseQuerier(), &testutil.MockProducer{}, &mockSearcher{})
		router := savesRouter(h)

		req := testutil.JSONRequest(http.MethodPost, "/saves", map[string]string{
			"url": "",
		})
		req = testutil.AuthenticatedRequest(req, "test-user")

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusBadRequest)
	})

	t.Run("InvalidScheme", func(t *testing.T) {
		h := newTestHandler(baseQuerier(), &testutil.MockProducer{}, &mockSearcher{})
		router := savesRouter(h)

		req := testutil.JSONRequest(http.MethodPost, "/saves", map[string]string{
			"url": "ftp://example.com/file",
		})
		req = testutil.AuthenticatedRequest(req, "test-user")

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusBadRequest)
	})

	t.Run("URLTooLong", func(t *testing.T) {
		h := newTestHandler(baseQuerier(), &testutil.MockProducer{}, &mockSearcher{})
		router := savesRouter(h)

		longURL := "https://example.com/" + strings.Repeat("a", 2040)
		req := testutil.JSONRequest(http.MethodPost, "/saves", map[string]string{
			"url": longURL,
		})
		req = testutil.AuthenticatedRequest(req, "test-user")

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusBadRequest)
	})

	t.Run("BadMIME", func(t *testing.T) {
		h := newTestHandler(baseQuerier(), &testutil.MockProducer{}, &mockSearcher{})
		router := savesRouter(h)

		req := testutil.MultipartRequest("/saves", "image", "animation.gif", minimalGIF(), "image/gif")
		req = testutil.AuthenticatedRequest(req, "test-user")

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusBadRequest)
	})

	t.Run("OversizedFile", func(t *testing.T) {
		// Set maxSize to a very small value (1 byte) to trigger the size limit.
		// Go's ParseMultipartForm(maxMemory) limits total form data to maxMemory + 10<<20.
		// We wrap the request body with MaxBytesReader to enforce the small limit,
		// which causes ParseMultipartForm to fail.
		q := baseQuerier()
		h := NewSavesHandler(q, &testutil.MockProducer{}, &mockSearcher{}, testutil.NewMockStorage(), 1, "test-secret")
		router := chi.NewRouter()
		router.Post("/saves", func(w http.ResponseWriter, r *http.Request) {
			// Wrap body with MaxBytesReader to enforce size limit before the handler runs.
			r.Body = http.MaxBytesReader(w, r.Body, 1)
			h.Create(w, r)
		})

		req := testutil.MultipartRequest("/saves", "image", "photo.jpg", minimalJPEG(), "image/jpeg")
		req = testutil.AuthenticatedRequest(req, "test-user")

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusRequestEntityTooLarge)
	})

	t.Run("WithPreExtracted", func(t *testing.T) {
		var createWithExtractedCalled bool
		q := &store.QuerierMock{
			CreateContentWithExtractedFunc: func(_ context.Context, arg store.CreateContentWithExtractedParams) (store.CreateContentWithExtractedRow, error) {
				createWithExtractedCalled = true
				return store.CreateContentWithExtractedRow{
					ID:               testutil.PgUUID(contentID),
					UserID:           arg.UserID,
					SourceType:       arg.SourceType,
					ProcessingStatus: "pending",
					CommitStatus:     "committed",
					CreatedAt:        testutil.PgTimestamptz(time.Now()),
				}, nil
			},
			CreateJobFunc: func(_ context.Context, _ store.CreateJobParams) (pgtype.UUID, error) {
				return testutil.PgUUID(jobID), nil
			},
		}
		h := newTestHandler(q, &testutil.MockProducer{}, &mockSearcher{})
		router := savesRouter(h)

		req := testutil.JSONRequest(http.MethodPost, "/saves", map[string]any{
			"url":     "https://example.com/article",
			"content": "Pre-extracted article text content here.",
		})
		req = testutil.AuthenticatedRequest(req, "test-user")

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusCreated)

		if !createWithExtractedCalled {
			t.Error("expected CreateContentWithExtracted to be called, but it was not")
		}
	})

	t.Run("DBError", func(t *testing.T) {
		q := &store.QuerierMock{
			CreateContentFunc: func(_ context.Context, _ store.CreateContentParams) (store.CreateContentRow, error) {
				return store.CreateContentRow{}, fmt.Errorf("db connection lost")
			},
		}
		h := newTestHandler(q, &testutil.MockProducer{}, &mockSearcher{})
		router := savesRouter(h)

		req := testutil.JSONRequest(http.MethodPost, "/saves", map[string]string{
			"url": "https://example.com/article",
		})
		req = testutil.AuthenticatedRequest(req, "test-user")

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusInternalServerError)
	})

	t.Run("QueueError", func(t *testing.T) {
		q := baseQuerier()
		producer := &testutil.MockProducer{Err: fmt.Errorf("redis unavailable")}
		h := newTestHandler(q, producer, &mockSearcher{})
		router := savesRouter(h)

		req := testutil.JSONRequest(http.MethodPost, "/saves", map[string]string{
			"url": "https://example.com/article",
		})
		req = testutil.AuthenticatedRequest(req, "test-user")

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusInternalServerError)
	})
}

// ============================================================
// TestSaves_Create_NoFlags_DefaultsToCommittedPending
// ============================================================

func TestSaves_Create_NoFlags_DefaultsToCommittedPending(t *testing.T) {
	contentID := uuid.New()
	jobID := uuid.New()

	var capturedArgs store.CreateContentParams
	q := &store.QuerierMock{
		CreateContentFunc: func(_ context.Context, arg store.CreateContentParams) (store.CreateContentRow, error) {
			capturedArgs = arg
			row := testutil.NewCreateContentRow(testutil.WithContentID(contentID))
			row.ProcessingStatus = arg.ProcessingStatus
			row.CommitStatus = arg.CommitStatus
			return row, nil
		},
		CreateJobFunc: func(_ context.Context, _ store.CreateJobParams) (pgtype.UUID, error) {
			return testutil.PgUUID(jobID), nil
		},
	}
	producer := &testutil.MockProducer{}
	h := newTestHandler(q, producer, &mockSearcher{})
	router := savesRouter(h)

	// POST with no flags — both should default to true.
	req := testutil.JSONRequest(http.MethodPost, "/saves", map[string]string{
		"url": "https://example.com/x",
	})
	req = testutil.AuthenticatedRequest(req, "test-user")

	resp := fire(router, req)
	testutil.AssertStatus(t, resp, http.StatusCreated)

	if capturedArgs.CommitStatus != "committed" {
		t.Errorf("expected CommitStatus 'committed', got %q", capturedArgs.CommitStatus)
	}
	if capturedArgs.ProcessingStatus != "pending" {
		t.Errorf("expected ProcessingStatus 'pending', got %q", capturedArgs.ProcessingStatus)
	}
	if len(producer.Enqueued) != 1 {
		t.Errorf("expected 1 enqueued job, got %d", len(producer.Enqueued))
	}
}

// ============================================================
// TestSaves_Create_DraftDeferred_DoesNotEnqueue
// ============================================================

func TestSaves_Create_DraftDeferred_DoesNotEnqueue(t *testing.T) {
	contentID := uuid.New()

	var capturedArgs store.CreateContentParams
	q := &store.QuerierMock{
		CreateContentFunc: func(_ context.Context, arg store.CreateContentParams) (store.CreateContentRow, error) {
			capturedArgs = arg
			row := testutil.NewCreateContentRow(testutil.WithContentID(contentID))
			row.ProcessingStatus = arg.ProcessingStatus
			row.CommitStatus = arg.CommitStatus
			return row, nil
		},
		// CreateJobFunc intentionally absent — should never be called for deferred saves.
	}
	producer := &testutil.MockProducer{}
	h := newTestHandler(q, producer, &mockSearcher{})
	router := savesRouter(h)

	req := testutil.JSONRequest(http.MethodPost, "/saves", map[string]any{
		"url":              "https://example.com/x",
		"auto_commit":      false,
		"start_processing": false,
	})
	req = testutil.AuthenticatedRequest(req, "test-user")

	resp := fire(router, req)
	testutil.AssertStatus(t, resp, http.StatusCreated)

	if capturedArgs.CommitStatus != "draft" {
		t.Errorf("expected CommitStatus 'draft', got %q", capturedArgs.CommitStatus)
	}
	if capturedArgs.ProcessingStatus != "deferred" {
		t.Errorf("expected ProcessingStatus 'deferred', got %q", capturedArgs.ProcessingStatus)
	}
	if len(producer.Enqueued) != 0 {
		t.Errorf("expected 0 enqueued jobs, got %d", len(producer.Enqueued))
	}
}

// ============================================================
// TestSaves_List (5 subtests)
// ============================================================

func TestSaves_List(t *testing.T) {
	t.Run("Default", func(t *testing.T) {
		var capturedParams store.ListContentParams
		q := &store.QuerierMock{
			ListContentFunc: func(_ context.Context, arg store.ListContentParams) ([]store.ListContentRow, error) {
				capturedParams = arg
				return []store.ListContentRow{
					testutil.NewListContentRow(),
					testutil.NewListContentRow(),
				}, nil
			},
		}
		h := newTestHandler(q, &testutil.MockProducer{}, &mockSearcher{})
		router := savesRouter(h)

		req := testutil.JSONRequest(http.MethodGet, "/saves", nil)
		req = testutil.AuthenticatedRequest(req, "test-user")

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusOK)

		items := testutil.DecodeJSON[[]contentListJSON](t, resp)
		if len(items) != 2 {
			t.Errorf("expected 2 items, got %d", len(items))
		}
		if capturedParams.Limit != 20 {
			t.Errorf("expected default limit 20, got %d", capturedParams.Limit)
		}
		if capturedParams.Offset != 0 {
			t.Errorf("expected default offset 0, got %d", capturedParams.Offset)
		}
	})

	t.Run("CustomPagination", func(t *testing.T) {
		var capturedParams store.ListContentParams
		q := &store.QuerierMock{
			ListContentFunc: func(_ context.Context, arg store.ListContentParams) ([]store.ListContentRow, error) {
				capturedParams = arg
				return []store.ListContentRow{}, nil
			},
		}
		h := newTestHandler(q, &testutil.MockProducer{}, &mockSearcher{})
		router := savesRouter(h)

		req := testutil.JSONRequest(http.MethodGet, "/saves?limit=5&offset=10", nil)
		req = testutil.AuthenticatedRequest(req, "test-user")

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusOK)

		if capturedParams.Limit != 5 {
			t.Errorf("expected limit 5, got %d", capturedParams.Limit)
		}
		if capturedParams.Offset != 10 {
			t.Errorf("expected offset 10, got %d", capturedParams.Offset)
		}
	})

	t.Run("LimitClamped", func(t *testing.T) {
		var capturedParams store.ListContentParams
		q := &store.QuerierMock{
			ListContentFunc: func(_ context.Context, arg store.ListContentParams) ([]store.ListContentRow, error) {
				capturedParams = arg
				return []store.ListContentRow{}, nil
			},
		}
		h := newTestHandler(q, &testutil.MockProducer{}, &mockSearcher{})
		router := savesRouter(h)

		req := testutil.JSONRequest(http.MethodGet, "/saves?limit=999", nil)
		req = testutil.AuthenticatedRequest(req, "test-user")

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusOK)

		if capturedParams.Limit != 100 {
			t.Errorf("expected limit clamped to 100, got %d", capturedParams.Limit)
		}
	})

	t.Run("InvalidParams", func(t *testing.T) {
		q := &store.QuerierMock{}
		h := newTestHandler(q, &testutil.MockProducer{}, &mockSearcher{})
		router := savesRouter(h)

		req := testutil.JSONRequest(http.MethodGet, "/saves?limit=abc", nil)
		req = testutil.AuthenticatedRequest(req, "test-user")

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusBadRequest)
	})

	t.Run("SignedMediaURLs", func(t *testing.T) {
		mediaKey := "test-user/image-abc.jpg"
		q := &store.QuerierMock{
			ListContentFunc: func(_ context.Context, _ store.ListContentParams) ([]store.ListContentRow, error) {
				return []store.ListContentRow{
					testutil.NewListContentRow(testutil.WithListMediaKey(mediaKey)),
				}, nil
			},
		}
		h := newTestHandler(q, &testutil.MockProducer{}, &mockSearcher{})
		router := savesRouter(h)

		req := testutil.JSONRequest(http.MethodGet, "/saves", nil)
		req = testutil.AuthenticatedRequest(req, "test-user")

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusOK)

		items := testutil.DecodeJSON[[]contentListJSON](t, resp)
		if len(items) != 1 {
			t.Fatalf("expected 1 item, got %d", len(items))
		}
		if items[0].SourceMediaURL == nil {
			t.Fatal("expected source_media_url to be set for item with media_key")
		}
		if !strings.Contains(*items[0].SourceMediaURL, "sig=") {
			t.Errorf("expected signed URL to contain 'sig=', got %q", *items[0].SourceMediaURL)
		}
		if !strings.Contains(*items[0].SourceMediaURL, mediaKey) {
			t.Errorf("expected signed URL to contain media key %q, got %q", mediaKey, *items[0].SourceMediaURL)
		}
	})
}

// ============================================================
// TestSaves_Get (3 subtests)
// ============================================================

func TestSaves_Get(t *testing.T) {
	t.Run("Found", func(t *testing.T) {
		targetID := uuid.New()
		q := &store.QuerierMock{
			GetContentByIDFunc: func(_ context.Context, arg store.GetContentByIDParams) (store.GetContentByIDRow, error) {
				row := testutil.NewGetContentRow(testutil.WithGetSourceURL("https://example.com"))
				row.ID = testutil.PgUUID(targetID)
				row.UserID = "test-user"
				return row, nil
			},
		}
		h := newTestHandler(q, &testutil.MockProducer{}, &mockSearcher{})
		router := savesRouter(h)

		req := testutil.JSONRequest(http.MethodGet, "/saves/"+targetID.String(), nil)
		req = testutil.AuthenticatedRequest(req, "test-user")

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusOK)

		body := testutil.DecodeJSON[contentJSON](t, resp)
		if body.ID != targetID.String() {
			t.Errorf("expected ID %q, got %q", targetID.String(), body.ID)
		}
		if body.UserID != "test-user" {
			t.Errorf("expected user_id 'test-user', got %q", body.UserID)
		}
	})

	t.Run("NotFound", func(t *testing.T) {
		q := &store.QuerierMock{
			GetContentByIDFunc: func(_ context.Context, _ store.GetContentByIDParams) (store.GetContentByIDRow, error) {
				return store.GetContentByIDRow{}, fmt.Errorf("no rows in result set")
			},
		}
		h := newTestHandler(q, &testutil.MockProducer{}, &mockSearcher{})
		router := savesRouter(h)

		req := testutil.JSONRequest(http.MethodGet, "/saves/"+uuid.New().String(), nil)
		req = testutil.AuthenticatedRequest(req, "test-user")

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusNotFound)
	})

	t.Run("BadUUID", func(t *testing.T) {
		q := &store.QuerierMock{}
		h := newTestHandler(q, &testutil.MockProducer{}, &mockSearcher{})
		router := savesRouter(h)

		req := testutil.JSONRequest(http.MethodGet, "/saves/not-a-uuid", nil)
		req = testutil.AuthenticatedRequest(req, "test-user")

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusBadRequest)
	})
}

// ============================================================
// TestSaves_Delete (1 subtest)
// ============================================================

func TestSaves_Delete(t *testing.T) {
	t.Run("Success", func(t *testing.T) {
		var deleteCalled bool
		q := &store.QuerierMock{
			SoftDeleteContentFunc: func(_ context.Context, _ store.SoftDeleteContentParams) error {
				deleteCalled = true
				return nil
			},
		}
		h := newTestHandler(q, &testutil.MockProducer{}, &mockSearcher{})
		router := savesRouter(h)

		req := testutil.JSONRequest(http.MethodDelete, "/saves/"+uuid.New().String(), nil)
		req = testutil.AuthenticatedRequest(req, "test-user")

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusNoContent)

		if !deleteCalled {
			t.Error("expected SoftDeleteContent to be called")
		}
	})
}

// ============================================================
// TestSaves_Commit (6 subtests)
// ============================================================

func TestSaves_Commit_DeferredFlipsAndEnqueues(t *testing.T) {
	contentID := uuid.New()

	// Seed: draft + deferred
	seedRow := testutil.NewGetContentRow()
	seedRow.ID = testutil.PgUUID(contentID)
	seedRow.UserID = "test-user"
	seedRow.SourceType = "article"
	seedRow.ProcessingStatus = "deferred"
	// CommitStatus is not on GetContentByIDRow before this task — we add it via the updated SQL.
	// The factory default CommitStatus is not set, so we set it directly.

	var updateCommitCalled bool
	var updateProcessingCalled bool

	q := &store.QuerierMock{
		GetContentByIDFunc: func(_ context.Context, arg store.GetContentByIDParams) (store.GetContentByIDRow, error) {
			row := seedRow
			row.CommitStatus = "draft"
			return row, nil
		},
		UpdateContentCommitStatusFunc: func(_ context.Context, _ store.UpdateContentCommitStatusParams) error {
			updateCommitCalled = true
			return nil
		},
		UpdateContentProcessingStatusToPendingFunc: func(_ context.Context, _ pgtype.UUID) error {
			updateProcessingCalled = true
			return nil
		},
	}
	producer := &testutil.MockProducer{}
	h := newTestHandler(q, producer, &mockSearcher{})
	router := savesRouter(h)

	req := testutil.JSONRequest(http.MethodPost, "/saves/"+contentID.String()+"/commit", nil)
	req = testutil.AuthenticatedRequest(req, "test-user")

	resp := fire(router, req)
	testutil.AssertStatus(t, resp, http.StatusOK)

	if !updateCommitCalled {
		t.Error("expected UpdateContentCommitStatus to be called")
	}
	if !updateProcessingCalled {
		t.Error("expected UpdateContentProcessingStatusToPending to be called")
	}
	if len(producer.Enqueued) != 1 {
		t.Errorf("expected 1 enqueued job, got %d", len(producer.Enqueued))
	}

	type commitResp struct {
		ID               string `json:"id"`
		CommitStatus     string `json:"commit_status"`
		ProcessingStatus string `json:"processing_status"`
	}
	body := testutil.DecodeJSON[commitResp](t, resp)
	if body.CommitStatus != "committed" {
		t.Errorf("expected commit_status 'committed', got %q", body.CommitStatus)
	}
	if body.ProcessingStatus != "pending" {
		t.Errorf("expected processing_status 'pending', got %q", body.ProcessingStatus)
	}
}

func TestSaves_Commit_DraftPending_FlipsCommitNoReEnqueue(t *testing.T) {
	contentID := uuid.New()

	var updateCommitCalled bool

	q := &store.QuerierMock{
		GetContentByIDFunc: func(_ context.Context, _ store.GetContentByIDParams) (store.GetContentByIDRow, error) {
			row := testutil.NewGetContentRow()
			row.ID = testutil.PgUUID(contentID)
			row.UserID = "test-user"
			row.ProcessingStatus = "pending"
			row.CommitStatus = "draft"
			return row, nil
		},
		UpdateContentCommitStatusFunc: func(_ context.Context, _ store.UpdateContentCommitStatusParams) error {
			updateCommitCalled = true
			return nil
		},
		// UpdateContentProcessingStatusToPendingFunc intentionally absent — should not be called.
	}
	producer := &testutil.MockProducer{}
	h := newTestHandler(q, producer, &mockSearcher{})
	router := savesRouter(h)

	req := testutil.JSONRequest(http.MethodPost, "/saves/"+contentID.String()+"/commit", nil)
	req = testutil.AuthenticatedRequest(req, "test-user")

	resp := fire(router, req)
	testutil.AssertStatus(t, resp, http.StatusOK)

	if !updateCommitCalled {
		t.Error("expected UpdateContentCommitStatus to be called")
	}
	if len(producer.Enqueued) != 0 {
		t.Errorf("expected 0 enqueued jobs, got %d", len(producer.Enqueued))
	}
}

func TestSaves_Commit_DraftCompleted_FlipsCommitNoReEnqueue(t *testing.T) {
	contentID := uuid.New()

	var updateCommitCalled bool

	q := &store.QuerierMock{
		GetContentByIDFunc: func(_ context.Context, _ store.GetContentByIDParams) (store.GetContentByIDRow, error) {
			row := testutil.NewGetContentRow()
			row.ID = testutil.PgUUID(contentID)
			row.UserID = "test-user"
			row.ProcessingStatus = "completed"
			row.CommitStatus = "draft"
			return row, nil
		},
		UpdateContentCommitStatusFunc: func(_ context.Context, _ store.UpdateContentCommitStatusParams) error {
			updateCommitCalled = true
			return nil
		},
	}
	producer := &testutil.MockProducer{}
	h := newTestHandler(q, producer, &mockSearcher{})
	router := savesRouter(h)

	req := testutil.JSONRequest(http.MethodPost, "/saves/"+contentID.String()+"/commit", nil)
	req = testutil.AuthenticatedRequest(req, "test-user")

	resp := fire(router, req)
	testutil.AssertStatus(t, resp, http.StatusOK)

	if !updateCommitCalled {
		t.Error("expected UpdateContentCommitStatus to be called")
	}
	if len(producer.Enqueued) != 0 {
		t.Errorf("expected 0 enqueued jobs, got %d", len(producer.Enqueued))
	}
}

func TestSaves_Commit_AlreadyCommitted_NoOp(t *testing.T) {
	contentID := uuid.New()

	var updateCommitCalled bool

	q := &store.QuerierMock{
		GetContentByIDFunc: func(_ context.Context, _ store.GetContentByIDParams) (store.GetContentByIDRow, error) {
			row := testutil.NewGetContentRow()
			row.ID = testutil.PgUUID(contentID)
			row.UserID = "test-user"
			row.ProcessingStatus = "completed"
			row.CommitStatus = "committed"
			return row, nil
		},
		UpdateContentCommitStatusFunc: func(_ context.Context, _ store.UpdateContentCommitStatusParams) error {
			updateCommitCalled = true
			return nil
		},
	}
	producer := &testutil.MockProducer{}
	h := newTestHandler(q, producer, &mockSearcher{})
	router := savesRouter(h)

	req := testutil.JSONRequest(http.MethodPost, "/saves/"+contentID.String()+"/commit", nil)
	req = testutil.AuthenticatedRequest(req, "test-user")

	resp := fire(router, req)
	testutil.AssertStatus(t, resp, http.StatusOK)

	if updateCommitCalled {
		t.Error("expected UpdateContentCommitStatus NOT to be called for already-committed save")
	}
	if len(producer.Enqueued) != 0 {
		t.Errorf("expected 0 enqueued jobs, got %d", len(producer.Enqueued))
	}
}

func TestSaves_Commit_TitleOverride(t *testing.T) {
	contentID := uuid.New()

	var capturedParams store.UpdateContentCommitStatusParams

	q := &store.QuerierMock{
		GetContentByIDFunc: func(_ context.Context, _ store.GetContentByIDParams) (store.GetContentByIDRow, error) {
			row := testutil.NewGetContentRow()
			row.ID = testutil.PgUUID(contentID)
			row.UserID = "test-user"
			row.ProcessingStatus = "completed"
			row.CommitStatus = "draft"
			return row, nil
		},
		UpdateContentCommitStatusFunc: func(_ context.Context, arg store.UpdateContentCommitStatusParams) error {
			capturedParams = arg
			return nil
		},
	}
	h := newTestHandler(q, &testutil.MockProducer{}, &mockSearcher{})
	router := savesRouter(h)

	req := testutil.JSONRequest(http.MethodPost, "/saves/"+contentID.String()+"/commit", map[string]string{
		"title": "Renamed",
	})
	req = testutil.AuthenticatedRequest(req, "test-user")

	resp := fire(router, req)
	testutil.AssertStatus(t, resp, http.StatusOK)

	if !capturedParams.SourceTitle.Valid || capturedParams.SourceTitle.String != "Renamed" {
		t.Errorf("expected SourceTitle 'Renamed', got %+v", capturedParams.SourceTitle)
	}
}

func TestSaves_Commit_OtherUser_404(t *testing.T) {
	contentID := uuid.New()

	q := &store.QuerierMock{
		GetContentByIDFunc: func(_ context.Context, _ store.GetContentByIDParams) (store.GetContentByIDRow, error) {
			// Return not found (simulating user_id mismatch — GetContentByID filters by user_id).
			return store.GetContentByIDRow{}, fmt.Errorf("no rows in result set")
		},
	}
	h := newTestHandler(q, &testutil.MockProducer{}, &mockSearcher{})
	router := savesRouter(h)

	// Authenticate as "other-user" — the query will return not-found.
	req := testutil.JSONRequest(http.MethodPost, "/saves/"+contentID.String()+"/commit", nil)
	req = testutil.AuthenticatedRequest(req, "other-user")

	resp := fire(router, req)
	testutil.AssertStatus(t, resp, http.StatusNotFound)
}

// ============================================================
// TestSaves_Search (4 subtests)
// ============================================================

func TestSaves_Search(t *testing.T) {
	t.Run("Valid", func(t *testing.T) {
		results := []search.SearchResult{
			{
				ID:         uuid.New(),
				SourceType: "article",
				Similarity: 0.95,
				CreatedAt:  time.Now(),
			},
		}
		s := &mockSearcher{results: results}
		h := newTestHandler(&store.QuerierMock{}, &testutil.MockProducer{}, s)
		router := savesRouter(h)

		req := testutil.JSONRequest(http.MethodPost, "/saves/search", map[string]any{
			"query": "machine learning",
			"limit": 10,
		})
		req = testutil.AuthenticatedRequest(req, "test-user")

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusOK)

		body := testutil.DecodeJSON[[]search.SearchResult](t, resp)
		if len(body) != 1 {
			t.Errorf("expected 1 result, got %d", len(body))
		}
	})

	t.Run("EmptyQuery", func(t *testing.T) {
		h := newTestHandler(&store.QuerierMock{}, &testutil.MockProducer{}, &mockSearcher{})
		router := savesRouter(h)

		req := testutil.JSONRequest(http.MethodPost, "/saves/search", map[string]any{
			"query": "",
			"limit": 10,
		})
		req = testutil.AuthenticatedRequest(req, "test-user")

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusBadRequest)
	})

	t.Run("LimitClamped", func(t *testing.T) {
		var capturedLimit int
		s := &mockSearcher{}
		// Override Search to capture the limit parameter.
		originalSearch := s
		captureSearcher := &capturingSearcher{
			inner:        originalSearch,
			capturedLimit: &capturedLimit,
		}
		h := newTestHandler(&store.QuerierMock{}, &testutil.MockProducer{}, captureSearcher)
		router := savesRouter(h)

		req := testutil.JSONRequest(http.MethodPost, "/saves/search", map[string]any{
			"query": "test query",
			"limit": 999,
		})
		req = testutil.AuthenticatedRequest(req, "test-user")

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusOK)

		if capturedLimit != 50 {
			t.Errorf("expected limit clamped to 50, got %d", capturedLimit)
		}
	})

	t.Run("NullResults", func(t *testing.T) {
		// Search returning nil results should yield an empty JSON array, not null.
		s := &mockSearcher{results: nil}
		h := newTestHandler(&store.QuerierMock{}, &testutil.MockProducer{}, s)
		router := savesRouter(h)

		req := testutil.JSONRequest(http.MethodPost, "/saves/search", map[string]any{
			"query": "something obscure",
			"limit": 10,
		})
		req = testutil.AuthenticatedRequest(req, "test-user")

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusOK)

		// Verify the JSON body is an empty array `[]`, not `null`.
		body := testutil.ReadBody(resp)
		trimmed := strings.TrimSpace(body)
		if trimmed != "[]" {
			t.Errorf("expected empty JSON array '[]', got %q", trimmed)
		}
	})
}

// capturingSearcher wraps a searcher to capture the limit parameter.
type capturingSearcher struct {
	inner         searcher
	capturedLimit *int
}

func (c *capturingSearcher) Search(ctx context.Context, userID string, query string, limit int) ([]search.SearchResult, error) {
	*c.capturedLimit = limit
	return c.inner.Search(ctx, userID, query, limit)
}

// ============================================================
// TestSaves_List_OmitsDrafts
// ============================================================
// The SQL for ListContent contains a hardcoded AND commit_status='committed'
// filter, so drafts are excluded at the DB layer.  This test verifies the
// handler routes GET /saves through ListContent (the draft-filtering query)
// and correctly surfaces whatever that query returns.

func TestSaves_List_OmitsDrafts(t *testing.T) {
	var listCalled bool
	q := &store.QuerierMock{
		ListContentFunc: func(_ context.Context, _ store.ListContentParams) ([]store.ListContentRow, error) {
			listCalled = true
			// Return exactly one committed row — simulating the DB filter.
			return []store.ListContentRow{
				testutil.NewListContentRow(),
			}, nil
		},
	}
	h := newTestHandler(q, &testutil.MockProducer{}, &mockSearcher{})
	router := savesRouter(h)

	req := testutil.JSONRequest(http.MethodGet, "/saves", nil)
	req = testutil.AuthenticatedRequest(req, "test-user")

	resp := fire(router, req)
	testutil.AssertStatus(t, resp, http.StatusOK)

	if !listCalled {
		t.Error("expected ListContent to be called for GET /saves")
	}

	items := testutil.DecodeJSON[[]contentListJSON](t, resp)
	if len(items) != 1 {
		t.Errorf("expected 1 item from listing, got %d", len(items))
	}
}

// ============================================================
// TestSaves_ServeMedia (5 subtests)
// ============================================================

func TestSaves_ServeMedia(t *testing.T) {
	const jwtSecret = "test-secret"
	const userID = "test-user"
	const mediaKey = userID + "/image-abc.jpg"
	const fileContent = "fake image data"

	t.Run("ValidSig", func(t *testing.T) {
		storage := testutil.NewMockStorage()
		storage.Files[mediaKey] = []byte(fileContent)

		h := NewSavesHandler(&store.QuerierMock{}, &testutil.MockProducer{}, &mockSearcher{}, testutil.NewMockStorage(), 10<<20, jwtSecret)
		router := mediaRouter(h, storage)

		exp := time.Now().Add(1 * time.Hour).Unix()
		url := signURL(jwtSecret, mediaKey, exp)

		req := httptest.NewRequest(http.MethodGet, url, nil)
		resp := fire(router, req)

		testutil.AssertStatus(t, resp, http.StatusOK)

		body := testutil.ReadBody(resp)
		if body != fileContent {
			t.Errorf("expected body %q, got %q", fileContent, body)
		}
	})

	t.Run("ExpiredSig", func(t *testing.T) {
		storage := testutil.NewMockStorage()
		storage.Files[mediaKey] = []byte(fileContent)

		h := NewSavesHandler(&store.QuerierMock{}, &testutil.MockProducer{}, &mockSearcher{}, testutil.NewMockStorage(), 10<<20, jwtSecret)
		router := mediaRouter(h, storage)

		// Expired 1 hour ago.
		exp := time.Now().Add(-1 * time.Hour).Unix()
		url := signURL(jwtSecret, mediaKey, exp)

		req := httptest.NewRequest(http.MethodGet, url, nil)
		resp := fire(router, req)

		testutil.AssertStatus(t, resp, http.StatusForbidden)
	})

	t.Run("InvalidSig", func(t *testing.T) {
		storage := testutil.NewMockStorage()
		storage.Files[mediaKey] = []byte(fileContent)

		h := NewSavesHandler(&store.QuerierMock{}, &testutil.MockProducer{}, &mockSearcher{}, testutil.NewMockStorage(), 10<<20, jwtSecret)
		router := mediaRouter(h, storage)

		exp := time.Now().Add(1 * time.Hour).Unix()
		// Use a tampered signature.
		url := fmt.Sprintf("/media/%s?sig=%s&exp=%d", mediaKey, "tampered-invalid-sig", exp)

		req := httptest.NewRequest(http.MethodGet, url, nil)
		resp := fire(router, req)

		testutil.AssertStatus(t, resp, http.StatusForbidden)
	})

	t.Run("BearerAuth", func(t *testing.T) {
		storage := testutil.NewMockStorage()
		storage.Files[mediaKey] = []byte(fileContent)

		h := NewSavesHandler(&store.QuerierMock{}, &testutil.MockProducer{}, &mockSearcher{}, testutil.NewMockStorage(), 10<<20, jwtSecret)
		router := mediaRouter(h, storage)

		// No sig/exp params — falls through to bearer path.
		req := httptest.NewRequest(http.MethodGet, "/media/"+mediaKey, nil)
		req = testutil.AuthenticatedRequest(req, userID)

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusOK)

		body := testutil.ReadBody(resp)
		if body != fileContent {
			t.Errorf("expected body %q, got %q", fileContent, body)
		}
	})

	t.Run("WrongUser", func(t *testing.T) {
		storage := testutil.NewMockStorage()
		storage.Files[mediaKey] = []byte(fileContent)

		h := NewSavesHandler(&store.QuerierMock{}, &testutil.MockProducer{}, &mockSearcher{}, testutil.NewMockStorage(), 10<<20, jwtSecret)
		router := mediaRouter(h, storage)

		// Authenticate as a different user.
		req := httptest.NewRequest(http.MethodGet, "/media/"+mediaKey, nil)
		req = testutil.AuthenticatedRequest(req, "different-user")

		resp := fire(router, req)
		testutil.AssertStatus(t, resp, http.StatusForbidden)
	})
}
