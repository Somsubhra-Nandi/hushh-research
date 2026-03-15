/* eslint-disable no-console */
/**
 * verify-design-system-usage.cjs
 *
 * Frontend design-system guardrails for stock shadcn + Morphy extensions:
 * - `components/ui/*` must remain registry-backed files only
 * - no stale imports from moved custom files under `components/ui/*`
 * - no direct sonner usage outside approved infra files
 * - baseline hygiene checks for deprecated tokens/classes
 */

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const webappRoot = path.resolve(__dirname, "..");
const repoRoot = execSync("git rev-parse --show-toplevel", {
  cwd: webappRoot,
  stdio: ["ignore", "pipe", "ignore"],
})
  .toString("utf8")
  .trim();

const webappPrefix = path
  .relative(repoRoot, webappRoot)
  .split(path.sep)
  .join("/");

const REGISTRY_UI_FILES = new Set([
  "accordion.tsx",
  "alert-dialog.tsx",
  "alert.tsx",
  "avatar.tsx",
  "badge.tsx",
  "breadcrumb.tsx",
  "button.tsx",
  "card.tsx",
  "carousel.tsx",
  "chart.tsx",
  "checkbox.tsx",
  "collapsible.tsx",
  "combobox.tsx",
  "command.tsx",
  "dialog.tsx",
  "drawer.tsx",
  "dropdown-menu.tsx",
  "input-group.tsx",
  "input.tsx",
  "kbd.tsx",
  "label.tsx",
  "pagination.tsx",
  "popover.tsx",
  "progress.tsx",
  "radio-group.tsx",
  "scroll-area.tsx",
  "select.tsx",
  "separator.tsx",
  "sheet.tsx",
  "sidebar.tsx",
  "skeleton.tsx",
  "sonner.tsx",
  "spinner.tsx",
  "switch.tsx",
  "table.tsx",
  "tabs.tsx",
  "textarea.tsx",
  "tooltip.tsx",
]);

const SONNER_IMPORT_ALLOWLIST = new Set([
  "app/profile/page.tsx",
  "app/kai/onboarding/page.tsx",
  "app/consents/page.tsx",
  "lib/services/auth-service.ts",
  "lib/consent/use-consent-actions.ts",
  "lib/utils/native-download.ts",
  "components/consent/notification-provider.tsx",
  "components/vault/vault-method-prompt.tsx",
  "components/kai/onboarding/KaiPreferencesSheet.tsx",
  "components/kai/kai-flow.tsx",
  "components/kai/views/kai-mock-sonner-notice.tsx",
  "components/kai/views/manage-portfolio-view.tsx",
  "components/kai/views/stock-search.tsx",
  "components/kai/views/dashboard-view.tsx",
  "components/kai/views/dashboard-master-view.tsx",
  "components/kai/views/analysis-history-dashboard.tsx",
  "components/kai/debate-stream-view.tsx",
  "components/app-ui/top-app-bar.tsx",
]);

const STALE_UI_IMPORTS = [
  "@/components/ui/data-table",
  "@/components/ui/gradient-text",
  "@/components/ui/hushh-loader",
  "@/components/ui/hushh-logo-icon",
  "@/components/ui/step-progress-bar",
  "@/components/ui/top-app-bar",
];

function getRepoTrackedFiles() {
  const out = execSync("git -C \"" + repoRoot + "\" ls-files", {
    stdio: ["ignore", "pipe", "ignore"],
  })
    .toString("utf8")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return out;
}

function toWebappRelPath(repoRelPath) {
  if (!webappPrefix || webappPrefix === ".") {
    return repoRelPath;
  }
  if (!repoRelPath.startsWith(webappPrefix + "/")) {
    return null;
  }
  return repoRelPath.slice(webappPrefix.length + 1);
}

function isTsLike(relPath) {
  return relPath.endsWith(".ts") || relPath.endsWith(".tsx");
}

function readWebappFile(relPath) {
  try {
    return fs.readFileSync(path.join(webappRoot, relPath), "utf8");
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.code === "ENOTDIR")) {
      return null;
    }
    throw err;
  }
}

