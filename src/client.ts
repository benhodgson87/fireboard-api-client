import type { z } from "zod";
import { decode, headers, request, DEFAULT_TIMEOUT_MS } from "./request.js";
import {
  chartResponseSchema,
  devicesResponseSchema,
  driveLogResponseSchema,
  sessionDetailSchema,
  sessionsResponseSchema,
} from "./schemas.js";
import type { DeviceListResult, DriveControlPayload, FireboardClientOptions } from "./types.js";
import {
  encodeDeviceId,
  validateEndpoint,
  validateSessionId,
  validateTiming,
} from "./validation.js";

export const DEFAULT_BASE_URL = "https://fireboard.io/api/v1";
export const DEFAULT_DEVICE_CACHE_TTL_MS = 120_000;

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

    validateTiming(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, "timeoutMs");
    this.cacheTtlMs = validateTiming(
      options.deviceCacheTtlMs ?? DEFAULT_DEVICE_CACHE_TTL_MS,
      "deviceCacheTtlMs",
      true,
    );
    this.baseUrl = validateEndpoint(options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
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

    this.pendingDevices = this.fetchDevices();

    try {
      return await this.pendingDevices;
    } finally {
      this.pendingDevices = undefined;
    }
  }

  private async fetchDevices(): Promise<DeviceListResult> {
    const data = await this.get("/devices.json", devicesResponseSchema);

    this.cache = { data, fetchedAt: Date.now() };

    return { data, fromCache: false, cacheAgeSeconds: 0 };
  }

  getDriveLog(uuid: string) {
    return this.get(`/devices/${encodeDeviceId(uuid)}/drivelog.json`, driveLogResponseSchema);
  }

  getSessions() {
    return this.get("/sessions.json", sessionsResponseSchema);
  }

  getSessionDetail(id: number) {
    return this.get(`/sessions/${validateSessionId(id)}.json`, sessionDetailSchema);
  }

  getSessionChart(id: number, includeDrive = false) {
    return this.get(
      `/sessions/${validateSessionId(id)}/chart.json${includeDrive ? "?drive=1" : ""}`,
      chartResponseSchema,
    );
  }

  async controlDrive(uuid: string, payload: DriveControlPayload): Promise<void> {
    await request(
      `${this.baseUrl}/devices/${encodeDeviceId(uuid)}/mq.json`,
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
