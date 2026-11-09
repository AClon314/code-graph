import type { JumpTarget } from "../src/lib/jump/types.ts";

export interface JumpBridgeOptions {
  client: string;
  baseUrl: string;
  out: string;
}

export interface JumpBridgeHost {
  spawn(args: string[], cwd: string): Promise<{
    exit_code?: number;
    stderr?: string;
  } | null>;
  readFile(path: string): string | null;
  activeRoot(): string;
  setStatus(message: string): void;
  openLocation(target: JumpTarget): Promise<void>;
}

export interface JumpBridge {
  poll(): Promise<void>;
}

/** Poll the JSON-RPC jump bridge without letting duplicate targets reopen. */
export function createJumpBridge(
  host: JumpBridgeHost,
  options: JumpBridgeOptions,
): JumpBridge {
  let inFlight = false;
  let errorShown = false;
  let lastKey = "";

  function bridgeError(result: { exit_code?: number; stderr?: string } | null): void {
    if (errorShown) return;
    errorShown = true;
    const detail = result
      ? "exit " + result.exit_code + (result.stderr ? " " + result.stderr.split("\n")[0] : "")
      : "transport error";
    host.setStatus("Code Graph: jump bridge unavailable (" + detail + ")");
  }

  async function poll(): Promise<void> {
    if (inFlight) return;
    inFlight = true;
    try {
      // Fresh's httpFetch is GET-only; a spawned helper performs the JSON-RPC
      // POST and writes the target (or `null`) atomically to options.out.
      const result = await host.spawn(
        [
          options.client,
          "next",
          "--client",
          "fresh",
          "--wait",
          "25000",
          "--base",
          options.baseUrl,
          "--out",
          options.out,
        ],
        host.activeRoot(),
      );
      if (!result || result.exit_code !== 0) {
        bridgeError(result);
        return;
      }
      errorShown = false;

      const raw = host.readFile(options.out);
      if (!raw) return;
      let parsed: JumpTarget | null;
      try {
        parsed = JSON.parse(raw) as JumpTarget | null;
      } catch {
        return;
      }
      if (!parsed) return; // long-poll elapsed without a target
      if (
        typeof parsed.path !== "string" ||
        parsed.path.length === 0 ||
        typeof parsed.line !== "number" ||
        parsed.line < 1
      ) {
        return;
      }

      const column =
        typeof parsed.column === "number" && parsed.column > 0 ? parsed.column : 1;
      const key = [
        parsed.project || "",
        parsed.path,
        parsed.line,
        column,
        parsed.symbol || "",
      ].join("|");
      if (key === lastKey) return; // do not reopen the same jump repeatedly
      lastKey = key;

      const root = host.activeRoot();
      (globalThis as any).CODE_NAV_ROOT = root;
      host
        .openLocation({ ...parsed, column })
        .then(
          () => host.setStatus("Code Graph: jumped to " + parsed!.path + ":" + parsed!.line),
          (error) =>
            host.setStatus(
              "Code Graph: could not open " + parsed!.path + " — " + String(error),
            ),
        );
    } catch (error) {
      if (!errorShown) {
        errorShown = true;
        host.setStatus("Code Graph: jump bridge error — " + String(error));
      }
    } finally {
      inFlight = false;
    }
  }

  return { poll };
}
