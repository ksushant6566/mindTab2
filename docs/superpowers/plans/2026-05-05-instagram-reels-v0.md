# Instagram Reels Saves V0 Plan

## Goal

Make Instagram Reels a first-class save source while keeping extraction risk isolated and testable.

## V0 Inputs

- Public Instagram Reel/Post URL through `POST /saves`.
- Uploaded video file through mobile/iOS share flows.

## Non-Goals

- Private Instagram content.
- A shared logged-in Instagram account on the server.
- Accessing Instagram's on-device app cache.
- Guaranteed download for every public Instagram URL.

## Architecture

- `instagram_reel` becomes a first-class `source_type`.
- URL saves classify supported Instagram Reel/Post URLs before the article fallback.
- Uploaded videos use the same content table fields as audio and YouTube:
  - `media_key`
  - `media_mime`
  - `media_file_bytes`
  - `duration_seconds`
- URL extraction uses `yt-dlp` behind an Instagram-specific processor boundary.
- URL downloads reuse `YOUTUBE_VIDEO_QUALITY` / `cfg.YoutubeVideoQuality`.
- Video processing reuses the existing media pipeline:
  - metadata where available
  - download or staged media
  - transcribe
  - extract frames
  - vision
  - summarize
  - embed
  - store

## Acceptance Criteria

- Instagram Reel/Post URLs enqueue `instagram_reel` jobs instead of article jobs.
- Multipart `video` uploads create committed saves with `source_type = instagram_reel`.
- Uploaded video duration is probed server-side and bounded.
- The Instagram URL processor downloads with the same quality ceiling as YouTube.
- Mobile/iOS share extension can accept movie attachments and upload them.
- Vault cards and detail views understand `instagram_reel`.
- Tests cover URL classification, handler behavior, processor wiring, and store behavior.

## Risk Boundary

`yt-dlp` Instagram extraction is best-effort. Failures should mark the save as failed with a useful processing error instead of corrupting content state or blocking other save types.
