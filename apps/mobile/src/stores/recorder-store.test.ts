/**
 * NOTE: No test runner is configured in this project (no jest/vitest config,
 * no "test" script in package.json). This file is written for reference and
 * will be activated in a future task when a test runner is wired up.
 *
 * To run these tests, install jest + ts-jest (or vitest) and add a "test" script.
 */

// @ts-nocheck — skip type-checking until runner is wired
import { useRecorderStore } from "./recorder-store";

jest.mock("expo-audio", () => {
  return {
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
    RecordingPresets: { HIGH_QUALITY: {
      extension: ".m4a",
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 128000,
      android: { outputFormat: "mpeg4", audioEncoder: "aac" },
      ios: { audioQuality: 127, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false },
    }},
    AudioModule: {
      AudioRecorder: jest.fn().mockImplementation(() => ({
        prepareToRecordAsync: jest.fn(async () => {}),
        record: jest.fn(() => {}),
        pause: jest.fn(() => {}),
        stop: jest.fn(async () => {}),
        getStatus: jest.fn(() => ({ canRecord: true, isRecording: true, durationMillis: 0, mediaServicesDidReset: false, metering: -30, url: null })),
        get uri() { return "file:///tmp/fake.m4a"; },
      })),
    },
  };
});

beforeEach(() => useRecorderStore.getState().reset());

describe("recorderStore", () => {
  it("transitions idle → recording on start", async () => {
    await useRecorderStore.getState().start();
    expect(useRecorderStore.getState().status).toBe("recording");
  });

  it("pauses and resumes accumulating elapsed time", async () => {
    const s = useRecorderStore.getState();
    await s.start();
    await new Promise((r) => setTimeout(r, 300));
    await s.pause();
    expect(useRecorderStore.getState().status).toBe("paused");
    const elapsedAfterPause = useRecorderStore.getState().elapsedMs;
    await new Promise((r) => setTimeout(r, 200));
    await s.resume();
    expect(useRecorderStore.getState().status).toBe("recording");
    await new Promise((r) => setTimeout(r, 300));
    await s.pause();
    expect(useRecorderStore.getState().elapsedMs).toBeGreaterThan(elapsedAfterPause);
  });

  it("stop returns fileUri and durationSeconds and ends in stopped", async () => {
    const s = useRecorderStore.getState();
    await s.start();
    await new Promise((r) => setTimeout(r, 300));
    const out = await s.stop();
    expect(out?.fileUri).toBe("file:///tmp/fake.m4a");
    expect(out?.durationSeconds).toBeGreaterThanOrEqual(1);
    expect(useRecorderStore.getState().status).toBe("stopped");
  });
});
