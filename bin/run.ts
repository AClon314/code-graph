#!/usr/bin/env bun
import { createProgram } from "../src/cli/program.ts";

try {
  await createProgram().parseAsync(process.argv);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
