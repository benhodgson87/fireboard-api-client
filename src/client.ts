import type { z } from "zod";
import { DriveControls } from "./drive.js";
import { decode, headers, request, DEFAULT_TIMEOUT_MS } from "./request.js";
import {
  chartResponseSchema,
  devicesResponseSchema,
  deviceSchema,
  deviceTemperaturesResponseSchema,
  driveLogResponseSchema,
  sessionDetailSchema,
  sessionsResponseSchema,
} from "./schemas.js";
import type { DeviceListResult, DriveSetpointOptions, FireboardClientOptions } from "./types.js";
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
  private readonly drive: DriveControls;
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
    this.drive = new DriveControls(this.baseUrl, this.#options);
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

  /** Retrieves one device directly, without using or updating the device-list cache. */
  getDevice(uuid: string) {
    return this.get(`/devices/${encodeDeviceId(uuid)}.json`, deviceSchema);
  }

  /** Retrieves recent temperatures; the official reference does not define their JSON fields. */
  getDeviceTemperatures(uuid: string) {
    return this.get(
      `/devices/${encodeDeviceId(uuid)}/temps.json`,
      deviceTemperaturesResponseSchema,
    );
  }

  /** Returns a recent Drive log; Fireboard only returns log data less than a minute old. */
  getDriveLog(uuid: string) {
    return this.get(`/devices/${encodeDeviceId(uuid)}/drivelog.json`, driveLogResponseSchema);
  }

  /** Lists account sessions; the API does not document their ordering. */
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

  /** Sets an auto-mode target in the device's temperature unit and/or its control channel. */
  setDriveSetpoint(uuid: string, options: DriveSetpointOptions): Promise<void> {
    return this.drive.setSetpoint(uuid, options);
  }

  /** Sets a manual fan speed from 0 to 100 percent. */
  setDriveSpeed(uuid: string, percent: number): Promise<void> {
    return this.drive.setSpeed(uuid, percent);
  }

  /** Clears the setpoint and turns the Drive fan off. */
  setDriveOff(uuid: string): Promise<void> {
    return this.drive.off(uuid);
  }
}
