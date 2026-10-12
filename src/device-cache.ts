import type { Device } from "./schemas.js";
import type { DeviceListResult } from "./types.js";

export const DEFAULT_DEVICE_CACHE_TTL_MS = 120_000;

export class DeviceCache {
  private cached: { data: Device[]; fetchedAt: number } | undefined;
  private pending: Promise<DeviceListResult> | undefined;

  constructor(private readonly ttlMs: number) {}

  async get(load: () => Promise<Device[]>): Promise<DeviceListResult> {
    if (this.ttlMs === 0) {
      return { data: await load(), fromCache: false, cacheAgeSeconds: 0 };
    }

    const now = Date.now();

    if (this.cached && now - this.cached.fetchedAt < this.ttlMs) {
      return {
        data: structuredClone(this.cached.data),
        fromCache: true,
        cacheAgeSeconds: Math.round((now - this.cached.fetchedAt) / 1000),
      };
    }

    if (!this.pending) {
      this.pending = this.fetch(load);
    }

    const pending = this.pending;

    try {
      const result = await pending;

      return { ...result, data: structuredClone(result.data) };
    } finally {
      if (this.pending === pending) {
        this.pending = undefined;
      }
    }
  }

  private async fetch(load: () => Promise<Device[]>): Promise<DeviceListResult> {
    const data = await load();

    this.cached = { data, fetchedAt: Date.now() };

    return { data, fromCache: false, cacheAgeSeconds: 0 };
  }
}
