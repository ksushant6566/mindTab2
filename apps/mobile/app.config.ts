import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "MindTab",
  slug: "mindtab",
  version: "1.0.0",
  scheme: "mindtab",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  splash: {
    backgroundColor: "#0a0a0a",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "in.mindtab.app",
    buildNumber: "1",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#0a0a0a",
    },
    package: "in.mindtab.app",
    versionCode: 1,
  },
  plugins: [
    "expo-asset",
    "expo-router",
    "expo-secure-store",
    [
      "@react-native-google-signin/google-signin",
      {
        iosUrlScheme:
          process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME ||
          "com.googleusercontent.apps.REPLACE_WITH_YOUR_IOS_CLIENT_ID",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
});
