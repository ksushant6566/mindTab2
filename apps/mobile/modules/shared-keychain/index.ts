import { requireNativeModule } from "expo-modules-core";

const SharedKeychainModule = requireNativeModule("SharedKeychain");

const APP_GROUP = "group.in.mindtab.app";

export async function setSharedToken(key: string, value: string): Promise<void> {
  return SharedKeychainModule.setItem(APP_GROUP, key, value);
}

export async function getSharedToken(key: string): Promise<string | null> {
  return SharedKeychainModule.getItem(APP_GROUP, key);
}

export async function removeSharedToken(key: string): Promise<void> {
  return SharedKeychainModule.removeItem(APP_GROUP, key);
}

export async function clearSharedTokens(): Promise<void> {
  return SharedKeychainModule.clear(APP_GROUP);
}
