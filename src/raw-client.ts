import type { z } from "zod";
import { DeviceCache, DEFAULT_DEVICE_CACHE_TTL_MS } from "./device-cache.js";
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

export class FireboardClient {
  readonly #options: FireboardClientOptions;
  private readonly baseUrl: string;
  private readonly drive: DriveControls;
  private readonly deviceCache: DeviceCache;

  constructor(options: FireboardClientOptions) {
    if (typeof options?.token !== "string" || !options.token.trim()) {
      throw new TypeError("Fireboard token is required");
    }

    validateTiming(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, "timeoutMs");
    this.deviceCache = new DeviceCache(
      validateTiming(
        options.deviceCacheTtlMs ?? DEFAULT_DEVICE_CACHE_TTL_MS,
        "deviceCacheTtlMs",
        true,
      ),
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

  /** Lists account devices using the per-client device cache. */
  async getDevices() {
    return (await this.getDevicesWithCache()).data;
  }

  /** Lists devices with cache freshness metadata. */
  getDevicesWithCache(): Promise<DeviceListResult> {
    return this.deviceCache.get(() => this.get("/devices.json", devicesResponseSchema));
  }

  /** Retrieves one device and its available metadata. */
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
