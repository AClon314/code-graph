/**
 * A jump request is the only thing the GUI needs to know about an editor.
 * Paths are relative to the project root; lines and columns are 1-based
 * (SCIP/cbm convention). Each host adapter converts to its own editor API.
 */
export interface JumpTarget {
  /** cbm project name; the adapter uses it to choose a workspace root. */
  project: string;
  /** Repository-relative path, e.g. `src/lib/foo.ts`. */
  path: string;
  /** 1-based line number. */
  line: number;
  /** 1-based column number. */
  column?: number;
  /** Optional symbol identity for highlighting/status. */
  symbol?: string;
  /** Optional source UI (`gui` by default). */
  source?: "gui" | "tui";
}

export interface JumpRequest extends JumpTarget {
  /** Preferred consumer; omitted/`any` lets the first poller win. */
  client?: "fresh" | "vscode" | "any";
}

export interface JumpReceipt {
  id: string;
  client?: string;
}

export interface JumpAck {
  id: string;
  client: string;
  ok: boolean;
  error?: string;
}

export const JUMP_PATH = "/jump";
export const JUMP_NEXT_PATH = "/jump/next";
export const JUMP_ACK_PATH = "/jump/ack";
export const JUMP_HEALTH_PATH = "/health";
