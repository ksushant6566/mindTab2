const { withEntitlementsPlist } = require("expo/config-plugins");

function withAppGroupEntitlement(config, appGroup) {
  return withEntitlementsPlist(config, (config) => {
    if (!config.modResults["com.apple.security.application-groups"]) {
      config.modResults["com.apple.security.application-groups"] = [];
    }
    const groups = config.modResults["com.apple.security.application-groups"];
    if (!groups.includes(appGroup)) {
      groups.push(appGroup);
    }
    return config;
  });
}

module.exports = { withAppGroupEntitlement };
