#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");

const LEGACY_ROUTE_TOKENS = [
  "/agent-nav",
  "/dashboard/kai",
  "/dashboard/domain",
  "/dashboard/agent-nav",
  "/onboarding/preferences",
];

const UNRESOLVED_MARKERS = [
  /\bTODO\b/,
  /\bTBD\b/,
  /\bPLACEHOLDER\b/,
  /PENDING LEGAL FINALIZATION/,
];

const SPECULATIVE_PATTERNS = [
  /\bPlanned\b/i,
  /Future Implementation/i,
];

const OPERATIONAL_DOC_TARGETS = [
  "docs/reference",
  "docs/guides",
  "docs/project_context_map.md",
  "consent-protocol/docs/reference",
  "hushh-webapp/docs",
];

const FIRST_PARTY_DOC_TARGETS = [
  "docs",
  "consent-protocol/docs",
  "hushh-webapp/docs",
];

const DOC_EXCLUDES = [
  "docs/audits/",
  "docs/archives/",
];

const GENERATED_ARTIFACT_DIRS = [
  "hushh-webapp/ios/App/DerivedData",
  "hushh-webapp/ios/build/SourcePackages",
];

const REQUIRED_CANONICAL_ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  KAI_HOME: "/kai",
  KAI_ONBOARDING: "/kai/onboarding",
  KAI_IMPORT: "/kai/import",
  KAI_DASHBOARD: "/kai/dashboard",
};

const REQUIRED_OPERATIONAL_MARKERS = [
  {
    file: "docs/reference/architecture/api-contracts.md",
    patterns: [
      "/api/kai/market/insights/{user_id}",
      "layout_version",
      "meta.symbol_quality",
      "meta.filtered_symbols",
      "short_recommendation",
      "analysis_degraded",
      "degraded_agents",
    ],
  },
  {
    file: "docs/reference/streaming/streaming-contract.md",
    patterns: [
      "\"event\": \"decision\"",
      "short_recommendation",
      "analysis_degraded",
      "degraded_agents",
      "analysis_mode",
    ],
  },
];

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`OK: ${message}`);
}

function exists(repoRelativePath) {
  return fs.existsSync(path.join(repoRoot, repoRelativePath));
}

function read(repoRelativePath) {
  return fs.readFileSync(path.join(repoRoot, repoRelativePath), "utf8");
}

function normalize(p) {
  return p.replace(/\\/g, "/");
}

function shouldExcludeDoc(repoRelativePath) {
  const normalized = normalize(repoRelativePath);
  return DOC_EXCLUDES.some((prefix) => normalized.startsWith(prefix));
}

function listMarkdownFromTarget(target) {
  const full = path.join(repoRoot, target);
  if (!fs.existsSync(full)) return [];

  const stat = fs.statSync(full);
  if (stat.isFile()) {
    return target.endsWith(".md") && !shouldExcludeDoc(target) ? [target] : [];
  }

  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const child = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(child);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const rel = normalize(path.relative(repoRoot, child));
      if (!shouldExcludeDoc(rel)) out.push(rel);
    }
  };

  walk(full);
  return out;
}

function unique(list) {
  return [...new Set(list)];
}

function collectDocs(targets) {
  return unique(targets.flatMap((target) => listMarkdownFromTarget(target))).sort();
}

function scanLegacyRoutesInOperationalDocs(files) {
  const offenders = [];
  for (const file of files) {
    const src = read(file);
    for (const token of LEGACY_ROUTE_TOKENS) {
      if (src.includes(token)) offenders.push(`${file}: contains legacy route token ${token}`);
    }
  }
  if (offenders.length) {
    fail(`Legacy route tokens found in operational docs:\n${offenders.map((x) => `- ${x}`).join("\n")}`);
  } else {
    ok("Operational docs contain no legacy route tokens");
  }
}

function scanUnresolvedMarkers(files) {
  const offenders = [];
  for (const file of files) {
    const src = read(file);
    for (const pattern of UNRESOLVED_MARKERS) {
      if (pattern.test(src)) offenders.push(`${file}: matches ${pattern}`);
    }
  }
  if (offenders.length) {
    fail(`Unresolved markers found in first-party docs:\n${offenders.map((x) => `- ${x}`).join("\n")}`);
  } else {
    ok("First-party docs contain no unresolved markers");
  }
}

function scanSpeculativeOperationalContent(files) {
  const offenders = [];
  for (const file of files) {
    const src = read(file);
    for (const pattern of SPECULATIVE_PATTERNS) {
      if (pattern.test(src)) offenders.push(`${file}: matches ${pattern}`);
    }
  }
  if (offenders.length) {
    fail(`Speculative phrasing found in operational docs:\n${offenders.map((x) => `- ${x}`).join("\n")}`);
  } else {
    ok("Operational docs contain no speculative roadmap phrasing");
  }
}

function looksLikePath(token) {
  if (!token.includes("/")) return false;
  if (token.includes(" ")) return false;
  if (/^[a-zA-Z]+:\/\//.test(token)) return false;
  if (token.startsWith("#")) return false;
  if (token.startsWith("/")) return false; // route paths handled separately
  if (token.includes("{") || token.includes("}")) return false;
  if (token.includes("...")) return false;
  return true;
}

function isLocalEnvReference(token) {
  const cleaned = token.replace(/[),.;:]+$/g, "");
  return /(^|\/)\.env(\.[A-Za-z0-9_-]+)?$/.test(cleaned);
}

