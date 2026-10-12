export { FireboardClient, DEFAULT_BASE_URL, DEFAULT_DEVICE_CACHE_TTL_MS } from "./client.js";
export { login, DEFAULT_LOGIN_URL } from "./login.js";
export { DEFAULT_TIMEOUT_MS } from "./request.js";

export { FireboardError } from "./errors.js";
export type { FireboardErrorCode } from "./errors.js";

export type {
  FireboardClientOptions,
  RequestOptions,
  LoginOptions,
  DeviceListResult,
  DriveControlPayload,
} from "./types.js";

export * from "./schemas.js";
