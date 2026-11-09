/**
 * Load root candidates for the Fresh picker. roots.json is authoritative and
 * is read synchronously through the editor; a missing cache falls back to one
 * Bun subprocess that refreshes it.
 */
import { rootsCachePath } from "../src/lib/graph/cache.ts";
import {
  rootsForProject,
  type RootCandidate,
} from "../src/lib/graph/roots.ts";

export interface RootsSourceHost {
  readFile(path: string): string | null;
  spawn(args: string[], cwd: string): Promise<{
    exit_code?: number;
    stdout?: string;
    stderr?: string;
  } | null>;
  setStatus(message: string): void;
}

export interface RootsSourceOptions {
  script: string;
  root: string;
  project: string;
  backend: string;
}

export async function loadRoots(
  host: RootsSourceHost,
  options: RootsSourceOptions,
): Promise<RootCandidate[]> {
  try {
    const cached = rootsForProject(
      host.readFile(rootsCachePath(options.root)),
      options.project,
    );
    if (cached.length > 0) return cached;
  } catch {
    // Fall through to the subprocess.
  }

  host.setStatus(
    "Code Graph (" + options.backend + "): loading root candidates…",
  );
  let result: Awaited<ReturnType<RootsSourceHost["spawn"]>>;
  try {
    result = await host.spawn(
      [
        options.script,
        "--project",
        options.project,
        "--root",
        options.root,
        "--json",
        "--limit",
        "50",
        "--write-cache",
      ],
      options.root,
    );
  } catch (error) {
    host.setStatus("Code Graph: root lookup failed — " + String(error));
    return [];
  }
  if (!result || result.exit_code !== 0) {
    host.setStatus(
      "Code Graph: root lookup failed — " +
        ((result && result.stderr) || "no stderr"),
    );
    return [];
  }
  try {
    const parsed = JSON.parse(result.stdout || "[]") as RootCandidate[];
    return Array.isArray(parsed)
      ? parsed.filter((root) => Boolean(root?.qualifiedName))
      : [];
  } catch {
    host.setStatus("Code Graph: root lookup returned invalid JSON");
    return [];
  }
}
