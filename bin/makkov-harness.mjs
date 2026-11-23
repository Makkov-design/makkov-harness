#!/usr/bin/env node
// makkov-harness: installs the harness's skills and routing map for agents other than Claude, on any operating
// system (install/node/). Node standard library only; it reads and writes local files and makes no network calls.
import { main } from '../install/node/cli.mjs';

process.exitCode = main(process.argv.slice(2));
