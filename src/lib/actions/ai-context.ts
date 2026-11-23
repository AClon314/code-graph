/** Clipboard actions for the forAI context formats. */
import type { AiContext } from "../ai-context";
import { writeClipboard } from "../clipboard";
import type { StatusState } from "../state/code-graph";

export async function copyAiContext(
  context: AiContext | null,
  mode: "markdown" | "json",
  status: StatusState,
): Promise<void> {
  status.copy = "";
  status.copyError = "";
  if (!context) {
    status.copyError = "Select a symbol before copying AI context.";
    return;
  }
  try {
    await writeClipboard(mode === "json" ? JSON.stringify(context.json, null, 2) : context.markdown);
    status.copy = mode === "json" ? "Copied JSON for AI" : "Copied Markdown for AI";
  } catch (cause) {
    status.copyError = `Copy failed: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
}
