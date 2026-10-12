import { headers, request } from "./request.js";
import type { DriveSetpointOptions, FireboardClientOptions } from "./types.js";
import { encodeDeviceId } from "./validation.js";

interface ControlPayload {
  t?: "fan";
  p?: string;
  setpoint?: string;
  cc?: string;
}

export class DriveControls {
  readonly #options: FireboardClientOptions;

  constructor(
    private readonly baseUrl: string,
    options: FireboardClientOptions,
  ) {
    this.#options = options;
  }

  private async send(uuid: string, payload: ControlPayload): Promise<void> {
    await request(
      `${this.baseUrl}/devices/${encodeDeviceId(uuid)}/mq.json`,
      {
        method: "POST",
        headers: {
          ...headers(this.#options, this.#options.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic: "device",
          payload: { ...payload, request_type: "control" },
        }),
      },
      this.#options,
    );
  }

  async setSetpoint(uuid: string, options: DriveSetpointOptions): Promise<void> {
    encodeDeviceId(uuid);

    if (!options || (options.setpoint === undefined && options.channel === undefined)) {
      throw new TypeError("At least one of setpoint or channel is required");
    }

    if (options.setpoint !== undefined && !Number.isFinite(options.setpoint)) {
      throw new TypeError("Setpoint must be a finite number");
    }

    if (
      options.channel !== undefined &&
      (!Number.isSafeInteger(options.channel) || options.channel < 1)
    ) {
      throw new TypeError("Channel must be a positive integer");
    }

    const writes: Promise<void>[] = [];

    if (options.channel !== undefined) {
      writes.push(this.send(uuid, { cc: String(options.channel) }));
    }

    if (options.setpoint !== undefined) {
      writes.push(this.send(uuid, { t: "fan", setpoint: String(options.setpoint) }));
    }

    await Promise.all(writes);
  }

  async setSpeed(uuid: string, percent: number): Promise<void> {
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new TypeError("Fan speed must be a number between 0 and 100");
    }

    await this.send(uuid, { t: "fan", p: String(percent / 100) });
  }

  async off(uuid: string): Promise<void> {
    await this.send(uuid, { t: "fan", setpoint: "0" });
  }
}
