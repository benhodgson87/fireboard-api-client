export type DriveStatus = {
  setpoint: number;
  drive_percent: number;
  mode: string;
  tied_to_channel: number;
  tied_to_channel_label?: string;
  unit: string;
  as_of: string;
};

export type Alert = {
  id: number;
  temp_min: number;
  temp_max: number;
  notify_app: boolean;
  notify_email: boolean;
  notify_sms: boolean;
  time_start: string;
  time_stop: string;
  minutes_buffer: number;
  minutes_repeat: number;
  enabled: boolean;
};

export type DeviceChannel = {
  id: number;
  channel: number;
  label: string;
  alerts: Alert[];
};

export type DeviceSummary = {
  uuid: string;
  id: number;
  title: string;
  model_name?: string;
  channel_count?: number;
  battery?: number;
  channels: DeviceChannel[];
  last_drive?: DriveStatus;
};

export type DeviceWithTemps = {
  uuid: string;
  title: string;
  channels: ChannelReading[];
  last_drive?: DriveStatus;
};

export type ChannelReading = {
  label: string;
  temp: number;
  unit: string;
  as_of: string;
};

export type Note = {
  time: string;
  text: string;
  channel: number | null;
  device_uuid: string;
};

export type SessionSummary = {
  id: number;
  title: string;
  description: string;
  start: string;
  end: string | null;
  in_progress: boolean;
  device_uuids: string[];
};

export type SessionDetail = {
  id: number;
  title: string;
  description: string;
  start: string;
  end: string | null;
  in_progress: boolean;
  duration_minutes: number;
  devices: { uuid: string; title: string }[];
  channels: { label: string; device_uuid: string }[];
  notes: Note[];
};

export type ChartChannel = {
  device_uuid: string;
  label: string;
  unit: string;
  readings: { t: string; temp: number }[];
};

export type SessionChart = {
  session: {
    id: number;
    title: string;
    description: string;
    start: string;
    end: string | null;
    in_progress: boolean;
  };
  channels: ChartChannel[];
  notes: Note[];
};
