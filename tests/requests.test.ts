import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FireboardClient, FireboardError, login } from "../src/raw.js";
import { device, jsonResponse, createClient } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

describe("requests and validation", () => {
  it("includes the package version in the default User-Agent for reads, writes, and login", async () => {
    const { version } = createRequire(import.meta.url)("../package.json") as { version: string };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse({ key: "synthetic-login-token" }));
    const api = createClient(fetcher);

    await api.getDevices();
    await api.setDriveOff("abc-123");
    await login({ username: "test-user", password: "test-password" }, { fetch: fetcher });

    expect(fetcher).toHaveBeenCalledTimes(3);

    for (const [, init] of fetcher.mock.calls) {
      expect(init?.headers).toMatchObject({ "User-Agent": `fireboard-api-client/${version}` });
    }
  });

  it("authenticates credentials at the separate login endpoint", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ key: "synthetic-login-token" }));

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
      .mockResolvedValueOnce(jsonResponse({}, 400))
      .mockResolvedValueOnce(jsonResponse({ key: "" }));

    await expect(login({ username: "x", password: "y" }, { fetch: fetcher })).rejects.toMatchObject(
      { code: "AUTHENTICATION", status: 400 },
    );

    await expect(login({ username: "x", password: "y" }, { fetch: fetcher })).rejects.toMatchObject(
      { code: "INVALID_RESPONSE" },
    );
  });

  it("sends token authorization and configured User-Agent without logging credentials", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([]));
    const api = createClient(fetcher, {
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
      .mockResolvedValue(jsonResponse({ sensitive: "do not expose" }, status));
    const error = await createClient(fetcher)
      .getSessions()
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FireboardError);

    expect(error).toMatchObject({ status, code });

    expect((error as Error).message).not.toContain("do not expose");
  });

  it("validates response shapes and supports nullable unused probe slots", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse([device]))
      .mockResolvedValueOnce(jsonResponse({ unexpected: true }));

    expect((await createClient(fetcher).getDevices())[0]?.channels[0]?.degreetype).toBeNull();

    await expect(createClient(fetcher).getSessions()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("classifies network errors without exposing upstream error details", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("sensitive information"));

    await expect(createClient(fetcher).getSessions()).rejects.toMatchObject({
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

    await expect(createClient(fetcher, { timeoutMs: 5 }).getSessions()).rejects.toMatchObject({
      code: "TIMEOUT",
    });
  });

  it.each([
    { token: "" },
    { token: "x", baseUrl: "https://user:password@example.test" },
    { token: "x", baseUrl: "file:///tmp/data" },
    { token: "x", timeoutMs: 0 },
    { token: "x", deviceCacheTtlMs: -1 },
    { token: "x", deviceCacheTtlMs: Infinity },
  ])("rejects invalid client options %j", (options) => {
    expect(() => new FireboardClient(options)).toThrow();
  });
});
