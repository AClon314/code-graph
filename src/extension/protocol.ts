import type { ExtensionConfig, SourceLocation } from "./api";

export type HostRequest =
  | { type: "getConfig"; id: number }
  | { type: "openLocation"; id: number; location: SourceLocation }
  | { type: "status"; message: string; kind?: "info" | "error" };

export type HostResponse =
  | { type: "config"; id: number; config: ExtensionConfig }
  | { type: "opened"; id: number }
  | { type: "failed"; id: number; message: string };
