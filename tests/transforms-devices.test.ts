import { afterEach, describe, expect, it, vi } from "vitest";
import {
  transformDriveLog,
  transformDeviceSummary,
  transformDeviceWithTemps,
} from "../src/index.js";

const baseDriveLog = {
  driveper: 45.5,
  setpoint: 107.0,
  modetype: "Managed",
  tiedchannel: 1,
  degreetype: 1 as const,
  created: "2026-06-13T08:48:12Z",
};

const baseDevice = {
  uuid: "abc-123",
  id: 246277,
  title: "Big Green Egg",
  channel_count: 3,
  channels: [],
  active: true,
  last_drivelog: null,
};

afterEach(() => vi.restoreAllMocks());

describe("transformDriveLog", () => {
  it("maps fields correctly", () => {
    expect(transformDriveLog(baseDriveLog)).toEqual({
      setpoint: 107.0,
      drive_percent: 45.5,
      mode: "Managed",
      tied_to_channel: 1,
      unit: "C",
      as_of: "2026-06-13T08:48:12Z",
    });
  });

  it("maps degreetype 2 to F", () => {
    expect(transformDriveLog({ ...baseDriveLog, degreetype: 2 }).unit).toBe("F");
  });

  it("stringifies numeric modetype", () => {
    expect(transformDriveLog({ ...baseDriveLog, modetype: 2 }).mode).toBe("2");
  });
});

describe("transformDeviceSummary", () => {
  it("maps basic fields", () => {
    expect(transformDeviceSummary(baseDevice)).toEqual({
      uuid: "abc-123",
      id: 246277,
      title: "Big Green Egg",
      channel_count: 3,
      channels: [],
    });
  });

  it("includes last_drive when last_drivelog present", () => {
    const result = transformDeviceSummary({
      ...baseDevice,
      last_drivelog: baseDriveLog,
    });

    expect(result.last_drive?.drive_percent).toBe(45.5);
  });

  it("omits last_drive when last_drivelog is null", () => {
    expect(transformDeviceSummary(baseDevice).last_drive).toBeUndefined();
  });
});

describe("transformDeviceWithTemps", () => {
  it("includes channels with current_temp and last_templog", () => {
    const device = {
      ...baseDevice,
      channels: [
        {
          id: 53744333,
          channel: 1,
          channel_label: "Ambient Temp",
          current_temp: 118.0,
          degreetype: 1 as const,
          enabled: true,
          alerts: [],
          last_templog: {
            temp: 118.0,
            created: "2026-06-13T08:48:10Z",
            degreetype: 1 as const,
          },
        },
      ],
    };
    const result = transformDeviceWithTemps(device);

    expect(result.channels).toHaveLength(1);
    expect(result.channels[0]).toEqual({
      label: "Ambient Temp",
      temp: 118.0,
      unit: "C",
      as_of: "2026-06-13T08:48:10Z",
    });
  });

  it("omits channels without current_temp", () => {
    const device = {
      ...baseDevice,
      channels: [
        {
          id: 53744335,
          channel: 3,
          channel_label: "Channel 3",
          degreetype: 1 as const,
          enabled: true,
          alerts: [],
        },
      ],
    };

    expect(transformDeviceWithTemps(device).channels).toHaveLength(0);
  });
});

describe("device cleanup", () => {
  it("omits optional metadata rather than inventing values", () => {
    const { channel_count: _count, ...device } = baseDevice;
    const result = transformDeviceSummary(device);

    expect(result).not.toHaveProperty("channel_count");
    expect(result).not.toHaveProperty("battery");
    expect(result).not.toHaveProperty("model_name");
  });

  it("preserves zero readings and skips missing units or timestamps", () => {
    const channel = {
      id: 1,
      channel: 1,
      channel_label: "Pit",
      current_temp: 0,
      degreetype: 2,
      enabled: true,
      alerts: [],
      last_templog: { temp: 0, created: "2026-06-13T08:00:00Z" },
    };
    const result = transformDeviceWithTemps({
      ...baseDevice,
      channels: [channel, { ...channel, degreetype: null }, { ...channel, last_templog: null }],
      last_drivelog: baseDriveLog,
    });

    expect(result.channels).toEqual([
      { label: "Pit", temp: 0, unit: "F", as_of: "2026-06-13T08:00:00Z" },
    ]);

    expect(result.last_drive?.tied_to_channel_label).toBe("Pit");
  });
});
