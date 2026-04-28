# Saves Feature Roadmap

MindTab Saves is the Vault system for capturing external knowledge and personal media. Users can save articles, images, YouTube videos, and audio recordings; MindTab processes them asynchronously, generates summaries and metadata, embeds them for semantic search, and makes them available to the Vault UI and assistant tools.

This document is the roadmap and current-state overview for the Saves feature. It is not the full API contract, schema reference, or worker implementation manual. For exact endpoint schemas, use `packages/api-spec/openapi.yaml`. For exact database shape, use the migrations. For implementation details, use the server and mobile code.

## Purpose

Saves should make captured content useful without forcing the user to organize it manually.

The feature should:

- Accept common save inputs from mobile and share flows.
- Process saved content in the background.
- Extract text, transcripts, visual descriptions, summaries, tags, and key topics where appropriate.
- Store media safely and expose short-lived media URLs to clients.
- Support semantic search over committed Vault items.
- Give future source types a consistent lifecycle and processing model.

## Phase Status

| Phase | Scope | Status | Summary |
|---|---|---|---|
| Phase 1 | Articles and images | Done | Users can save article URLs and image uploads. Backend processing, storage, embeddings, search, and Vault display exist. |
| Phase 2 | YouTube videos and Shorts | Done | YouTube URLs are detected and processed with metadata extraction, transcript extraction, frame vision, summaries, embeddings, and search. |
| Phase 3 | Audio files and Instagram Reels | Partially done | Audio saves are implemented with recording, upload, review, commit, playback, transcription, summaries, and embeddings. Reels remain. |
| Phase 4 | Provider fallbacks | Partially done | Provider-chain infrastructure exists. Additional concrete LLM, embedding, and transcription fallback providers remain. |
| Phase 5 | Search/storage scale-up | Not done | LLM reranking, R2 storage, signed direct upload, and resumable/chunked upload remain. |

## Current Capabilities

Implemented source types:

- `article`: HTTP/HTTPS URLs that are not classified as YouTube.
- `image`: JPEG, PNG, and WebP uploads.
- `youtube`: YouTube videos and Shorts.
- `audio`: mobile recordings, audio file picker uploads, and iOS share-extension audio.

Implemented user surfaces:

- Mobile Vault tab with type filtering.
- Vault grid cards for article, image, YouTube, and audio saves.
- Vault detail view for saved content.
- Save FAB for URL, image, record-audio, and upload-audio flows.
- Audio review screen for draft recordings.
- Audio playback and mini-player support.
- iOS share extension for URL, image, and audio saves.
- Assistant/tool access through semantic Vault search and save detail lookup.

## Core Concepts

### One Save Model

All source types share the same content table and lifecycle model. Source-specific processors add fields such as transcripts, visual descriptions, video metadata, duration, and media metadata as needed.

The durable media identifier is `media_key`. Client-facing media URLs are derived from it at response time and returned as `media_url`; they are not stored as durable database state.

### Commit Lifecycle

Every save has a user-facing commit state:

- `draft`: created but hidden from normal Vault list/search/count surfaces.
- `committed`: visible in the Vault and searchable.

This lifecycle exists mainly for review-before-save flows, especially audio recordings. Existing URL/image/YouTube save flows default to committed behavior unless a client opts into drafts.

### Processing Lifecycle

Every save also has a processing state:

- `deferred`: no processing job has been started yet.
- `pending`: processing has been queued.
- `processing`: a worker is actively processing it.
- `completed`: processing succeeded.
- `failed`: processing failed.

`commit_status` and `processing_status` are intentionally separate. A draft can be processing, completed, failed, or deferred. A committed save can still be pending or processing.

### Visibility Invariant

Normal user-facing collection surfaces must only show committed saves:

- `GET /saves`
- Vault count/list queries
- Semantic search
- Assistant Vault search tools

Direct detail lookup may return a draft owned by the user because review screens need to poll draft saves before commit.

### Async Processing

Saves are processed by background workers. The API creates a content row, optionally creates a job row, enqueues a small Redis payload, and returns quickly. Workers load source data from the database/storage layer and checkpoint step results so jobs can resume after retry.

### Provider Chains

The provider-chain abstraction exists for LLMs, embeddings, and transcription. Today it has one primary concrete provider for each role:

- LLM/vision: Gemini Flash.
- Embeddings: OpenAI `text-embedding-3-small`.
- Transcription: Groq Whisper.

Phase 4 extends this by adding more concrete providers and configurable ordering.

### Storage

The current storage implementation is local filesystem through a `StorageProvider` interface. The interface exists so R2 and signed direct uploads can land later without rewriting processors.

Media reads use `/media/*` URLs with either signed query parameters or bearer-token validation. Media uploads currently go through the API handler.

## High-Level Architecture

```text
Client / Share Extension
  -> POST /saves
  -> mindmap_content row
  -> optional mindmap_jobs row
  -> Redis queue
  -> worker processor
  -> AI/provider steps
  -> content row updated with extracted data, summary, tags, embedding
  -> Vault / assistant search
```

The important boundaries are:

- API handlers validate input, create rows, store uploaded media, and enqueue work.
- Workers own extraction, transcription, vision, summarization, embedding, retries, and final result storage.
- Storage owns media bytes.
- Search owns query embedding and pgvector ranking.
- OpenAPI owns exact API contract.
- Migrations own exact schema contract.

## Lifecycle Summary

Default save flow:

```text
POST /saves
  -> commit_status = committed
  -> processing_status = pending
  -> job is enqueued
  -> save appears in Vault immediately, usually as processing
```

Draft eager-processing flow:

```text
POST /saves auto_commit=false start_processing=true
  -> commit_status = draft
  -> processing_status = pending
  -> job is enqueued
  -> review screen can poll GET /saves/{id}
  -> POST /saves/{id}/commit makes it visible
```

