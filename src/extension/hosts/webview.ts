import type {
  CbmHttpRequest,
  CbmHttpResponse,
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

interface Pending<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

const vscode = acquireVsCodeApi();
const configPending = new Map<number, Pending<ExtensionConfig>>();
const cbmPending = new Map<number, Pending<CbmHttpResponse>>();
const locationPending = new Map<number, Pending<void>>();
const settingsPending = new Map<number, Pending<void>>();
let sequence = 0;

window.addEventListener("message", (event: MessageEvent<HostResponse>) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;

  if (message.type === "config") {
    const waiting = configPending.get(message.id);
    configPending.delete(message.id);
    waiting?.resolve(message.config);
    return;
  }

  if (message.type === "cbmResponse") {
    const waiting = cbmPending.get(message.id);
    cbmPending.delete(message.id);
    waiting?.resolve(message.response);
    return;
  }

  if (message.type === "opened") {
    const waiting = locationPending.get(message.id);
    locationPending.delete(message.id);
    waiting?.resolve();
    return;
  }

  if (message.type === "settingsOpened") {
    const waiting = settingsPending.get(message.id);
    settingsPending.delete(message.id);
    waiting?.resolve();
    return;
  }

  if (message.type === "failed") {
    const error = new Error(message.message);
    configPending.get(message.id)?.reject(error);
    cbmPending.get(message.id)?.reject(error);
    locationPending.get(message.id)?.reject(error);
    settingsPending.get(message.id)?.reject(error);
    configPending.delete(message.id);
    cbmPending.delete(message.id);
    locationPending.delete(message.id);
    settingsPending.delete(message.id);
  }
});

/** Webview-side proxy: the extension host owns the real editor and cbm API. */
export function createExtensionApi(): ExtensionApi {
  return {
    runtime: "webview",
    async getConfig() {
      return request(configPending, (id) => ({ type: "getConfig", id }));
    },
    async fetchCbm(cbmRequest: CbmHttpRequest) {
      return request(cbmPending, (id) => ({ type: "cbmFetch", id, request: cbmRequest }));
    },
    async openLocation(location: SourceLocation) {
      await request(locationPending, (id) => ({ type: "openLocation", id, location }));
    },
    async openSettings(query: string) {
      await request(settingsPending, (id) => ({ type: "openSettings", id, query }));
    },
    setStatus(message, kind) {
      vscode.postMessage({ type: "status", message, kind });
    },
  };
}

function request<T>(
  pending: Map<number, Pending<T>>,
  message: (id: number) => RequestMessage,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = nextId();
    pending.set(id, { resolve, reject });
    vscode.postMessage(message(id));
  });
}

function nextId(): number {
  sequence += 1;
  return sequence;
}