function resolveDocPathReference(file, token) {
  const cleaned = token.replace(/[),.;:]+$/g, "");
  const candidates = [];

  if (cleaned.startsWith("./") || cleaned.startsWith("../")) {
    candidates.push(
      normalize(path.relative(repoRoot, path.resolve(path.dirname(path.join(repoRoot, file)), cleaned)))
    );
    if (cleaned.startsWith("./")) {
      candidates.push(normalize(cleaned.slice(2)));
    }
    return candidates;
  }

  const rootPrefixed = ["hushh-webapp/", "consent-protocol/", "docs/", "scripts/", "data/", "deploy/"];
  if (rootPrefixed.some((prefix) => cleaned.startsWith(prefix))) {
    candidates.push(normalize(cleaned));
    return candidates;
  }

  return [];
}

function verifyDocPathReferences(files) {
  const offenders = [];

  for (const file of files) {
    const src = read(file);
    const matches = src.matchAll(/`([^`\n]+)`/g);

    for (const match of matches) {
      const token = match[1].trim();
      if (!looksLikePath(token)) continue;
      if (token.includes("*")) continue;
      if (isLocalEnvReference(token)) continue;

      const resolved = resolveDocPathReference(file, token);
      if (resolved.length === 0) continue;

      if (!resolved.some((candidate) => exists(candidate))) {
        offenders.push(`${file}: unresolved path reference \`${token}\` -> ${resolved.join(" OR ")}`);
      }
    }
  }

  if (offenders.length) {
    fail(`Unresolved doc path references found:\n${offenders.map((x) => `- ${x}`).join("\n")}`);
  } else {
    ok("Operational doc path references resolve on disk");
  }
}

function parseRoutesContract() {
  const src = read("hushh-webapp/lib/navigation/routes.ts");
  const routes = {};
  for (const match of src.matchAll(/\s+([A-Z_]+):\s*"([^"]+)"/g)) {
    routes[match[1]] = match[2];
  }
  return routes;
}

function verifyCanonicalRouteContract(operationalDocs) {
  const routes = parseRoutesContract();

  for (const [key, expected] of Object.entries(REQUIRED_CANONICAL_ROUTES)) {
    if (routes[key] !== expected) {
      fail(`hushh-webapp/lib/navigation/routes.ts mismatch for ${key}: expected ${expected}, found ${routes[key] ?? "<missing>"}`);
    }
  }

  if ("ONBOARDING_PREFERENCES_LEGACY" in routes) {
    fail("Legacy route key ONBOARDING_PREFERENCES_LEGACY must be removed from route contract");
  }

  const docsBody = operationalDocs.map((file) => read(file)).join("\n");
  for (const route of Object.values(REQUIRED_CANONICAL_ROUTES)) {
    if (!docsBody.includes(route)) {
      fail(`Operational docs missing canonical route reference: ${route}`);
    }
  }

  if (!process.exitCode) ok("Canonical route contract matches docs + runtime source");
}

function verifyNoGeneratedArtifacts() {
  const offenders = [];

  for (const dir of GENERATED_ARTIFACT_DIRS) {
    try {
      const tracked = execSync(`git ls-files -- "${dir}"`, {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "ignore"],
        encoding: "utf8",
      })
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (tracked.length > 0) {
        offenders.push(`${dir} (tracked files present)`);
      }
    } catch {
      // ignore git invocation failures and continue best-effort checks
    }
  }

  if (offenders.length) {
    fail(`Generated native artifact trees must not be tracked:\n${offenders.map((x) => `- ${x}`).join("\n")}`);
  } else {
    ok("No generated iOS artifact doc/build trees are tracked");
  }
}

function verifyRequiredOperationalMarkers() {
  const offenders = [];

  for (const rule of REQUIRED_OPERATIONAL_MARKERS) {
    if (!exists(rule.file)) {
      offenders.push(`${rule.file}: file missing`);
      continue;
    }
    const src = read(rule.file);
    for (const marker of rule.patterns) {
      if (!src.includes(marker)) {
        offenders.push(`${rule.file}: missing marker "${marker}"`);
      }
    }
  }

  if (offenders.length) {
    fail(`Required operational contract markers missing:\n${offenders.map((x) => `- ${x}`).join("\n")}`);
  } else {
    ok("Operational docs include current Kai market + stream contract markers");
  }
}

function main() {
  const operationalDocs = collectDocs(OPERATIONAL_DOC_TARGETS);
  const firstPartyDocs = collectDocs(FIRST_PARTY_DOC_TARGETS);

  if (operationalDocs.length === 0) {
    fail("No operational docs were discovered to verify");
  }
  if (firstPartyDocs.length === 0) {
    fail("No first-party docs were discovered to verify");
  }

  scanLegacyRoutesInOperationalDocs(operationalDocs);
  scanUnresolvedMarkers(firstPartyDocs);
  scanSpeculativeOperationalContent(operationalDocs);
  verifyDocPathReferences(operationalDocs);
  verifyCanonicalRouteContract(operationalDocs);
  verifyRequiredOperationalMarkers();
  verifyNoGeneratedArtifacts();

  if (process.exitCode) {
    console.error("\nDocs/runtime parity verification FAILED");
    process.exit(1);
  }

  console.log("\nDocs/runtime parity verification PASSED");
}

main();
