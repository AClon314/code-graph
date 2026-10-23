import "@typespec/json-schema";
using JsonSchema;

/**
 * Source of truth for the JSON-RPC `params` payloads used by the jump bridge.
 *
 * The bridge itself is hand-written because TypeSpec has no official JSON-RPC
 * emitter; these models only describe the method params so the bridge can
 * validate them with Ajv and return `-32602` with field-level errors.
 */
@jsonSchema
namespace CodeNav;

@minLength(1)
scalar NonEmptyString extends string;

model JumpTarget {
  /** cbm project name; the adapter uses it to choose a workspace root. */
  project: NonEmptyString;
  /** Repository-relative path, e.g. `src/lib/foo.ts`. */
  path: NonEmptyString;
  /** 1-based line number. */
  @minValue(1)
  line: int32;
  /** 1-based column number. */
  @minValue(1)
  column?: int32;
  /** Optional symbol identity for highlighting/status. */
  symbol?: string;
  /** Source UI, when known. */
  source?: "gui" | "tui";
}

model JumpOpenParams extends JumpTarget {
  /** Preferred consumer; omitted/`any` lets the first poller win. */
  client?: "fresh" | "vscode" | "any";
}

model JumpNextParams {
  /** Consumer identity; Fresh uses `fresh`. */
  client: "fresh" | "vscode" | "any";
  /** Long-poll budget in milliseconds. */
  @minValue(0)
  @maxValue(30000)
  waitMs?: int32;
}

model JumpAckParams {
  id: NonEmptyString;
  client: NonEmptyString;
  ok: boolean;
  error?: string;
}

model JumpReceipt {
  id: NonEmptyString;
  client?: string;
}
