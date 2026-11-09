// Added by makkov-harness: the pinned CLI spec and the CLI telemetry default.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cliTelemetryOffByDefault, hyperframesSpec, npmScriptsOffByDefault } from "./hyperframes-pin.mjs";

test("asks npm for an exact reviewed release", () => {
  assert.match(hyperframesSpec(), /^hyperframes@\d+\.\d+\.\d+$/);
});

test("CLI telemetry is off unless the user opted in or chose it", () => {
  assert.equal(cliTelemetryOffByDefault({}).HYPERFRAMES_NO_TELEMETRY, "1");
  assert.equal(cliTelemetryOffByDefault({ MEDIA_USE_TELEMETRY: "1" }).HYPERFRAMES_NO_TELEMETRY, undefined);
  assert.equal(cliTelemetryOffByDefault({ HYPERFRAMES_NO_TELEMETRY: "0" }).HYPERFRAMES_NO_TELEMETRY, "0");
});

test("npm runs no install scripts unless the user chose otherwise", () => {
  assert.equal(npmScriptsOffByDefault({}).npm_config_ignore_scripts, "true");
  assert.equal(npmScriptsOffByDefault({ npm_config_ignore_scripts: "false" }).npm_config_ignore_scripts, "false");
});
