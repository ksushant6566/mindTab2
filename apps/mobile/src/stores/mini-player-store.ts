import { create } from "zustand";
import { createAudioPlayer } from "expo-audio";
import type { AudioPlayer } from "expo-audio";

// Inferred from AudioPlayer.addListener so we don't have to import
// EventSubscription out of expo-modules-core (transitive dep, not directly
// listed in package.json).
type StatusSubscription = ReturnType<AudioPlayer["addListener"]>;

type MiniPlayerState = {
  contentId: string | null;
  title: string;
  uri: string | null;
  playing: boolean;

  play: (args: { contentId: string; title: string; uri: string }) => void;
  toggle: () => void;
  stop: () => void;
};

let player: AudioPlayer | null = null;
let statusSubscription: StatusSubscription | null = null;

function disposeSubscription() {
  if (statusSubscription) {
    try {
      statusSubscription.remove();
    } catch {}
    statusSubscription = null;
  }
}

function disposePlayer() {
  disposeSubscription();
  if (player) {
    try {
      player.remove();
    } catch {}
    player = null;
  }
}

export const useMiniPlayerStore = create<MiniPlayerState>((set, get) => ({
  contentId: null,
  title: "",
  uri: null,
  playing: false,

  play: ({ contentId, title, uri }) => {
    disposePlayer();
    const created = createAudioPlayer({ uri });
    player = created;
    // Listen for natural end-of-track. Without this the UI stays stuck on
    // playing: true after the audio finishes. Capture the player reference so
    // a stale finish event from a previous track can't clobber a new one.
    statusSubscription = created.addListener("playbackStatusUpdate", (status) => {
      if (status.didJustFinish && player === created) {
        get().stop();
      }
    });
    created.play();
    set({ contentId, title, uri, playing: true });
  },

  toggle: () => {
    if (!player) return;
    if (get().playing) {
      player.pause();
      set({ playing: false });
    } else {
      player.play();
      set({ playing: true });
    }
  },

  stop: () => {
    disposePlayer();
    set({ contentId: null, title: "", uri: null, playing: false });
  },
}));
