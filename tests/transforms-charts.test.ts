import { transformChartChannels } from "../src/index.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { transformSessionChart } from "../src/index.js";

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

describe("transformSessionChart", () => {
  it("zips x/y arrays into readings with ISO timestamps", () => {
    const chart = [
      {
        device: "device-1",
        label: "Ambient Temp",
        degreetype: 1 as const,
        x: [1749790800, 1749790860],
        y: [100.0, 101.0],
        channel_id: "1",
      },
    ];
    const result = transformSessionChart(baseSession, chart);

    expect(result.channels[0]!.readings).toEqual([
      { t: new Date(1749790800 * 1000).toISOString(), temp: 100.0 },
      { t: new Date(1749790860 * 1000).toISOString(), temp: 101.0 },
    ]);
  });

  it("maps degreetype to unit string", () => {
    const chart = [
      {
        device: "device-1",
        label: "Probe",
        degreetype: 2 as const,
        x: [],
        y: [],
        channel_id: "1",
      },
    ];

    expect(transformSessionChart(baseSession, chart).channels[0]!.unit).toBe("F");
  });

  it("includes notes from session detail", () => {
    const session = {
      ...baseSession,
      notes: [
        {
          note_time: "2026-06-13T10:00:00Z",
          note_text: "Wrapped",
          channel: null,
          device: "device-1",
        },
      ],
    };
    const result = transformSessionChart(session, []);

    expect(result.notes[0]!.text).toBe("Wrapped");
  });
});

describe("chart validation", () => {
  it.each([
    { x: [0], y: [] },
    { x: [], y: [100] },
  ])("rejects unpaired timestamps and values: %j", ({ x, y }) => {
    expect(() =>
      transformChartChannels([{ device: "device-1", label: "Pit", degreetype: 1, x, y }]),
    ).toThrow("same length");
  });

  it("retains unknown unit codes without converting values", () => {
    const result = transformChartChannels([
      { device: "device-1", label: "Drive", degreetype: 3, x: [0], y: [50] },
    ]);

    expect(result).toEqual([
      {
        device_uuid: "device-1",
        label: "Drive",
        unit: "3",
        readings: [{ t: "1970-01-01T00:00:00.000Z", temp: 50 }],
      },
    ]);
  });
});
