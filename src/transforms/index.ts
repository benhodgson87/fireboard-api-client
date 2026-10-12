import type {
  RawAlert,
  RawChartChannel,
  RawDevice,
  RawDriveLog,
  RawSessionDetail,
  RawSessionSummary,
} from "../schemas.js";

import type {
  Alert,
  ChartChannel,
  DeviceSummary,
  DeviceWithTemps,
  DriveStatus,
  Note,
  SessionChart,
  SessionDetail,
  SessionSummary,
} from "./types.js";

function degreeUnit(degreetype: number): string {
  if (degreetype === 1) {
    return "C";
  }

  if (degreetype === 2) {
    return "F";
  }

  return String(degreetype);
}

function durationMinutes(startTime: string, endTime: string | null): number {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();

  return Math.round((end - start) / 60000);
}

function transformAlert(alert: RawAlert): Alert {
  return {
    id: alert.id,
    temp_min: alert.temp_min,
    temp_max: alert.temp_max,
    notify_app: alert.notify_app,
    notify_email: alert.notify_email,
    notify_sms: alert.notify_sms,
    time_start: alert.time_start,
    time_stop: alert.time_stop,
    minutes_buffer: alert.minutes_buffer,
    minutes_repeat: alert.minutes_repeat,
    enabled: alert.enabled,
  };
}

function transformNotes(notes: RawSessionDetail["notes"]): Note[] {
  return notes.map((n) => ({
    time: n.note_time,
    text: n.note_text,
    channel: n.channel,
    device_uuid: n.device,
  }));
}

/** Renames Drive fields and resolves the control-channel label when channels are supplied. */
export function transformDriveLog(log: RawDriveLog, channels?: RawDevice["channels"]): DriveStatus {
  const label = channels?.find((ch) => ch.channel === log.tiedchannel)?.channel_label;

  return {
    setpoint: log.setpoint,
    drive_percent: log.driveper,
    mode: String(log.modetype),
    tied_to_channel: log.tiedchannel,
    ...(label ? { tied_to_channel_label: label } : {}),
    unit: degreeUnit(log.degreetype),
    as_of: log.created,
  };
}

/** Selects device metadata, channel alerts, and the latest Drive status. */
export function transformDeviceSummary(device: RawDevice): DeviceSummary {
  return {
    uuid: device.uuid,
    id: device.id,
    title: device.title,
    ...(device.model_name ? { model_name: device.model_name } : {}),
    ...(device.channel_count !== undefined ? { channel_count: device.channel_count } : {}),
    ...(device.last_battery_reading !== undefined ? { battery: device.last_battery_reading } : {}),
    channels: device.channels.map((ch) => ({
      id: ch.id,
      channel: ch.channel,
      label: ch.channel_label,
      alerts: ch.alerts.map(transformAlert),
    })),
    ...(device.last_drivelog
      ? { last_drive: transformDriveLog(device.last_drivelog, device.channels) }
      : {}),
  };
}

/** Selects probe readings with a temperature, unit, and reading timestamp. */
export function transformDeviceWithTemps(device: RawDevice): DeviceWithTemps {
  const channels = device.channels
    .filter((ch) => ch.current_temp !== undefined && ch.last_templog && ch.degreetype != null)
    .map((ch) => ({
      label: ch.channel_label,
      temp: Number(ch.current_temp),
      unit: degreeUnit(Number(ch.degreetype)),
      as_of: ch.last_templog?.created ?? "",
    }));

  return {
    uuid: device.uuid,
    title: device.title,
    channels,
    ...(device.last_drivelog
      ? { last_drive: transformDriveLog(device.last_drivelog, device.channels) }
      : {}),
  };
}

/** Renames session timing fields and identifies active sessions. */
export function transformSessionSummary(session: RawSessionSummary): SessionSummary {
  return {
    id: session.id,
    title: session.title,
    description: session.description,
    start: session.start_time,
    end: session.end_time,
    in_progress: session.end_time === null,
    device_uuids: session.device_ids ?? [],
  };
}

/** Flattens channels and notes and computes duration using now for active sessions. */
export function transformSessionDetail(session: RawSessionDetail): SessionDetail {
  return {
    id: session.id,
    title: session.title,
    description: session.description,
    start: session.start_time,
    end: session.end_time,
    in_progress: session.end_time === null,
    duration_minutes: durationMinutes(session.start_time, session.end_time),
    devices: session.devices.map(({ uuid, title }) => ({ uuid, title })),
    channels: session.devices.flatMap((d) =>
      d.channels.map((ch) => ({
        label: ch.channel_label,
        device_uuid: d.uuid,
      })),
    ),
    notes: transformNotes(session.notes),
  };
}

/** Pairs chart values with ISO timestamps without converting temperature or Drive values. */
export function transformChartChannels(chart: RawChartChannel[]): ChartChannel[] {
  for (const channel of chart) {
    if (channel.x.length !== channel.y.length) {
      throw new TypeError("Chart timestamps and values must have the same length");
    }
  }

  return chart.map((ch) => ({
    device_uuid: ch.device,
    label: ch.label,
    unit: degreeUnit(ch.degreetype),
    readings: ch.x.map((t, i) => {
      const temp = ch.y[i];

      if (temp === undefined) {
        throw new TypeError("Chart timestamps and values must have the same length");
      }

      return { t: new Date(t * 1000).toISOString(), temp };
    }),
  }));
}

/** Combines session metadata and notes with cleaned chart channels. */
export function transformSessionChart(
  session: RawSessionDetail,
  chart: RawChartChannel[],
): SessionChart {
  return {
    session: {
      id: session.id,
      title: session.title,
      description: session.description,
      start: session.start_time,
      end: session.end_time,
      in_progress: session.end_time === null,
    },
    channels: transformChartChannels(chart),
    notes: transformNotes(session.notes),
  };
}

export type * from "./types.js";
