export { FireboardClient, DEFAULT_BASE_URL } from "./client.js";
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
