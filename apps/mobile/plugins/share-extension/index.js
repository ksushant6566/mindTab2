const { withAppGroupEntitlement } = require("./withAppGroupEntitlement");
const { withShareExtension } = require("./withShareExtension");

const APP_GROUP = "group.in.mindtab.app";
const EXTENSION_NAME = "MindTabShare";
const EXTENSION_BUNDLE_ID = "in.mindtab.app.share";

function withMindTabShareExtension(config) {
  config = withAppGroupEntitlement(config, APP_GROUP);
  config = withShareExtension(config, {
    extensionName: EXTENSION_NAME,
    extensionBundleId: EXTENSION_BUNDLE_ID,
    appGroup: APP_GROUP,
  });
  return config;
}

module.exports = withMindTabShareExtension;
