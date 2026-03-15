#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const webRoot = path.resolve(__dirname, "..");
const iosPath = path.join(webRoot, "ios", "App", "App", "GoogleService-Info.plist");
const androidPath = path.join(webRoot, "android", "app", "google-services.json");
const requireProdArtifacts = String(process.env.REQUIRE_PROD_FIREBASE_ARTIFACTS || "false").toLowerCase() === "true";

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`OK: ${message}`);
}

function mustRead(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing required file: ${filePath}`);
    return "";
  }
  return fs.readFileSync(filePath, "utf8");
}

function parseIosAnalyticsEnabled(plistText) {
  const regex = /<key>IS_ANALYTICS_ENABLED<\/key>\s*<(true|false)(?:\s*\/>|><\/\1>)/m;
  const match = plistText.match(regex);
  if (!match) return null;
  return match[1] === "true";
}

function parseAndroidHasAnalyticsService(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    fail(`Invalid JSON in google-services.json: ${String(error)}`);
    return null;
  }

  const clients = Array.isArray(parsed.client) ? parsed.client : [];
  return clients.some((client) => client?.services?.analytics_service != null);
}

function main() {
  const iosText = mustRead(iosPath);
  const androidText = mustRead(androidPath);

  const iosAnalyticsEnabled = parseIosAnalyticsEnabled(iosText);
  if (iosAnalyticsEnabled === null) {
    fail("Could not parse IS_ANALYTICS_ENABLED from GoogleService-Info.plist");
  }

  const androidHasAnalyticsService = parseAndroidHasAnalyticsService(androidText);
  if (androidHasAnalyticsService === null) {
    return;
  }

  console.log(`Mobile Firebase mode: ${requireProdArtifacts ? "release" : "template"}`);
  console.log(`iOS IS_ANALYTICS_ENABLED=${iosAnalyticsEnabled}`);
  console.log(`Android analytics_service_present=${androidHasAnalyticsService}`);

  if (requireProdArtifacts) {
    if (!iosAnalyticsEnabled) {
      fail("Release mode requires iOS IS_ANALYTICS_ENABLED=true in GoogleService-Info.plist");
    }
    if (!androidHasAnalyticsService) {
      fail("Release mode requires android services.analytics_service in google-services.json");
    }
    if (!process.exitCode) {
      ok("Release mobile Firebase artifacts look valid for analytics-enabled native builds");
    }
    return;
  }

  if (iosAnalyticsEnabled) {
    fail("Template mode expects iOS IS_ANALYTICS_ENABLED=false (avoid committing production artifacts)");
  }
  if (androidHasAnalyticsService) {
    fail("Template mode expects no android analytics_service (avoid committing production artifacts)");
  }

  if (!process.exitCode) {
    ok("Template mobile Firebase artifacts are in safe committed state");
  }
}

main();
