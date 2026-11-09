import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  COMPLETION_END,
  COMPLETION_START,
  detectShell,
  installCompletion,
  uninstallCompletion,
} from "../src/cli/lib/completion-install";

test("detects zsh/bash/fish/PowerShell from the environment", () => {
  expect(detectShell({ SHELL: "/usr/bin/zsh" })).toBe("zsh");
  expect(detectShell({ SHELL: "/bin/bash" })).toBe("bash");
  expect(detectShell({ SHELL: "/usr/bin/fish" })).toBe("fish");
  expect(detectShell({ PSModulePath: "C:\\Program Files\\PowerShell" })).toBe(
    "powershell",
  );
});

test("install is idempotent and uninstall only removes its block", () => {
  const profile = join(mkdtempSync(join(tmpdir(), "code-graph-profile-")), ".zshrc");
  writeFileSync(profile, "export KEEP_ME=1\n");

  const first = installCompletion({ shell: "zsh", profile });
  expect(first.changed).toBe(true);
  const content = readFileSync(profile, "utf8");
  expect(content).toContain("export KEEP_ME=1");
  expect(content).toContain(COMPLETION_START);
  expect(content).toContain(COMPLETION_END);

  const second = installCompletion({ shell: "zsh", profile });
  expect(second.changed).toBe(false);

  const removed = uninstallCompletion({ shell: "zsh", profile });
  expect(removed.changed).toBe(true);
  expect(readFileSync(profile, "utf8")).toBe("export KEEP_ME=1\n");
  expect(uninstallCompletion({ shell: "zsh", profile }).changed).toBe(false);
});

test("install respects an existing manual source line", () => {
  const profile = join(mkdtempSync(join(tmpdir(), "code-graph-profile-")), ".zshrc");
  writeFileSync(profile, "source <(code-graph completion zsh)\n");
  expect(installCompletion({ shell: "zsh", profile }).changed).toBe(false);
  expect(readFileSync(profile, "utf8")).toBe("source <(code-graph completion zsh)\n");
});
