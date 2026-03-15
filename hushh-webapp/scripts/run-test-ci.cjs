#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = process.cwd();
const manifestPath = path.join(projectRoot, "scripts", "test-ci.manifest.txt");

if (!fs.existsSync(manifestPath)) {
  console.error(`Missing CI test manifest: ${manifestPath}`);
  process.exit(1);
}

const tests = fs
  .readFileSync(manifestPath, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

if (tests.length === 0) {
  console.error("CI test manifest is empty. Add at least one test file.");
  process.exit(1);
}

const missing = tests.filter((testFile) => !fs.existsSync(path.join(projectRoot, testFile)));
if (missing.length > 0) {
  console.error("CI test manifest references missing files:");
  for (const file of missing) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

const vitestArgs = ["vitest", "run", ...tests];
const result = spawnSync("npx", vitestArgs, {
  cwd: projectRoot,
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
