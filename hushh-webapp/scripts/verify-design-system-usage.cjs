/* eslint-disable no-console */
/**
 * verify-design-system-usage.cjs
 *
 * Lightweight repo guardrails for:
 * - No legacy `crystal-*` / `rounded-ios*` usage in app code
 * - Visibility into shadcn Button imports outside vendor code
 * - Visibility into Lucide sizing via `h-<n>/w-<n>` instead of Lucide props (best-effort)
 *
 * Notes:
 * - We intentionally do NOT scan `components/ui/**` (shadcn vendor).
 * - We intentionally do NOT scan CSS/docs (definitions and documentation can mention tokens).
 */

const { execSync } = require("node:child_process");
const fs = require("node:fs");

function getTrackedFiles() {
  try {
    const out = execSync("git ls-files", { stdio: ["ignore", "pipe", "ignore"] })
      .toString("utf8");
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function isTsLike(path) {
  return path.endsWith(".ts") || path.endsWith(".tsx");
}

function readText(path) {
  try {
    return fs.readFileSync(path, "utf8");
  } catch (err) {
    // If git index lists a file that isn't present in the working tree, skip it.
    // This can happen in dirty worktrees during refactors.
    if (err && (err.code === "ENOENT" || err.code === "ENOTDIR")) {
      return null;
    }
    throw err;
  }
}

function main() {
  const files = getTrackedFiles();
  if (!files.length) {
    console.error("ERROR: verify-design-system-usage: no git-tracked files found (run from repo root).");
    process.exit(2);
  }

  const failFindings = [];
  const warnFindings = [];

  for (const rel of files) {
    if (!isTsLike(rel)) continue;
    if (rel.startsWith("components/ui/")) continue; // shadcn vendor code
    if (rel.includes("/components/ui/")) continue;

    const text = readText(rel);
    if (text === null) {
      warnFindings.push(`${rel}: missing from working tree (skipped)`);
      continue;
    }

    // Fail: legacy classes in app code
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
        `${rel}: contains legacy font variable name (use semantic --font-app-body/--font-app-heading/--font-app-mono)`
      );
    }

    // Warn: shadcn button import outside vendor. Morphy Button is preferred for user-facing CTAs.
    if (text.includes('from "@/components/ui/button"')) {
      warnFindings.push(`${rel}: imports shadcn Button (@/components/ui/button)`);
    }

    // Fail: inline font family should only exist in infrastructure/style wrappers.
    const hasInlineStyleFontFamily =
      /style\s*=\s*\{\{[\s\S]*?fontFamily\s*:/m.test(text);
    if (
      hasInlineStyleFontFamily &&
      rel !== "app/layout-client.tsx" &&
      rel !== "app/layout.tsx"
    ) {
      failFindings.push(
        `${rel}: contains inline style.fontFamily (prefer centralized typography tokens/utilities)`
      );
    }

    // Warn: best-effort Lucide sizing detection
    const importsLucide = text.includes('from "lucide-react"') || text.includes("from 'lucide-react'");
    if (importsLucide) {
      // Heuristic: detect Tailwind sizing applied directly to Lucide icon components.
      // Avoid flagging unrelated h-/w- usage (e.g. layout divs, avatars).
      const lucideImports = [];
      const importRe =
        /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']lucide-react["'];/g;
      let m;
      while ((m = importRe.exec(text)) !== null) {
        const names = m[1]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => s.replace(/^type\s+/, "").trim())
          .map((s) => s.split(/\s+as\s+/)[0].trim());
        lucideImports.push(...names);
      }

      const iconNames = lucideImports.filter((n) => /^[A-Z]/.test(n) && !n.startsWith("Lucide"));
      const sizeTokenRe = /\b(?:h|w|size)-\d+(?:\.5)?\b/;

      let found = false;
      for (const icon of iconNames) {
        const re1 = new RegExp(`<${icon}\\b[^>]*className="[^"]*${sizeTokenRe.source}[^"]*"`, "m");
        const re2 = new RegExp(`<${icon}\\b[^>]*className=\\{[^}]*${sizeTokenRe.source}[^}]*\\}`, "m");
        if (re1.test(text) || re2.test(text)) {
          found = true;
          break;
        }
      }

      if (found) {
        warnFindings.push(
          `${rel}: Lucide icon(s) appear to be sized via Tailwind h-/w-/size-* classes (prefer Icon wrapper + Lucide size prop)`
        );
      }
    }

    // Warn: motion drift (prefer GSAP + Morphy motion tokens)
    // Keep this lightweight to avoid noisy output: only flag bespoke cubic-bezier easings.
    if (!rel.startsWith("lib/morphy-ux/") && text.includes("ease-[cubic-bezier")) {
      warnFindings.push(
        `${rel}: contains bespoke Tailwind ease-[cubic-bezier(...)] (prefer GSAP hooks or Morphy motion tokens)`
      );
    }

    // Warn: Morphy Button/Card should avoid "shape/elevation" className overrides in feature code.
    // Prefer Morphy props/defaults (pill radius + centralized CTA shadow) over per-callsite `rounded-*`/`shadow-*`.
    // Heuristic: only warn when the file imports Morphy Button/Card.
    const importsMorphyButton = text.includes('from "@/lib/morphy-ux/button"');
    if (importsMorphyButton) {
      const re = /<Button\b[^>]*className\s*=\s*["'][^"']*\b(?:rounded-|shadow-)[^"']*["']/m;
      if (re.test(text)) {
        warnFindings.push(
          `${rel}: Morphy <Button> appears to override radius/elevation via className (prefer props/defaults; avoid rounded-*/shadow-* in className)`
        );
      }
    }

    const importsMorphyCard = text.includes('from "@/lib/morphy-ux/card"');
    if (importsMorphyCard) {
      const re = /<Card\b[^>]*className\s*=\s*["'][^"']*\b(?:rounded-|shadow-)[^"']*["']/m;
      if (re.test(text)) {
        warnFindings.push(
          `${rel}: Morphy <Card> appears to override radius/elevation via className (prefer props/defaults; avoid rounded-*/shadow-* in className)`
        );
      }
    }

    // Warn: long transition durations outside Morphy layer (often indicates one-off animation tuning).
    if (!rel.startsWith("lib/morphy-ux/") && text.includes("duration-500")) {
      warnFindings.push(
        `${rel}: uses duration-500 (prefer Morphy motion tokens or GSAP helpers for long motions)`
      );
    }
  }

  if (warnFindings.length) {
    console.warn("\n[verify:design-system] WARNINGS");
    const MAX_WARNINGS = 40;
    const shown = warnFindings.slice(0, MAX_WARNINGS);
    for (const w of shown) console.warn(`- ${w}`);
    if (warnFindings.length > MAX_WARNINGS) {
      console.warn(
        `- ... (${warnFindings.length - MAX_WARNINGS} more warnings not shown)`
      );
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
