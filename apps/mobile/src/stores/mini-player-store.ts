import { create } from "zustand";
import { createAudioPlayer } from "expo-audio";
import type { AudioPlayer } from "expo-audio";

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

export const useMiniPlayerStore = create<MiniPlayerState>((set, get) => ({
  contentId: null,
  title: "",
  uri: null,
  playing: false,

  play: ({ contentId, title, uri }) => {
    if (player) {
      try {
        player.remove();
      } catch {}
      player = null;
    }
    player = createAudioPlayer({ uri });
    player.play();
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
    if (player) {
      try {
        player.remove();
      } catch {}
      player = null;
    }
    set({ contentId: null, title: "", uri: null, playing: false });
  },
}));
