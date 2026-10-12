import { describe, expect, it, vi } from "vitest";
import { createClient, jsonResponse } from "./helpers.js";

describe("Drive reads", () => {
  it("preserves an empty log when no recent Drive data is available", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}));
    const api = createClient(fetcher);

    expect(await api.getDriveLog("abc-123")).toEqual({});
  });

  it.each([{ driveper: 0 }, { unexpected: true }, null, []])(
    "rejects malformed non-log responses: %j",
    async (body) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body));
      const api = createClient(fetcher);

      await expect(api.getDriveLog("abc-123")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    },
  );

  it("reads the single-object Drive log", async () => {
    const log = {
      tiedchannel: 1,
      setpoint: 110,
      driveper: 0.5,
      modetype: "Auto",
      degreetype: 1,
      created: "2026-10-12T12:00:00Z",
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(log));
    const api = createClient(fetcher);

    expect(await api.getDriveLog("abc-123")).toEqual(log);
  });
});
