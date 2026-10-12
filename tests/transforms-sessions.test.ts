import { afterEach, describe, expect, it, vi } from "vitest";
import { transformSessionSummary, transformSessionDetail } from "../src/index.js";

const baseSession = {
  id: 1,
  title: "Pulled Pork",
  description: "Test cook",
  start_time: "2026-06-13T07:00:00Z",
  end_time: "2026-06-13T19:00:00Z",
  devices: [
    {
      uuid: "device-1",
      title: "Big Green Egg",
      channels: [{ channel_label: "Ambient", channel: 1 }],
    },
  ],
  notes: [],
};

afterEach(() => vi.restoreAllMocks());

describe("transformSessionSummary", () => {
  it("sets in_progress true when end_time is null", () => {
    const session = {
      id: 1,
      title: "Test",
      description: "",
      start_time: "2026-06-13T07:00:00Z",
      end_time: null,
      device_ids: ["uuid-1"],
    };

    expect(transformSessionSummary(session).in_progress).toBe(true);
  });

  it("sets in_progress false when end_time is set", () => {
    const session = {
      id: 1,
      title: "Test",
      description: "",
      start_time: "2026-06-13T07:00:00Z",
      end_time: "2026-06-13T19:00:00Z",
      device_ids: [],
    };

    expect(transformSessionSummary(session).in_progress).toBe(false);
  });

  it("maps device_ids to device_uuids", () => {
    const session = {
      id: 1,
      title: "",
      description: "",
      start_time: "2026-06-13T07:00:00Z",
      end_time: null,
      device_ids: ["uuid-1", "uuid-2"],
    };

    expect(transformSessionSummary(session).device_uuids).toEqual(["uuid-1", "uuid-2"]);
  });
});

describe("transformSessionDetail", () => {
  it("computes duration_minutes for a completed session", () => {
    const result = transformSessionDetail(baseSession);

    expect(result.duration_minutes).toBe(720);
  });

  it("computes duration_minutes from now for in-progress session", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-06-13T08:00:00Z"));

    const session = { ...baseSession, end_time: null };
    const result = transformSessionDetail(session);

    expect(result.duration_minutes).toBe(60);
  });

  it("maps notes correctly", () => {
    const session = {
      ...baseSession,
      notes: [
        {
          note_time: "2026-06-13T10:00:00Z",
          note_text: "Spritz",
          channel: 2,
          device: "device-1",
        },
      ],
    };

    expect(transformSessionDetail(session).notes[0]).toEqual({
      time: "2026-06-13T10:00:00Z",
      text: "Spritz",
      channel: 2,
      device_uuid: "device-1",
    });
  });

  it("flattens channels from all devices", () => {
    const result = transformSessionDetail(baseSession);

    expect(result.channels).toEqual([{ label: "Ambient", device_uuid: "device-1" }]);
  });
});

describe("optional session identifiers", () => {
  it("returns an empty identifier list when device_ids is absent", () => {
    expect(
      transformSessionSummary({
        id: 1,
        title: "Cook",
        description: "",
        start_time: "2026-06-13T07:00:00Z",
        end_time: null,
      }).device_uuids,
    ).toEqual([]);
  });
});
