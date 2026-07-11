// Post-copy patch: re-add custom native plugins that `npx cap copy` strips.
//
// Capacitor 8 registers native plugins ONLY from `packageClassList` in the
// bundled ios/App/App/capacitor.config.json (CapacitorBridge.registerPlugins()
// -> NSClassFromString). `cap copy` regenerates that list fresh from installed
// npm packages and drops any app-target Swift plugins (like WidgetBridgePlugin).
// This script re-injects them after every copy so the bridge can find them.

const fs = require('fs');
const path = require('path');

const CUSTOM_PLUGINS = ['WidgetBridgePlugin'];
const CONFIG_PATH = path.join(
  __dirname,
  '..',
  'ios',
  'App',
  'App',
  'capacitor.config.json'
);

if (!fs.existsSync(CONFIG_PATH)) {
  console.error('patch-cap-config: bundled config not found at', CONFIG_PATH);
  process.exit(0); // don't fail the build; nothing to patch yet
}

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const list = Array.isArray(config.packageClassList)
  ? config.packageClassList
  : [];

let added = 0;
for (const plugin of CUSTOM_PLUGINS) {
  if (!list.includes(plugin)) {
    list.push(plugin);
    added++;
  }
}
config.packageClassList = list;

fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
console.log(
  `patch-cap-config: ${added} custom plugin(s) re-added -> [${list.join(', ')}]`
);
