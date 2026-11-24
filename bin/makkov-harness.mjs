#!/usr/bin/env node
// makkov-harness: installs the harness's skills and routing map for agents other than Claude, on any operating
// system (install/node/). Node standard library only; it reads and writes local files and makes no network calls.
// The version check comes first, before any of the installer's code is loaded (npx only warns about engines).
const major = Number(process.versions.node.split('.')[0]);
if (major < 22) {
  process.stderr.write(`makkov-harness needs Node.js 22 or later; this is ${process.version}. Update Node.js, or use the shell installers in install/ (no Node needed).\n`);
  process.exit(1);
}
const { main } = await import('../install/node/cli.mjs');
process.exitCode = main(process.argv.slice(2));
