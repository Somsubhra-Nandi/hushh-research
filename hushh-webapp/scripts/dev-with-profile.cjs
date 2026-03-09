#!/usr/bin/env node

const path = require("node:path");
const readline = require("node:readline");
const { spawn, spawnSync } = require("node:child_process");

const PROFILE_VALUES = ["dev", "uat", "prod"];
const repoRoot = path.resolve(__dirname, "../..");
const webRoot = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const passthrough = [];
  let profile = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      passthrough.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--env=")) {
      profile = arg.split("=", 2)[1] || null;
      continue;
    }
    if (arg === "--env") {
      profile = argv[i + 1] || null;
      i += 1;
      continue;
    }
    passthrough.push(arg);
  }

  return { profile, passthrough };
}

function normalizeProfile(raw) {
  const normalized = String(raw || "").trim().toLowerCase();
  if (normalized === "development") return "dev";
  if (PROFILE_VALUES.includes(normalized)) return normalized;
  return null;
}

function promptSelectProfile(defaultProfile) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const options = PROFILE_VALUES.map((profile, index) => {
      const marker = profile === defaultProfile ? " (default)" : "";
      return `  ${index + 1}) ${profile}${marker}`;
    }).join("\n");

    rl.question(
      `Select environment profile:\n${options}\nEnter 1/2/3 (or profile name): `,
      (answer) => {
        rl.close();
        const raw = String(answer || "").trim().toLowerCase();
        if (!raw) {
          resolve(defaultProfile);
          return;
        }
        const byIndex = Number.parseInt(raw, 10);
        if (!Number.isNaN(byIndex) && byIndex >= 1 && byIndex <= PROFILE_VALUES.length) {
          resolve(PROFILE_VALUES[byIndex - 1]);
          return;
        }
        resolve(normalizeProfile(raw));
      }
    );
  });
}

function promptProdConfirmation() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question("Type 'prod' to confirm local production profile activation: ", (answer) => {
      rl.close();
      resolve(String(answer || "").trim().toLowerCase() === "prod");
    });
  });
}

function activateProfile(profile) {
  const scriptPath = path.join(repoRoot, "scripts/env/use_profile.sh");
  const args = [scriptPath, profile];
  if (profile === "prod") {
    args.push("--confirm-prod-local");
  }

  const result = spawnSync("bash", args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

async function main() {
  const { profile: argProfile, passthrough } = parseArgs(process.argv.slice(2));
  const envProfile = normalizeProfile(process.env.APP_PROFILE);
  const requested = normalizeProfile(argProfile) || envProfile;
  const defaultProfile = "dev";

  let profile = requested;
  if (!profile) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      profile = defaultProfile;
      console.log(`No interactive TTY detected. Using profile: ${profile}`);
    } else {
      profile = await promptSelectProfile(defaultProfile);
    }
  }

  if (!profile) {
    console.error("Invalid environment profile. Use one of: dev, uat, prod");
    process.exit(1);
  }

  if (profile === "prod") {
    const nonInteractiveConfirmed =
      String(process.env.APP_PROFILE_CONFIRM_PROD || "").trim().toLowerCase() === "prod";
    if (!nonInteractiveConfirmed) {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        console.error("Refusing prod profile activation without APP_PROFILE_CONFIRM_PROD=prod");
        process.exit(1);
      }
      const confirmed = await promptProdConfirmation();
      if (!confirmed) {
        console.error("Production profile activation cancelled.");
        process.exit(1);
      }
    }
  }

  activateProfile(profile);

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const args = ["run", "dev:next"];
  if (passthrough.length > 0) {
    args.push("--", ...passthrough);
  }

  const child = spawn(npmCmd, args, {
    cwd: webRoot,
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code || 0);
  });

  child.on("error", (error) => {
    console.error(`Failed to launch Next.js dev server: ${error.message}`);
    process.exit(1);
  });
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
