import { afterEach, describe, expect, it, vi } from "vitest";
import { device, jsonResponse, createClient } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

describe("individual device reads", () => {
  it("reads a device directly without filling the device-list cache", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(device))
      .mockResolvedValueOnce(jsonResponse([device]));
    const api = createClient(fetcher);

    expect((await api.getDevice("abc-123")).uuid).toBe("abc-123");

    expect((await api.getDevices()).fromCache).toBe(false);

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://fireboard.io/api/v1/devices/abc-123.json",
      "https://fireboard.io/api/v1/devices.json",
    ]);
  });

  it("preserves temperature JSON and does not cache temperature reads", async () => {
    const readings = [{ channel: 1, temp: 100, extra: "preserved" }];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse(readings));
    const api = createClient(fetcher);

    expect(await api.getDeviceTemperatures("abc-123")).toEqual(readings);

    expect(await api.getDeviceTemperatures("abc-123")).toEqual(readings);

    expect(fetcher).toHaveBeenCalledTimes(2);

    expect(fetcher).toHaveBeenCalledWith(
      "https://fireboard.io/api/v1/devices/abc-123/temps.json",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Token synthetic-token" }),
      }),
    );
  });
});