function verifyComponentsUiPurity(failFindings) {
  const uiDir = path.join(webappRoot, "components/ui");
  if (!fs.existsSync(uiDir)) {
    failFindings.push("components/ui directory missing");
    return;
  }

  const uiEntries = fs.readdirSync(uiDir, { withFileTypes: true });
  for (const entry of uiEntries) {
    if (!entry.isFile()) {
      failFindings.push(
        `components/ui/${entry.name}: nested directories are not allowed in registry-owned folder`
      );
      continue;
    }

    if (!entry.name.endsWith(".tsx")) {
      failFindings.push(
        `components/ui/${entry.name}: non-TSX file found in registry-owned folder`
      );
      continue;
    }

    if (!REGISTRY_UI_FILES.has(entry.name)) {
      failFindings.push(
        `components/ui/${entry.name}: non-registry component detected in components/ui`
      );
    }
  }

  for (const fileName of REGISTRY_UI_FILES) {
    const target = path.join(uiDir, fileName);
    if (!fs.existsSync(target)) {
      failFindings.push(`components/ui/${fileName}: required registry-backed file missing`);
    }
  }
}

function verifySourceUsage(failFindings, warnFindings) {
  const repoTracked = getRepoTrackedFiles();

  for (const repoRel of repoTracked) {
    const rel = toWebappRelPath(repoRel);
    if (!rel || !isTsLike(rel)) continue;

    if (rel.startsWith("components/ui/")) continue;

    const text = readWebappFile(rel);
    if (text === null) {
      warnFindings.push(`${rel}: missing from working tree (skipped)`);
      continue;
    }

    if (text.includes("crystal-")) {
      failFindings.push(`${rel}: contains legacy class prefix 'crystal-'`);
    }
    if (text.includes("rounded-ios")) {
      failFindings.push(`${rel}: contains legacy class prefix 'rounded-ios'`);
    }
    if (text.includes("font-heading-exo2")) {
      failFindings.push(`${rel}: contains legacy typography class 'font-heading-exo2'`);
    }
    if (text.includes("font-body-quicksand")) {
      failFindings.push(`${rel}: contains legacy typography class 'font-body-quicksand'`);
    }
    if (
      text.includes("--font-geist-sans") ||
      text.includes("--font-geist-mono") ||
      text.includes("--font-heading-sans")
    ) {
      failFindings.push(
        `${rel}: contains legacy font variable (use --font-app-body/--font-app-heading/--font-app-mono)`
      );
    }

    for (const staleImport of STALE_UI_IMPORTS) {
      if (text.includes(staleImport)) {
        failFindings.push(
          `${rel}: stale import '${staleImport}' found (custom app UI moved out of components/ui)`
        );
      }
    }

    const importsSonner =
      text.includes('from "sonner"') || text.includes("from 'sonner'");
    const isSonnerInfra =
      rel === "components/ui/sonner.tsx" ||
      rel === "lib/morphy-ux/toast-utils.tsx";

    if (importsSonner && !isSonnerInfra && !SONNER_IMPORT_ALLOWLIST.has(rel)) {
      failFindings.push(
        `${rel}: direct Sonner import detected (use morphyToast unless file is in Sonner allowlist)`
      );
    }

    const hasInlineStyleFontFamily =
      /style\s*=\s*\{\{[\s\S]*?fontFamily\s*:/m.test(text);
    if (
      hasInlineStyleFontFamily &&
      rel !== "app/layout-client.tsx" &&
      rel !== "app/layout.tsx"
    ) {
      failFindings.push(
        `${rel}: contains inline style.fontFamily (use centralized typography tokens)`
      );
    }

    if (!rel.startsWith("lib/morphy-ux/") && text.includes("ease-[cubic-bezier")) {
      warnFindings.push(
        `${rel}: contains bespoke ease-[cubic-bezier(...)] (prefer Morphy motion tokens/GSAP helpers)`
      );
    }

    if (!rel.startsWith("lib/morphy-ux/") && text.includes("duration-500")) {
      warnFindings.push(
        `${rel}: uses duration-500 (prefer Morphy motion tokens/GSAP helpers for long transitions)`
      );
    }
  }
}

function main() {
  const failFindings = [];
  const warnFindings = [];

  verifyComponentsUiPurity(failFindings);
  verifySourceUsage(failFindings, warnFindings);

  if (warnFindings.length) {
    console.warn("\n[verify:design-system] WARNINGS");
    const MAX_WARNINGS = 40;
    const shown = warnFindings.slice(0, MAX_WARNINGS);
    for (const w of shown) console.warn(`- ${w}`);
    if (warnFindings.length > MAX_WARNINGS) {
      console.warn(`- ... (${warnFindings.length - MAX_WARNINGS} more warnings not shown)`);
    }
  }

  if (failFindings.length) {
    console.error("\n[verify:design-system] FAILURES");
    for (const f of failFindings) console.error(`- ${f}`);
    process.exit(1);
  }

  console.log("\nOK: design system usage verified");
}

main();
