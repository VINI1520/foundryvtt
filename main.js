#!/usr/bin/env node

// Require Node.js v14+
const nodeVer = process.versions.node;
if (nodeVer.split(".").shift() < 16) {
  console.error(`[ERROR] You are using Node.js version ${nodeVer}. Foundry Virtual Tabletop requires Node.js version 16.x or greater.`);
  process.exit(1);
}

/**
 * Bootstrap the Node.js loader to support ESM imports
 * Required until https://github.com/electron/electron/issues/21457#issuecomment-815770296 is resolved
 * @returns {Promise<void>}
 */
(async function() {
  await import("./main.mjs");
})();
