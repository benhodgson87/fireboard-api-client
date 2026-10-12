import type { RawDevice } from "./schemas.js";

export interface RequestOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  userAgent?: string;
}

export interface FireboardClientOptions extends RequestOptions {
  token: string;
  baseUrl?: string;
  deviceCacheTtlMs?: number;
}

export interface LoginOptions extends RequestOptions {
  loginUrl?: string;
}

export type DriveSetpointOptions =
  | { setpoint: number; channel?: number }
  | { setpoint?: number; channel: number };

export interface DeviceListResult {
  data: RawDevice[];
  fromCache: boolean;
  cacheAgeSeconds: number;
}
