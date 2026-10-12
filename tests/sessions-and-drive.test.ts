import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, createClient } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

describe("sessions and Drive", () => {
  it("requests session details and chart options with typed raw results", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 42,
          title: "Cook",
          description: "",
          start_time: "2026-10-12T12:00:00Z",
          end_time: null,
          devices: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          { device: "abc-123", label: "Pit", degreetype: 1, channel_id: 1, x: [123], y: [100] },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse([]));
    const api = createClient(fetcher);

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
      .mockResolvedValueOnce(jsonResponse(log))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const api = createClient(fetcher);

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
    const api = createClient(fetcher);

    expect(() => api.getSessionDetail(NaN)).toThrow("Invalid session ID");

    expect(() => api.getSessionChart(-1)).toThrow("Invalid session ID");

    expect(() => api.getDriveLog("..")).toThrow("Invalid device UUID");

    expect(fetcher).not.toHaveBeenCalled();
  });
});
