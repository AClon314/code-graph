import type {
  CbmHttpRequest,
  CbmHttpResponse,
  ExtensionConfig,
  SourceLocation,
} from "./api";

export type HostRequest =
  | { type: "getConfig"; id: number }
  | { type: "cbmFetch"; id: number; request: CbmHttpRequest }
  | { type: "openLocation"; id: number; location: SourceLocation }
  | { type: "openSettings"; id: number; query: string }
  | { type: "status"; message: string; kind?: "info" | "error" };

export type HostResponse =
  | { type: "config"; id: number; config: ExtensionConfig }
  | { type: "cbmResponse"; id: number; response: CbmHttpResponse }
  | { type: "opened"; id: number }
  | { type: "settingsOpened"; id: number }
  | { type: "failed"; id: number; message: string };
