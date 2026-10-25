import type {
  ExtensionApi,
  ExtensionConfig,
  SourceLocation,
} from "../api";
import type { HostRequest, HostResponse } from "../protocol";

interface VsCodeApi {
  postMessage(message: HostRequest): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

type RequestMessage = Extract<HostRequest, { id: number }>;

interface Pending {
  resolve: (value: ExtensionConfig | undefined) => void;
  reject: (error: Error) => void;
}

const vscode = acquireVsCodeApi();
const pending = new Map<number, Pending>();
let sequence = 0;

window.addEventListener("message", (event: MessageEvent<HostResponse>) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;

  if (message.type === "config") {
    const waiting = pending.get(message.id);
    pending.delete(message.id);
    waiting?.resolve(message.config);
    return;
  }

  if (message.type === "opened") {
    const waiting = pending.get(message.id);
    pending.delete(message.id);
    waiting?.resolve(undefined);
    return;
  }

  if (message.type === "failed") {
    const waiting = pending.get(message.id);
    pending.delete(message.id);
    waiting?.reject(new Error(message.message));
  }
});

/** Webview-side proxy: the extension host owns the real editor API. */
export function createExtensionApi(): ExtensionApi {
  return {
    runtime: "webview",
    async getConfig() {
      return request<ExtensionConfig>({ type: "getConfig", id: nextId() });
    },
    async openLocation(location: SourceLocation) {
      return request<void>({
        type: "openLocation",
        id: nextId(),
        location,
      });
    },
    setStatus(message, kind) {
      vscode.postMessage({ type: "status", message, kind });
    },
  };
}

function request<T>(message: RequestMessage): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    pending.set(message.id, {
      resolve: (value) => resolve(value as T),
      reject,
    });
    vscode.postMessage(message);
  });
}

function nextId(): number {
  sequence += 1;
  return sequence;
}
