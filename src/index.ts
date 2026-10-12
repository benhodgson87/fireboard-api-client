export {
  FireboardClient,
  login,
  DEFAULT_BASE_URL,
  DEFAULT_LOGIN_URL,
  DEFAULT_DEVICE_CACHE_TTL_MS,
  DEFAULT_TIMEOUT_MS,
} from "./client.js";
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
