import { afterEach, describe, expect, it, vi } from "vitest";
import { device, jsonResponse, createClient } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

describe("device reads", () => {
  it("sends separate requests for concurrent and repeated device-list reads", async () => {
    const pending: Array<(response: Response) => void> = [];
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() => new Promise<Response>((resolve) => pending.push(resolve)));
    const api = createClient(fetcher);

    const first = api.getDevices();
    const concurrent = api.getDevices();

    expect(fetcher).toHaveBeenCalledTimes(2);

    pending[0]!(jsonResponse([device]));
    pending[1]!(jsonResponse([]));

    expect(await first).toMatchObject([device]);
    expect(await concurrent).toEqual([]);

    const repeated = api.getDevices();

    expect(fetcher).toHaveBeenCalledTimes(3);

    pending[2]!(jsonResponse([]));

    expect(await repeated).toEqual([]);
  });

  it("does not retry failed device-list reads automatically", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse([device]));
    const api = createClient(fetcher);

    await expect(api.getDevices()).rejects.toMatchObject({ code: "RATE_LIMIT", status: 429 });

    expect(fetcher).toHaveBeenCalledTimes(1);

    expect(await api.getDevices()).toMatchObject([device]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("reads individual devices and the device list", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(device))
      .mockResolvedValueOnce(jsonResponse([device]));
    const api = createClient(fetcher);

    expect((await api.getDevice("abc-123")).uuid).toBe("abc-123");

    expect(await api.getDevices()).toMatchObject([device]);

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
