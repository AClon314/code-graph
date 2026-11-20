/** Run a settings/recovery action and return true when the graph should reload. */
import type { ExtensionApi } from "../../extension/api";
import type { StatusState } from "../state/code-graph";
import type { SettingsFix } from "../settings-fix";
import { errorMessage } from "../errors";

export async function applySettingsFix(
  fix: SettingsFix | null,
  extensionApi: ExtensionApi,
  status: StatusState,
): Promise<boolean> {
  if (!fix) return false;
  if (fix.action === "restart-cbm") {
    try {
      await extensionApi.restartCbm();
      status.error = "";
      status.errorFix = null;
      status.graphError = "";
      status.graphFix = null;
      return true;
    } catch (cause) {
      console.error("[code-graph] restart cbm-http failed", cause);
      status.error = `Restart cbm-http failed: ${errorMessage(cause)}`;
      return false;
    }
  }
  try {
    await extensionApi.openSettings(fix.query);
  } catch (cause) {
    status.error = `Open settings failed: ${errorMessage(cause)}`;
  }
  return false;
}
