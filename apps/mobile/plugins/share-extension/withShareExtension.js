const {
  withXcodeProject,
  withInfoPlist,
  IOSConfig,
} = require("expo/config-plugins");
const path = require("path");
const fs = require("fs");

function withShareExtension(config, options) {
  const { extensionName, extensionBundleId, appGroup } = options;

  // Add the extension target to the Xcode project
  config = withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const platformProjectRoot = config.modRequest.platformProjectRoot;
    const swiftSourceDir = path.resolve(
      __dirname,
      "swift"
    );

    // Create extension directory in ios/
    const extensionDir = path.join(platformProjectRoot, extensionName);
    if (!fs.existsSync(extensionDir)) {
      fs.mkdirSync(extensionDir, { recursive: true });
    }

    // Copy Swift source files
    const swiftFiles = [
      "ShareViewController.swift",
      "ShareView.swift",
      "APIClient.swift",
      "KeychainHelper.swift",
    ];

    for (const file of swiftFiles) {
      const src = path.join(swiftSourceDir, file);
      const dest = path.join(extensionDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    }

    // Copy and configure Info.plist
    const infoPlistSrc = path.join(swiftSourceDir, "Info.plist");
    const infoPlistDest = path.join(extensionDir, "Info.plist");
    if (fs.existsSync(infoPlistSrc)) {
      fs.copyFileSync(infoPlistSrc, infoPlistDest);
    }

    // Create entitlements file for the extension
    const entitlementsContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>${appGroup}</string>
    </array>
</dict>
</plist>`;
    const entitlementsPath = path.join(
      extensionDir,
      `${extensionName}.entitlements`
    );
    fs.writeFileSync(entitlementsPath, entitlementsContent);

    // Check if extension target already exists
    const existingTarget = xcodeProject.pbxTargetByName(extensionName);
    if (existingTarget) {
      return config;
    }

    // Add share extension target
    const target = xcodeProject.addTarget(
      extensionName,
      "app_extension",
      extensionName,
      extensionBundleId
    );

    // Add source files to the extension target
    const groupName = extensionName;
    const group = xcodeProject.addPbxGroup(
      [
        ...swiftFiles,
        "Info.plist",
        `${extensionName}.entitlements`,
      ],
      groupName,
      extensionName
    );

    // Add group to main project group
    const mainGroupId = xcodeProject.getFirstProject().firstProject.mainGroup;
    xcodeProject.addToPbxGroup(group.uuid, mainGroupId);

    // Add Swift source files to the target's build phase
    for (const file of swiftFiles) {
      xcodeProject.addSourceFile(
        `${extensionName}/${file}`,
        { target: target.uuid },
        group.uuid
      );
    }

    // Configure build settings for the extension target
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      const config = configurations[key];
      if (
        config.buildSettings &&
        config.buildSettings.PRODUCT_NAME === `"${extensionName}"`
      ) {
        config.buildSettings.SWIFT_VERSION = "5.0";
        config.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
        config.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = "15.1";
        config.buildSettings.CODE_SIGN_ENTITLEMENTS = `${extensionName}/${extensionName}.entitlements`;
        config.buildSettings.INFOPLIST_FILE = `${extensionName}/Info.plist`;
        config.buildSettings.CODE_SIGN_STYLE = "Automatic";
        config.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = `"${extensionBundleId}"`;
        // Inherit the development team from the main target
        config.buildSettings.DEVELOPMENT_TEAM = '"$(DEVELOPMENT_TEAM)"';
      }
    }

    return config;
  });

  // Inject API_BASE_URL into main app Info.plist so the extension can read it
  config = withInfoPlist(config, (config) => {
    config.modResults.API_BASE_URL =
      process.env.EXPO_PUBLIC_API_URL || "https://api.mindtab.in";
    return config;
  });

  return config;
}

module.exports = { withShareExtension };
