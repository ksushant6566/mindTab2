import { create } from "zustand";
import {
  AudioModule,
  requestRecordingPermissionsAsync,
  RecordingPresets,
} from "expo-audio";
import type { AudioRecorder } from "expo-audio";

type Status = "idle" | "recording" | "paused" | "stopped";

type RecorderState = {
  status: Status;
  startedAt: number | null;
  elapsedMs: number;
  meterLevel: number;
  fileUri: string | null;
  draftId: string | null;
  uploadProgress: number;
  uploadState: "idle" | "uploading" | "done" | "failed";

  start: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<{ fileUri: string; durationSeconds: number } | null>;
  setUploadProgress: (v: number) => void;
  setUploadState: (v: RecorderState["uploadState"]) => void;
  setDraftId: (id: string | null) => void;
  reset: () => void;
};

let recorder: AudioRecorder | null = null;
let tickInterval: ReturnType<typeof setInterval> | null = null;
let meterInterval: ReturnType<typeof setInterval> | null = null;
let pausedAccumMs = 0;
let segmentStartedAt: number | null = null;

export const useRecorderStore = create<RecorderState>((set, get) => ({
  status: "idle",
  startedAt: null,
  elapsedMs: 0,
  meterLevel: 0,
  fileUri: null,
  draftId: null,
  uploadProgress: 0,
  uploadState: "idle",

  start: async () => {
    const granted = await requestRecordingPermissionsAsync();
    if (!granted.granted) throw new Error("microphone-permission-denied");

    const recordingOptions = {
      ...RecordingPresets.HIGH_QUALITY,
      isMeteringEnabled: true,
    };

    recorder = new AudioModule.AudioRecorder(recordingOptions);
    await recorder.prepareToRecordAsync();
    recorder.record();

    pausedAccumMs = 0;
    const now = Date.now();
    segmentStartedAt = now;
    set({ status: "recording", startedAt: now, elapsedMs: 0 });

    tickInterval = setInterval(() => {
      const s = get();
      if (s.status === "recording" && segmentStartedAt) {
        set({ elapsedMs: pausedAccumMs + (Date.now() - segmentStartedAt) });
      }
    }, 250);

    // Poll metering from getStatus()
    meterInterval = setInterval(() => {
      if (!recorder) return;
      const state = recorder.getStatus();
      if (state.metering !== undefined) {
        // expo-audio reports dBFS in roughly [-160, 0]; map to [0, 1] starting at -60dB
        const norm = Math.max(0, Math.min(1, (state.metering + 60) / 60));
        set({ meterLevel: norm });
      }
    }, 150);
  },

  pause: async () => {
    if (!recorder) return;
    recorder.pause();
    if (segmentStartedAt) pausedAccumMs += Date.now() - segmentStartedAt;
    segmentStartedAt = null;
    set({ status: "paused" });
  },

  resume: async () => {
    if (!recorder) return;
    recorder.record();
    segmentStartedAt = Date.now();
    set({ status: "recording" });
  },

  stop: async () => {
    if (!recorder) return null;
    if (segmentStartedAt) pausedAccumMs += Date.now() - segmentStartedAt;
    segmentStartedAt = null;

    if (tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
    if (meterInterval) {
      clearInterval(meterInterval);
      meterInterval = null;
    }

    await recorder.stop();
    const uri = recorder.uri;
    recorder = null;

    const durationMs = pausedAccumMs;
    const durationSeconds = Math.max(1, Math.round(durationMs / 1000));
    set({ status: "stopped", elapsedMs: durationMs, fileUri: uri ?? null });
    return uri ? { fileUri: uri, durationSeconds } : null;
  },

  setUploadProgress: (v) => set({ uploadProgress: v }),
  setUploadState: (v) => set({ uploadState: v }),
  setDraftId: (id) => set({ draftId: id }),

  reset: () => {
    if (tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
    if (meterInterval) {
      clearInterval(meterInterval);
      meterInterval = null;
    }
    recorder = null;
    pausedAccumMs = 0;
    segmentStartedAt = null;
    set({
      status: "idle",
      startedAt: null,
      elapsedMs: 0,
      meterLevel: 0,
      fileUri: null,
      draftId: null,
      uploadProgress: 0,
      uploadState: "idle",
    });
  },
}));
