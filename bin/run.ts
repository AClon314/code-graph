#!/usr/bin/env bun
import { run } from "@oclif/core";
import { fileURLToPath } from "node:url";

import { handleCompletion } from "../src/cli/completion.ts";

const argv = process.argv.slice(2);
if (argv[0] === "complete") {
  process.exit(handleCompletion(argv));
}

await run(argv, fileURLToPath(new URL("..", import.meta.url)));
