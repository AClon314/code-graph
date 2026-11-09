#!/usr/bin/env bun
import { run } from "@oclif/core";
import { fileURLToPath } from "node:url";

await run(process.argv.slice(2), fileURLToPath(new URL("..", import.meta.url)));
