import { afterEach, describe, expect, it, vi } from "vitest";
import { FireboardClient, FireboardError, login } from "../src/index.js";
import type { FireboardClientOptions } from "../src/index.js";

const device = {
  uuid: "abc-123",
  id: 1,
  title: "Grill",
  channel_count: 1,
  active: true,
  channels: [{ id: 1, channel: 1, channel_label: "Pit", degreetype: null, enabled: true }],
};
const json = (value: unknown, status = 200) => Response.json(value, { status });
const client = (fetcher: typeof fetch, extra: Partial<FireboardClientOptions> = {}) =>
  new FireboardClient({ token: "synthetic-token", fetch: fetcher, ...extra });
afterEach(() => vi.restoreAllMocks());

describe("requests and validation", () => {
  it("authenticates credentials at the separate login endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ key: "synthetic-login-token" }));
    expect(
      await login({ username: "test-user", password: "test-password" }, { fetch: fetcher }),
    ).toBe("synthetic-login-token");
    expect(fetcher).toHaveBeenCalledWith(
      "https://fireboard.io/api/rest-auth/login/",
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        body: JSON.stringify({ username: "test-user", password: "test-password" }),
      }),
    );
    expect(fetcher.mock.calls[0]?.[1]?.headers).not.toHaveProperty("Authorization");
  });
  it("reports bad login credentials and rejects malformed token responses", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, 400))
      .mockResolvedValueOnce(json({ key: "" }));
    await expect(login({ username: "x", password: "y" }, { fetch: fetcher })).rejects.toMatchObject(
      { code: "AUTHENTICATION", status: 400 },
    );
    await expect(login({ username: "x", password: "y" }, { fetch: fetcher })).rejects.toMatchObject(
      { code: "INVALID_RESPONSE" },
    );
  });
  it("sends token authorization and configured User-Agent without logging credentials", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json([]));
    const api = client(fetcher, {
      baseUrl: "https://example.test/api/v1/",
      userAgent: "fireboard-mcp/test",
    });
    await api.getSessions();
    expect(fetcher).toHaveBeenCalledWith(
      "https://example.test/api/v1/sessions.json",
      expect.objectContaining({
        headers: { Authorization: "Token synthetic-token", "User-Agent": "fireboard-mcp/test" },
        redirect: "error",
      }),
    );
    expect(JSON.stringify(api)).not.toContain("synthetic-token");
  });
  it.each([
    [401, "AUTHENTICATION"],
    [429, "RATE_LIMIT"],
    [500, "API_UNAVAILABLE"],
  ] as const)("classifies HTTP %s without exposing its response body", async (status, code) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ sensitive: "do not expose" }, status));
    const error = await client(fetcher)
      .getSessions()
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(FireboardError);
    expect(error).toMatchObject({ status, code });
    expect((error as Error).message).not.toContain("do not expose");
  });
  it("validates response shapes and supports nullable unused probe slots", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json([device]))
      .mockResolvedValueOnce(json({ unexpected: true }));
    expect((await client(fetcher).getDevices()).data[0]?.channels[0]?.degreetype).toBeNull();
    await expect(client(fetcher).getSessions()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("classifies network errors without exposing upstream error details", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("sensitive information"));
    await expect(client(fetcher).getSessions()).rejects.toMatchObject({
      code: "NETWORK",
      message: "Could not connect to the Fireboard API.",
    });
  });
  it("aborts timed-out requests", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    );
    await expect(client(fetcher, { timeoutMs: 5 }).getSessions()).rejects.toMatchObject({
      code: "TIMEOUT",
    });
  });
  it.each([
    { token: "" },
    { token: "x", baseUrl: "https://user:password@example.test" },
    { token: "x", baseUrl: "file:///tmp/data" },
    { token: "x", deviceCacheTtlMs: -1 },
    { token: "x", timeoutMs: 0 },
  ])("rejects invalid client options %j", (options) => {
    expect(() => new FireboardClient(options)).toThrow();
  });
});

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
      .mockResolvedValue(json([device]));
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const api = client(fetcher);
    const first = api.getDevices();
    const concurrent = api.getDevices();
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolve(json([device]));
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
      .mockResolvedValueOnce(json({}, 500))
      .mockImplementation(async () => json([device]));
    const a = client(fetcher, { deviceCacheTtlMs: 0 });
    await expect(a.getDevices()).rejects.toMatchObject({ code: "API_UNAVAILABLE" });
    await a.getDevices();
    await a.getDevices();
    await client(fetcher, { token: "other-token" }).getDevices();
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls[3]?.[1]?.headers).toMatchObject({
      Authorization: "Token other-token",
    });
  });
});

describe("individual device reads", () => {
  it("reads a device directly without filling the device-list cache", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(device))
      .mockResolvedValueOnce(json([device]));
    const api = client(fetcher);

    expect((await api.getDevice("abc-123")).uuid).toBe("abc-123");
    expect((await api.getDevices()).fromCache).toBe(false);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://fireboard.io/api/v1/devices/abc-123.json",
      "https://fireboard.io/api/v1/devices.json",
    ]);
  });

  it("preserves temperature JSON and does not cache temperature reads", async () => {
    const readings = [{ channel: 1, temp: 100, extra: "preserved" }];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => json(readings));
    const api = client(fetcher);

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

describe("sessions and Drive", () => {
  it("requests session details and chart options with typed raw results", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          id: 42,
          title: "Cook",
          description: "",
          start_time: "2026-10-12T12:00:00Z",
          end_time: null,
          devices: [],
        }),
      )
      .mockResolvedValueOnce(
        json([
          { device: "abc-123", label: "Pit", degreetype: 1, channel_id: 1, x: [123], y: [100] },
        ]),
      )
      .mockResolvedValueOnce(json([]));
    const api = client(fetcher);
    expect((await api.getSessionDetail(42)).notes).toEqual([]);
    expect((await api.getSessionChart(42, true))[0]?.channel_id).toBe("1");
    await api.getSessionChart(42);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://fireboard.io/api/v1/sessions/42.json",
      "https://fireboard.io/api/v1/sessions/42/chart.json?drive=1",
      "https://fireboard.io/api/v1/sessions/42/chart.json",
    ]);
  });
  it("reads the single-object Drive log and sends the control envelope", async () => {
    const log = {
      tiedchannel: 1,
      setpoint: 110,
      driveper: 0.5,
      modetype: "Auto",
      degreetype: 1,
      created: "2026-10-12T12:00:00Z",
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(log))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const api = client(fetcher);
    expect(await api.getDriveLog("abc-123")).toEqual(log);
    await api.controlDrive("abc-123", { t: "fan", p: "0.5" });
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        topic: "device",
        payload: { t: "fan", p: "0.5", request_type: "control" },
      }),
    });
  });
  it("rejects invalid resource identifiers before making requests", () => {
    const fetcher = vi.fn<typeof fetch>();
    const api = client(fetcher);
    expect(() => api.getSessionDetail(NaN)).toThrow("Invalid session ID");
    expect(() => api.getSessionChart(-1)).toThrow("Invalid session ID");
    expect(() => api.getDriveLog("..")).toThrow("Invalid device UUID");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
