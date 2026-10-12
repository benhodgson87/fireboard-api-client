import { describe, expect, it } from "vitest";
import {
  chartResponseSchema,
  devicesResponseSchema,
  sessionDetailSchema,
  sessionsResponseSchema,
} from "../src/index.js";

// These fixtures exercise the official attribute tables; they are not captured API responses.
describe("documented response properties", () => {
  it("retains documented device properties without requiring observed-only fields", () => {
    const device = {
      id: 1,
      uuid: "abc-123",
      title: "Grill",
      channels: [],
      created: "2026-10-12T10:00:00Z",
      hardware_id: "synthetic-serial",
      latest_temps: [{ channel: 1, temp: 100 }],
      device_log: { connected: true },
      last_templog: "2026-10-12T10:01:00Z",
      additional_property: "retained",
    };

    expect(devicesResponseSchema.parse([device])).toEqual([device]);
  });

  it("preserves additional properties inside nested channel and temperature data", () => {
    const device = {
      id: 1,
      uuid: "abc-123",
      title: "Grill",
      channels: [
        {
          id: 10,
          channel: 1,
          channel_label: "Pit",
          enabled: true,
          alerts: [],
          additional_property: true,
          last_templog: {
            temp: 100,
            created: "2026-10-12T10:00:00Z",
            additional_property: true,
          },
        },
      ],
    };

    expect(devicesResponseSchema.parse([device])).toEqual([device]);
  });

  it("retains session metadata and accepts summaries without device_ids", () => {
    const session = {
      id: 42,
      title: "Cook",
      description: "Lunch",
      start_time: "2026-10-12T10:00:00Z",
      end_time: null,
      duration: "2 hours",
      created: "2026-10-12T09:00:00Z",
      owner: { id: 1 },
      devices: [],
    };

    expect(sessionsResponseSchema.parse([session])).toEqual([session]);
    expect(sessionDetailSchema.parse(session)).toEqual({ ...session, notes: [] });
  });

  it("accepts the documented chart properties without inventing a channel_id", () => {
    const channel = {
      device: "abc-123",
      label: "Pit",
      degreetype: 1,
      x: [1704110400],
      y: [100],
    };

    const result = chartResponseSchema.parse([channel]);

    expect(result).toEqual([channel]);
    expect(result[0]).not.toHaveProperty("channel_id");
  });

  it("keeps observed channel identifiers while preserving additional response data", () => {
    const channel = {
      device: "abc-123",
      label: "Pit",
      degreetype: 2,
      channel_id: 1,
      x: [1704110400],
      y: [225],
      additional_property: true,
    };

    expect(chartResponseSchema.parse([channel])).toEqual([{ ...channel, channel_id: "1" }]);
  });
});
