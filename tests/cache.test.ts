import { afterEach, describe, expect, it, vi } from "vitest";
import { device, jsonResponse, createClient } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

describe("device cache", () => {
  it("shares in-flight requests and reuses completed responses within the TTL", async () => {
    let resolve!: (response: Response) => void;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValue(jsonResponse([device]));
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const api = createClient(fetcher);

    const first = api.getDevices();
    const concurrent = api.getDevices();

    expect(fetcher).toHaveBeenCalledTimes(1);

    resolve(jsonResponse([device]));

    expect(await first).toMatchObject({ fromCache: false });

    expect(await concurrent).toMatchObject({ fromCache: false });

    clock.mockReturnValue(now + 30_000);

    expect(await api.getDevices()).toMatchObject({ fromCache: true, cacheAgeSeconds: 30 });

    clock.mockReturnValue(now + 120_000);

    expect(await api.getDevices()).toMatchObject({ fromCache: false });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("isolates clients, supports disabling the cache, and retries failed reads", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockImplementation(async () => jsonResponse([device]));
    const api = createClient(fetcher, { deviceCacheTtlMs: 0 });

    await expect(api.getDevices()).rejects.toMatchObject({ code: "API_UNAVAILABLE" });

    await api.getDevices();

    await api.getDevices();
    await createClient(fetcher, { token: "other-token" }).getDevices();

    expect(fetcher).toHaveBeenCalledTimes(4);

    expect(fetcher.mock.calls[3]?.[1]?.headers).toMatchObject({
      Authorization: "Token other-token",
    });
  });
});
