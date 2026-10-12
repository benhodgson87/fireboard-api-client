import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type {
  DeviceSummary,
  DeviceListResult,
  RawDevice,
  DriveStatus,
  RawDriveLog,
  SessionSummary,
  RawSessionSummary,
  SessionDetail,
  RawSessionDetail,
  ChartChannel,
  RawChartChannel,
} from "../src/index.js";
import { FireboardClient } from "../src/index.js";
import {
  FireboardClient as RawFireboardClient,
  type DeviceListResult as RawDeviceListResult,
} from "../src/raw.js";
import { device, jsonResponse } from "./helpers.js";

const drive = {
  tiedchannel: 1,
  setpoint: 110,
  driveper: 25,
  modetype: 2,
  degreetype: 1,
  created: "2026-01-01T00:00:00Z",
};
const session = {
  id: 42,
  title: "Cook",
  description: "Lunch",
  start_time: "2026-01-01T00:00:00Z",
  end_time: "2026-01-01T01:00:00Z",
  device_ids: ["abc-123"],
  devices: [],
  notes: [],
};
const chart = [{ device: "abc-123", label: "Pit", degreetype: 1, x: [0], y: [110] }];

describe("default transformed reads", () => {
  it("returns summaries from the main entry and original device fields from the raw entry", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        jsonResponse(String(url).endsWith("devices.json") ? [device] : device),
      );
    const api = new FireboardClient({ token: "synthetic-token", fetch: fetcher });
    const rawApi = new RawFireboardClient({ token: "synthetic-token", fetch: fetcher });

    const devices = await api.getDevices();
    const raw = await rawApi.getDevices();
    const metadata = await api.getDevicesWithCache();
    const rawMetadata = await rawApi.getDevicesWithCache();
    const individual = await api.getDevice("abc-123");
    const rawIndividual = await rawApi.getDevice("abc-123");

    expectTypeOf(devices).toEqualTypeOf<DeviceSummary[]>();
    expectTypeOf(raw).toEqualTypeOf<RawDevice[]>();
    expectTypeOf(metadata).toEqualTypeOf<DeviceListResult>();
    expectTypeOf(rawMetadata).toEqualTypeOf<RawDeviceListResult>();
    expectTypeOf(individual).toEqualTypeOf<DeviceSummary>();
    expectTypeOf(rawIndividual).toEqualTypeOf<RawDevice>();

    expect(devices[0]?.channels[0]).toEqual({ id: 1, channel: 1, label: "Pit", alerts: [] });
    expect(raw[0]?.channels[0]?.channel_label).toBe("Pit");
    expect(metadata).toMatchObject({ data: devices, fromCache: true });
    expect(rawMetadata).toMatchObject({ data: raw, fromCache: true });
    expect(individual).toEqual(devices[0]);
    expect(rawIndividual).toEqual(raw[0]);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("returns cleaned Drive status unless raw data is requested", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse(drive));
    const api = new FireboardClient({ token: "synthetic-token", fetch: fetcher });
    const rawApi = new RawFireboardClient({ token: "synthetic-token", fetch: fetcher });

    const status = await api.getDriveLog("abc-123");
    const raw = await rawApi.getDriveLog("abc-123");

    expectTypeOf(status).toEqualTypeOf<DriveStatus>();
    expectTypeOf(raw).toEqualTypeOf<RawDriveLog>();

    expect(status).toEqual({
      setpoint: 110,
      drive_percent: 25,
      mode: "2",
      tied_to_channel: 1,
      unit: "C",
      as_of: drive.created,
    });
    expect(raw).toEqual(drive);
  });

  it("returns cleaned session summaries and details with typed raw opt-outs", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        jsonResponse(String(url).endsWith("sessions.json") ? [session] : session),
      );
    const api = new FireboardClient({ token: "synthetic-token", fetch: fetcher });
    const rawApi = new RawFireboardClient({ token: "synthetic-token", fetch: fetcher });

    const summaries = await api.getSessions();
    const rawSummaries = await rawApi.getSessions();
    const detail = await api.getSessionDetail(42);
    const rawDetail = await rawApi.getSessionDetail(42);

    expectTypeOf(summaries).toEqualTypeOf<SessionSummary[]>();
    expectTypeOf(rawSummaries).toEqualTypeOf<RawSessionSummary[]>();
    expectTypeOf(detail).toEqualTypeOf<SessionDetail>();
    expectTypeOf(rawDetail).toEqualTypeOf<RawSessionDetail>();

    expect(summaries[0]).toEqual({
      id: 42,
      title: "Cook",
      description: "Lunch",
      start: session.start_time,
      end: session.end_time,
      in_progress: false,
      device_uuids: ["abc-123"],
    });
    expect(detail.duration_minutes).toBe(60);
    expect(detail.start).toBe(session.start_time);
    expect(rawSummaries[0]).toEqual(session);
    expect(rawDetail).toEqual(session);
  });

  it("returns fixed chart types from each entry and preserves includeDrive", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse(chart));
    const api = new FireboardClient({ token: "synthetic-token", fetch: fetcher });
    const rawApi = new RawFireboardClient({ token: "synthetic-token", fetch: fetcher });

    const cleaned = await api.getSessionChart(42);
    const raw = await rawApi.getSessionChart(42, true);
    const legacy = await api.getSessionChart(42, true);
    const legacyRaw = await rawApi.getSessionChart(42, true);

    expectTypeOf(cleaned).toEqualTypeOf<ChartChannel[]>();
    expectTypeOf(raw).toEqualTypeOf<RawChartChannel[]>();
    expectTypeOf(legacy).toEqualTypeOf<ChartChannel[]>();
    expectTypeOf(legacyRaw).toEqualTypeOf<RawChartChannel[]>();

    expect(cleaned).toEqual([
      {
        device_uuid: "abc-123",
        label: "Pit",
        unit: "C",
        readings: [{ t: "1970-01-01T00:00:00.000Z", temp: 110 }],
      },
    ]);
    expect(raw).toEqual(chart);
    expect(legacy).toEqual(cleaned);
    expect(legacyRaw).toEqual(raw);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://fireboard.io/api/v1/sessions/42/chart.json",
      "https://fireboard.io/api/v1/sessions/42/chart.json?drive=1",
      "https://fireboard.io/api/v1/sessions/42/chart.json?drive=1",
      "https://fireboard.io/api/v1/sessions/42/chart.json?drive=1",
    ]);
  });

  it("delegates writes and preserves unmodelled temperature JSON", async () => {
    const temperatures = [{ channel: 1, temp: 110, custom_field: true }];
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        String(url).endsWith("temps.json")
          ? jsonResponse(temperatures)
          : new Response(null, { status: 204 }),
      );
    const api = new FireboardClient({ token: "synthetic-token", fetch: fetcher });

    expect(await api.getDeviceTemperatures("abc-123")).toEqual(temperatures);

    await api.setDriveSetpoint("abc-123", { setpoint: 110 });
    await api.setDriveSpeed("abc-123", 50);
    await api.setDriveOff("abc-123");

    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(
      fetcher.mock.calls.slice(1).map(([, init]) => JSON.parse(init?.body as string).payload),
    ).toEqual([
      { t: "fan", setpoint: "110", request_type: "control" },
      { t: "fan", p: "0.5", request_type: "control" },
      { t: "fan", setpoint: "0", request_type: "control" },
    ]);
    expect(JSON.stringify(api)).not.toContain("synthetic-token");
  });
});
