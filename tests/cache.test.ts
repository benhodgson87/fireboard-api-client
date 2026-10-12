import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient, device, jsonResponse } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

describe("device-list cache", () => {
  it("shares concurrent reads and starts the TTL when the response completes", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(0);
    let resolve!: (response: Response) => void;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      )
      .mockImplementation(async () => jsonResponse([]));
    const api = createClient(fetcher);

    const raw = api.getDevices();
    const metadata = api.getDevicesWithCache();

    expect(fetcher).toHaveBeenCalledTimes(1);

    clock.mockReturnValue(10_000);
    resolve(jsonResponse([device]));

    expect(await raw).toMatchObject([device]);
    expect(await metadata).toMatchObject({ data: [device], fromCache: false, cacheAgeSeconds: 0 });

    clock.mockReturnValue(40_000);

    expect(await api.getDevicesWithCache()).toMatchObject({ fromCache: true, cacheAgeSeconds: 30 });
    expect(fetcher).toHaveBeenCalledTimes(1);

    clock.mockReturnValue(130_000);

    expect(await api.getDevicesWithCache()).toEqual({
      data: [],
      fromCache: false,
      cacheAgeSeconds: 0,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("supports custom TTLs and keeps different clients isolated", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(0);
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse([]));
    const api = createClient(fetcher, { deviceCacheTtlMs: 500 });
    const other = createClient(fetcher, { token: "other-token" });

    await api.getDevices();
    await other.getDevices();

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: "Token other-token",
    });

    clock.mockReturnValue(500);
    await api.getDevices();
    await other.getDevices();

    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("does not cache failures or poison later reads after a shared failure", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse([device]));
    const api = createClient(fetcher);

    const results = await Promise.allSettled([api.getDevices(), api.getDevicesWithCache()]);

    expect(results).toMatchObject([
      { status: "rejected", reason: { code: "RATE_LIMIT" } },
      { status: "rejected", reason: { code: "RATE_LIMIT" } },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);

    expect(await api.getDevicesWithCache()).toMatchObject({ fromCache: false, data: [device] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("protects cached data from mutations by consumers", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse([device]));
    const api = createClient(fetcher);

    const devices = await api.getDevices();
    devices[0]!.title = "Changed";
    devices[0]!.channels.splice(0);

    expect(await api.getDevices()).toMatchObject([device]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not cache individual devices, session reads, or Drive writes", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).endsWith("mq.json")) {
        return new Response(null, { status: 204 });
      }
      if (String(url).endsWith("abc-123.json")) {
        return jsonResponse(device);
      }
      return jsonResponse([]);
    });
    const api = createClient(fetcher);

    await api.getDevices();
    await api.getDevice("abc-123");
    await api.getDevice("abc-123");
    await api.getSessions();
    await api.getSessions();
    await api.setDriveOff("abc-123");
    await api.setDriveOff("abc-123");

    expect((await api.getDevicesWithCache()).fromCache).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(7);
  });
});
