const { cpSync, existsSync, mkdirSync } = require("node:fs");
const { dirname, resolve } = require("node:path");

function copyIfExists(source, target) {
  if (!existsSync(source)) return;
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
}

const root = resolve(__dirname, "..");
const standaloneDir = resolve(root, ".next", "standalone");

if (!existsSync(resolve(standaloneDir, "server.js"))) {
  console.error("Missing .next/standalone/server.js. Run `npm run build` before `npm start`.");
  process.exit(1);
}

copyIfExists(resolve(root, ".next", "static"), resolve(standaloneDir, ".next", "static"));
copyIfExists(resolve(root, "public"), resolve(standaloneDir, "public"));
