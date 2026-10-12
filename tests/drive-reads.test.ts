import { describe, expect, it, vi } from "vitest";
import { createClient, jsonResponse } from "./helpers.js";

describe("Drive reads", () => {
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
