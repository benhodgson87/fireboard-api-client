export { DEFAULT_DEVICE_CACHE_TTL_MS } from "./device-cache.js";
export { login, DEFAULT_LOGIN_URL } from "./login.js";
export { DEFAULT_TIMEOUT_MS } from "./request.js";

export { FireboardError } from "./errors.js";
export type { FireboardErrorCode } from "./errors.js";

export type {
  FireboardClientOptions,
  RequestOptions,
  LoginOptions,
  DriveSetpointOptions,
} from "./types.js";

export * from "./schemas.js";

export * from "./transforms/index.js";
