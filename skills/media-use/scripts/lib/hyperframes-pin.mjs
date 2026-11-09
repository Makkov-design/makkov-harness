// Added by makkov-harness: every `npx hyperframes …` the media-use scripts start asks npm for the
// Hyperframes CLI release this harness reviewed, not whatever is newest on npm that day. The version
// lives in one place, skills/hyperframes/scripts/cli-version.json, shared with the harness launcher.
// It also keeps the CLI's own telemetry off by default (see the end of this file).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REVIEWED = "0.9.9"; // used only if cli-version.json is missing (a skill copied on its own)

export function hyperframesSpec() {
  try {
    const file = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "hyperframes", "scripts", "cli-version.json");
    const { version } = JSON.parse(readFileSync(file, "utf8"));
    if (/^\d+\.\d+\.\d+$/.test(version)) return `hyperframes@${version}`;
  } catch {
    // fall through to the reviewed release
  }
  return `hyperframes@${REVIEWED}`;
}

// The Hyperframes CLI sends its own usage events unless HYPERFRAMES_NO_TELEMETRY=1. The CLI runs these
// scripts start inherit this process's environment, so it is defaulted here, on import: off unless the
// user opted in with MEDIA_USE_TELEMETRY=1 or set HYPERFRAMES_NO_TELEMETRY themselves.
export function cliTelemetryOffByDefault(env = process.env) {
  if (env.MEDIA_USE_TELEMETRY !== "1" && env.HYPERFRAMES_NO_TELEMETRY === undefined)
    env.HYPERFRAMES_NO_TELEMETRY = "1";
  return env;
}
cliTelemetryOffByDefault();
