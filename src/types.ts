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

export interface DeviceListResult {
  data: RawDevice[];
  fromCache: boolean;
  cacheAgeSeconds: number;
}

export interface DriveControlPayload {
  t?: "fan";
  p?: string;
  setpoint?: string;
  cc?: string;
}
