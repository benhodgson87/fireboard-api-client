import { z } from "zod";
import { FireboardError } from "./errors.js";
import {
  chartResponseSchema,
  devicesResponseSchema,
  driveLogResponseSchema,
  sessionDetailSchema,
  sessionsResponseSchema,
} from "./schemas.js";
import type {
  DeviceListResult,
  DriveControlPayload,
  FireboardClientOptions,
  LoginOptions,
  RequestOptions,
} from "./types.js";

export const DEFAULT_BASE_URL = "https://fireboard.io/api/v1";
export const DEFAULT_LOGIN_URL = "https://fireboard.io/api/rest-auth/login/";
export const DEFAULT_DEVICE_CACHE_TTL_MS = 120_000;
export const DEFAULT_TIMEOUT_MS = 15_000;

function endpoint(value: string): string {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new TypeError("Endpoint must be an HTTP(S) URL without credentials, query, or fragment");
  }
  return url.href;
}
function timing(value: number, name: string, allowZero = false): number {
  if (!Number.isFinite(value) || value < (allowZero ? 0 : 1) || value > 2_147_483_647) {
    throw new TypeError(`Invalid ${name}`);
  }
  return value;
}
function deviceId(uuid: string): string {
  if (typeof uuid !== "string" || !uuid.trim() || uuid === "." || uuid === "..") {
    throw new TypeError("Invalid device UUID");
  }
  return encodeURIComponent(uuid);
}
function sessionId(id: number): number {
  if (!Number.isSafeInteger(id) || id < 0) {
    throw new TypeError("Invalid session ID");
  }
  return id;
}
async function request(
  url: string,
  init: RequestInit,
  options: RequestOptions,
  isLogin = false,
): Promise<Response> {
  const timeoutMs = timing(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, "timeoutMs");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.fetch ?? globalThis.fetch)(url, {
      ...init,
      signal: controller.signal,
      redirect: "error",
    });
    if (response.status === 401 || (isLogin && response.status === 400)) {
      throw new FireboardError(
        "Invalid Fireboard token. Check your API key.",
        "AUTHENTICATION",
        response.status,
      );
    }
    if (response.status === 429) {
      throw new FireboardError(
        "Fireboard REST API rate limit reached (17 calls / 5 min). Further requests are blocked for ~5 minutes. See: https://docs.fireboard.io/app/app-api/#rate-limits",
        "RATE_LIMIT",
        429,
      );
    }
    if (!response.ok) {
      throw new FireboardError(
        "Fireboard API unavailable. Try again shortly.",
        "API_UNAVAILABLE",
        response.status,
      );
    }
    // Read the body under the timeout; method callers validate the decoded JSON.
    const body = await response.text();
    return new Response(body || null, { status: response.status, headers: response.headers });
  } catch (error) {
    if (error instanceof FireboardError) {
      throw error;
    }
    if (controller.signal.aborted) {
      throw new FireboardError("Fireboard API request timed out.", "TIMEOUT");
    }
    throw new FireboardError("Could not connect to the Fireboard API.", "NETWORK");
  } finally {
    clearTimeout(timer);
  }
}
async function decode<S extends z.ZodType>(response: Response, schema: S): Promise<z.output<S>> {
  try {
    return schema.parse(await response.json());
  } catch {
    throw new FireboardError(
      "Unexpected Fireboard API response.",
      "INVALID_RESPONSE",
      response.status,
    );
  }
}
function headers(options: RequestOptions, token?: string): Record<string, string> {
  return {
    ...(token ? { Authorization: `Token ${token}` } : {}),
    "User-Agent": options.userAgent ?? "fireboard-api-client",
  };
}

export async function login(
  credentials: { username: string; password: string },
  options: LoginOptions = {},
): Promise<string> {
  if (
    typeof credentials?.username !== "string" ||
    !credentials.username.trim() ||
    typeof credentials.password !== "string" ||
    !credentials.password
  ) {
    throw new TypeError("Username and password are required");
  }
  const loginUrl = endpoint(options.loginUrl ?? DEFAULT_LOGIN_URL);
  const response = await request(
    loginUrl,
    {
      method: "POST",
      headers: { ...headers(options), "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    },
    options,
    true,
  );
  return (await decode(response, z.object({ key: z.string().min(1) }))).key;
}

export class FireboardClient {
  readonly #options: FireboardClientOptions;
  private readonly baseUrl: string;
  private readonly cacheTtlMs: number;
  private cache: { data: DeviceListResult["data"]; fetchedAt: number } | undefined;
  private pendingDevices: Promise<DeviceListResult> | undefined;

  constructor(options: FireboardClientOptions) {
    if (typeof options?.token !== "string" || !options.token.trim()) {
      throw new TypeError("Fireboard token is required");
    }
    timing(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, "timeoutMs");
    this.cacheTtlMs = timing(
      options.deviceCacheTtlMs ?? DEFAULT_DEVICE_CACHE_TTL_MS,
      "deviceCacheTtlMs",
      true,
    );
    this.baseUrl = endpoint(options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.#options = { ...options };
  }
  private async get<S extends z.ZodType>(path: string, schema: S): Promise<z.output<S>> {
    const response = await request(
      `${this.baseUrl}${path}`,
      { headers: headers(this.#options, this.#options.token) },
      this.#options,
    );
    return decode(response, schema);
  }
  async getDevices(): Promise<DeviceListResult> {
    const now = Date.now();
    if (this.cache && now - this.cache.fetchedAt < this.cacheTtlMs) {
      return {
        data: this.cache.data,
        fromCache: true,
        cacheAgeSeconds: Math.round((now - this.cache.fetchedAt) / 1000),
      };
    }
    if (this.pendingDevices) {
      return this.pendingDevices;
    }
    this.pendingDevices = this.get("/devices.json", devicesResponseSchema).then((data) => {
      this.cache = { data, fetchedAt: Date.now() };
      return { data, fromCache: false, cacheAgeSeconds: 0 };
    });
    try {
      return await this.pendingDevices;
    } finally {
      this.pendingDevices = undefined;
    }
  }
  getDriveLog(uuid: string) {
    return this.get(`/devices/${deviceId(uuid)}/drivelog.json`, driveLogResponseSchema);
  }
  getSessions() {
    return this.get("/sessions.json", sessionsResponseSchema);
  }
  getSessionDetail(id: number) {
    return this.get(`/sessions/${sessionId(id)}.json`, sessionDetailSchema);
  }
  getSessionChart(id: number, includeDrive = false) {
    return this.get(
      `/sessions/${sessionId(id)}/chart.json${includeDrive ? "?drive=1" : ""}`,
      chartResponseSchema,
    );
  }
  async controlDrive(uuid: string, payload: DriveControlPayload): Promise<void> {
    await request(
      `${this.baseUrl}/devices/${deviceId(uuid)}/mq.json`,
      {
        method: "POST",
        headers: {
          ...headers(this.#options, this.#options.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ topic: "device", payload: { ...payload, request_type: "control" } }),
      },
      this.#options,
    );
  }
}
