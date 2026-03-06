import { MMKV } from "react-native-mmkv";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

const mmkv = new MMKV({ id: "mindtab-query-cache" });

const mmkvStorage = {
  getItem: (key: string) => mmkv.getString(key) ?? null,
  setItem: (key: string, value: string) => mmkv.set(key, value),
  removeItem: (key: string) => mmkv.delete(key),
};

export const queryPersister = createSyncStoragePersister({
  storage: mmkvStorage,
});
