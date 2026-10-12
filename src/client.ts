import { FireboardClient as RawFireboardClient } from "./raw-client.js";
import type { FireboardClientOptions, DriveSetpointOptions, DeviceListResult } from "./types.js";
import {
  transformDeviceSummary,
  transformDriveLog,
  transformSessionSummary,
  transformSessionDetail,
  transformChartChannels,
  type DeviceSummary,
} from "./transforms/index.js";

export { DEFAULT_BASE_URL } from "./raw-client.js";

/** Fireboard client returning cleaned device, Drive, session, and chart data. */
export class FireboardClient {
  readonly #raw: RawFireboardClient;

  constructor(options: FireboardClientOptions) {
    this.#raw = new RawFireboardClient(options);
  }

  getDevices() {
    return this.#raw.getDevices().then((devices) => devices.map(transformDeviceSummary));
  }

  getDevicesWithCache(): Promise<DeviceListResult<DeviceSummary>> {
    return this.#raw.getDevicesWithCache().then((result) => ({
      ...result,
      data: result.data.map(transformDeviceSummary),
    }));
  }

  getDevice(uuid: string) {
    return this.#raw.getDevice(uuid).then(transformDeviceSummary);
  }

  /** Preserves temperature JSON because its response shape is not documented. */
  getDeviceTemperatures(uuid: string) {
    return this.#raw.getDeviceTemperatures(uuid);
  }

  getDriveLog(uuid: string) {
    return this.#raw.getDriveLog(uuid).then((log) => transformDriveLog(log));
  }

  getSessions() {
    return this.#raw.getSessions().then((sessions) => sessions.map(transformSessionSummary));
  }

  getSessionDetail(id: number) {
    return this.#raw.getSessionDetail(id).then(transformSessionDetail);
  }

  getSessionChart(id: number, includeDrive = false) {
    return this.#raw.getSessionChart(id, includeDrive).then(transformChartChannels);
  }

  setDriveSetpoint(uuid: string, options: DriveSetpointOptions): Promise<void> {
    return this.#raw.setDriveSetpoint(uuid, options);
  }

  setDriveSpeed(uuid: string, percent: number): Promise<void> {
    return this.#raw.setDriveSpeed(uuid, percent);
  }

  setDriveOff(uuid: string): Promise<void> {
    return this.#raw.setDriveOff(uuid);
  }
}
