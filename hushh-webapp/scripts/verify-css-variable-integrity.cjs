/* eslint-disable no-console */
/**
 * verify-css-variable-integrity.cjs
 *
 * Fails when CSS custom property references use undefined variables.
 *
 * Notes:
 * - Supports var(--token) references in CSS/TS/TSX/HTML.
 * - Treats style object definitions like {"--token": "..."} as valid definitions.
 * - Treats next/font variable declarations like variable: "--token" as runtime definitions.
 */

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const SCANNED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".css",
  ".html",
  ".mjs",
  ".cjs",
]);

const EXCLUDED_PATH_PATTERNS = [
  "/node_modules/",
  "public/hushh-logo-new.svg",
];

const ALLOWED_DYNAMIC_VARIABLES = new Set([
  // Base UI / floating anchor runtime vars
  "anchor-width",
  "available-height",
  "available-width",
  "transform-origin",
  // Radix runtime vars
  "radix-select-trigger-height",
  "radix-select-trigger-width",
  "radix-accordion-content-height",
]);

const ALLOWED_DYNAMIC_PREFIXES = [
  // ChartContainer emits --color-* dynamically from chart config keys.
  "color-",
];

function getTrackedFiles() {
  try {
    return execSync("git ls-files", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString("utf8")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function shouldScanFile(relPath) {
  const ext = path.extname(relPath);
  if (!SCANNED_EXTENSIONS.has(ext)) return false;
  for (const pattern of EXCLUDED_PATH_PATTERNS) {
    if (relPath.includes(pattern)) return false;
  }
  return true;
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.code === "ENOTDIR")) {
      return null;
    }
    throw err;
  }
}

function isAllowedDynamicVariable(name) {
  if (ALLOWED_DYNAMIC_VARIABLES.has(name)) return true;
  return ALLOWED_DYNAMIC_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function main() {
  const files = getTrackedFiles();
  if (!files.length) {
    console.error(
      "ERROR: verify-css-variable-integrity: no git-tracked files found (run from repo root)."
    );
    process.exit(2);
  }

  const definitions = new Set();
  const references = new Map(); // token -> Set<file:line>
  const warnings = [];

  const definitionRegex = /--([A-Za-z0-9_-]+)(?:"|')?\s*:/g;
  const referenceRegex = /var\(--([A-Za-z0-9_-]+)\)/g;
  const nextFontVariableRegex = /variable\s*:\s*["']--([A-Za-z0-9_-]+)["']/g;

  for (const relPath of files) {
    if (!shouldScanFile(relPath)) continue;
    const text = readText(relPath);
    if (text === null) {
      warnings.push(`${relPath}: missing from working tree (skipped)`);
      continue;
    }

    // Definitions from CSS / inline style object keys
    let match;
    while ((match = definitionRegex.exec(text)) !== null) {
      definitions.add(match[1]);
    }

    // Definitions from next/font variable declarations
    while ((match = nextFontVariableRegex.exec(text)) !== null) {
      definitions.add(match[1]);
    }

    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      let lineMatch;
      while ((lineMatch = referenceRegex.exec(line)) !== null) {
        const token = lineMatch[1];
        if (!references.has(token)) references.set(token, new Set());
        references.get(token).add(`${relPath}:${i + 1}`);
      }
      referenceRegex.lastIndex = 0;
    }
  }

  const missing = [];
  for (const [token, locations] of references.entries()) {
    if (definitions.has(token)) continue;
    if (isAllowedDynamicVariable(token)) continue;
    missing.push({ token, locations: Array.from(locations).sort() });
  }
  missing.sort((a, b) => a.token.localeCompare(b.token));

  if (warnings.length) {
    console.warn("\n[verify:css-vars] WARNINGS");
    for (const warning of warnings.slice(0, 30)) {
      console.warn(`- ${warning}`);
    }
    if (warnings.length > 30) {
      console.warn(`- ... (${warnings.length - 30} more warnings not shown)`);
    }
  }

  if (missing.length) {
    console.error("\n[verify:css-vars] FAILURES");
    for (const { token, locations } of missing) {
      console.error(`- --${token} is referenced but never defined`);
      for (const location of locations.slice(0, 5)) {
        console.error(`  -> ${location}`);
      }
      if (locations.length > 5) {
        console.error(`  -> ... (${locations.length - 5} more references)`);
      }
    }
    process.exit(1);
  }

  console.log("\nOK: css variable integrity verified");
}

main();
