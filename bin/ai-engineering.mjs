#!/usr/bin/env node
import { main } from '../dist/packages/cli/src/index.js';
main(process.argv.slice(2)).catch((err) => { console.error(`ERROR: ${err.message}`); process.exitCode = 1; });