For audio drafts, the server probes the uploaded file and chooses the eager path
when duration is 60 seconds or less. Longer audio drafts use the deferred path.
The client does not provide authoritative audio duration.

Draft deferred-processing flow:

```text
POST /saves auto_commit=false start_processing=false
  -> commit_status = draft
  -> processing_status = deferred
  -> no job exists yet
  -> POST /saves/{id}/commit flips processing to pending and enqueues work
```

Expired drafts are cleaned up periodically, including their stored media.

## Phase Details

### Phase 1: Articles And Images

Status: Done.

Implemented:

- Article URL saves.
- Image uploads.
- Redis-backed async processing.
- Article extraction through Jina Reader with fallback fetch.
- Image vision/OCR path.
- Summarization, tags, key topics, embeddings.
- Local media storage abstraction.
- pgvector semantic search.
- Vault list/detail/delete/search APIs.
- Mobile Vault grid and image display.

Current notes:

- Image processing now assumes the handler has already stored media before enqueueing.
- Article and image saves default to committed/pending behavior.

### Phase 2: YouTube Videos And Shorts

Status: Done.

Implemented:

- YouTube URL detection.
- YouTube metadata extraction through `yt-dlp`.
- Duration limit enforcement.
- Video download for processing.
- Caption-first transcript extraction.
- Groq Whisper fallback transcription.
- ffmpeg frame extraction.
- Vision over selected frames.
- Summary, tags, key topics, embeddings.
- YouTube duration, thumbnail, channel, and transcript-source metadata.
- Mobile display for YouTube saves.

Current notes:

- YouTube processing depends on `GROQ_API_KEY`, `yt-dlp`, and `ffmpeg`.
- Temporary video/frame files are cleaned after processing and on startup for orphaned temp directories.

### Phase 3: Audio And Reels

Status: Partially done.

Audio implemented:

- Record audio from mobile.
- Upload audio files from mobile.
- Save audio through the iOS share extension.
- Draft review screen with Save and Discard.
- Short recordings can process eagerly while still in draft.
- Long recordings can defer processing until commit.
- Audio duration is probed server-side and stored as `duration_seconds`.
- Audio transcription through Groq Whisper.
- Large-audio chunking through ffmpeg.
- Audio-specific summarization and generated title support.
- Audio embeddings and Vault search.
- Audio cards, detail view, playback, and mini-player support.
- Draft cleanup for abandoned audio drafts.

Audio known gaps:

- Android share-intent audio is not implemented.
- Web and Chrome extension audio save flows are not implemented.
- Speaker diarization, timestamped transcript navigation, chaptering, trim handles, and waveform editing are out of scope for this phase.

Reels remaining:

- Define accepted Reels URL/input formats.
- Add source classification for Reels.
- Add a Reels processor.
- Reuse the generic duration/media columns where possible.
- Reuse YouTube/audio patterns for download, transcription, frame extraction, vision, summary, embedding, and storage.
- Add mobile card/detail behavior.
- Add API, handler, processor, and integration coverage.

### Phase 4: Provider Fallbacks

Status: Partially done.

Implemented:

- Generic provider chain abstraction.
- Retriable vs permanent error classification.
- Chain execution pattern for LLM, embedding, and transcription roles.

Remaining:

- Add additional LLM providers, likely Claude and OpenAI.
- Add additional embedding providers, likely Voyage and/or Mistral.
- Add transcription fallback providers beyond Groq Whisper.
- Make provider ordering configurable.
- Add operational guidance for provider outage behavior.
- Add tests for multi-provider fallback behavior using concrete provider adapters.

### Phase 5: Search And Storage Scale-Up

Status: Not done.

Search remaining:

- Add optional LLM reranking after pgvector retrieval.
- Decide when reranking is worth the latency/cost.
- Define assistant-facing result shape if reranking adds explanations or snippets.

Storage remaining:

- Add R2-backed storage provider.
- Add signed direct upload flow.
- Add resumable/chunked upload flow for large media.
- Decide migration path from synchronous handler uploads to direct uploads.
- Update mobile and share-extension upload flows when signed uploads land.

## API Surface Summary

The exact API contract lives in `packages/api-spec/openapi.yaml`. At roadmap level, the Saves API consists of:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/saves` | Create article, image, YouTube, or audio save. |
| `GET` | `/saves` | List committed saves. |
| `GET` | `/saves/{id}` | Get one owned save, including drafts for review flows. |
| `DELETE` | `/saves/{id}` | Soft-delete a save. |
| `POST` | `/saves/{id}/commit` | Commit a draft and enqueue processing if deferred. |
| `POST` | `/saves/search` | Semantic search over committed saves. |
| `GET` | `/media/*` | Serve stored media through signed URL or bearer-token auth. |

Important API-level decisions:

- `POST /saves` is polymorphic: JSON for URL saves, multipart for media saves.
- `media_url` is the only client-facing media URL field.
- List/search surfaces exclude drafts.
- Detail lookup may return drafts owned by the current user.

## Current Gaps

- Reels are not implemented.
- Phase 4 fallback providers are not implemented beyond chain infrastructure.
- Phase 5 reranking and R2/signed upload are not implemented.
- Android audio share intent is not implemented.
- Web and Chrome extension audio saves are not implemented.
- Exact API behavior should continue to be kept in OpenAPI rather than duplicated here.
- Exact schema behavior should continue to be kept in migrations rather than duplicated here.

## Next Recommended Work

1. Implement Reels as the second half of Phase 3.
2. Add at least one fallback provider per provider category, starting with the highest operational risk.
3. Design R2 signed uploads before increasing large-media usage.
4. Evaluate LLM reranking after the Vault has enough real saved-content volume to judge search quality.
