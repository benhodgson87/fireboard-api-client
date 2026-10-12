import { describe, expect, it, vi } from "vitest";
import type { DriveSetpointOptions } from "../src/index.js";
import { createClient, device, jsonResponse } from "./helpers.js";

function controlFetch() {
  return vi.fn<typeof fetch>().mockImplementation(async () => new Response(null, { status: 204 }));
}

function payloads(fetcher: ReturnType<typeof controlFetch>) {
  return fetcher.mock.calls.map(([, init]) => JSON.parse(init?.body as string).payload);
}

describe("Drive controls", () => {
  it("converts a percentage to the raw manual fan-speed fraction", async () => {
    const fetcher = controlFetch();
    const api = createClient(fetcher);

    await api.setDriveSpeed("abc-123", 50);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://fireboard.io/api/v1/devices/abc-123/mq.json");
    expect(payloads(fetcher)).toEqual([{ t: "fan", p: "0.5", request_type: "control" }]);
    expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string).topic).toBe("device");
  });

  it("accepts both speed boundaries", async () => {
    const fetcher = controlFetch();
    const api = createClient(fetcher);

    await api.setDriveSpeed("abc-123", 0);
    await api.setDriveSpeed("abc-123", 100);

    expect(payloads(fetcher)).toEqual([
      { t: "fan", p: "0", request_type: "control" },
      { t: "fan", p: "1", request_type: "control" },
    ]);
  });

  it("sends one write for either a target or a control channel", async () => {
    const fetcher = controlFetch();
    const api = createClient(fetcher);

    await api.setDriveSetpoint("abc-123", { setpoint: 110 });
    await api.setDriveSetpoint("abc-123", { channel: 2 });

    expect(payloads(fetcher)).toEqual([
      { t: "fan", setpoint: "110", request_type: "control" },
      { cc: "2", request_type: "control" },
    ]);
  });

  it("sends separate writes when both target and channel are provided", async () => {
    const fetcher = controlFetch();
    const api = createClient(fetcher);

    await api.setDriveSetpoint("abc-123", { setpoint: 110, channel: 2 });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(payloads(fetcher)).toEqual([
      { cc: "2", request_type: "control" },
      { t: "fan", setpoint: "110", request_type: "control" },
    ]);
  });

  it("turns Drive off by clearing the setpoint", async () => {
    const fetcher = controlFetch();
    const api = createClient(fetcher);

    await api.setDriveOff("abc-123");

    expect(payloads(fetcher)).toEqual([{ t: "fan", setpoint: "0", request_type: "control" }]);
  });

  it.each([-1, 101, NaN, Infinity])("rejects invalid speed %s without writing", async (percent) => {
    const fetcher = controlFetch();
    const api = createClient(fetcher);

    await expect(api.setDriveSpeed("abc-123", percent)).rejects.toThrow("Fan speed");

    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([{}, { setpoint: NaN }, { setpoint: 110, channel: 0 }, { channel: 1.5 }])(
    "validates the entire setpoint request before any write: %j",
    async (options) => {
      const fetcher = controlFetch();
      const api = createClient(fetcher);

      await expect(
        api.setDriveSetpoint("abc-123", options as DriveSetpointOptions),
      ).rejects.toThrow();

      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("does not retry failed writes or invalidate the device-list cache", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse([device]))
      .mockResolvedValueOnce(jsonResponse({}, 500));
    const api = createClient(fetcher);

    await api.getDevices();

    await expect(api.setDriveOff("abc-123")).rejects.toMatchObject({ code: "API_UNAVAILABLE" });

    expect((await api.getDevices()).fromCache).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
