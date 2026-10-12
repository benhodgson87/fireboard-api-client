# Fireboard API Client

An unofficial TypeScript client for the [Fireboard](https://fireboard.io) temperature monitoring API. Read devices, temperatures, and cook sessions, or control a Drive fan with typed methods.

Responses are transformed by default into simpler, typed models for devices, Drive status, sessions, and charts. Import from `fireboard-api-client/raw` to use the original Fireboard response fields.

Requires Node.js 22 or newer. ESM only.

## Quick start

```sh
npm install fireboard-api-client
```

Obtain an API token with `login`:

```typescript
import { FireboardClient, login } from "fireboard-api-client";

const token = await login({
  username: process.env.FIREBOARD_USERNAME!,
  password: process.env.FIREBOARD_PASSWORD!,
});

const fireboard = new FireboardClient({ token });
const devices = await fireboard.getDevices();
const sessions = await fireboard.getSessions();
```

If you already have a token, pass it directly to `new FireboardClient({ token })`. Reuse one client per account. The library supplies Fireboard's required User-Agent header and does not store login credentials.

The main import returns cleaned responses documented below. Use `/raw` for validated Fireboard responses with their original field names:

```typescript
import { FireboardClient as RawFireboardClient } from "fireboard-api-client/raw";

const rawFireboard = new RawFireboardClient({ token });
const devices = await rawFireboard.getDevices();
// devices[0].channels[0].channel_label rather than .label
```

Both clients accept the same options and method arguments. Their caches are separate per instance. The [Fireboard API reference](https://docs.fireboard.io/app/app-api/) documents the underlying endpoints.

## Methods

All methods below are called on `FireboardClient`, except the standalone `login` function. Read methods return promises of the listed types.

### Read methods

| Method                                      | What it does                                                                    | Returns                 |
| ------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------- |
| `getDevices()`                              | Lists the account’s devices with channels, temperatures, and available metadata | `DeviceSummary[]`       |
| `getDevicesWithCache()`                     | Lists devices with cache freshness metadata                                     | `DeviceListResult`      |
| `getDevice(deviceUuid)`                     | Retrieves detailed information for one device                                   | `DeviceSummary`         |
| `getDeviceTemperatures(deviceUuid)`         | Retrieves readings less than one minute old                                     | `RawDeviceTemperatures` |
| `getDriveLog(deviceUuid)`                   | Retrieves a Drive log less than one minute old                                  | `DriveStatus`           |
| `getSessions()`                             | Lists current and historical account sessions                                   | `SessionSummary[]`      |
| `getSessionDetail(sessionId)`               | Retrieves a session’s metadata, devices, and available notes                    | `SessionDetail`         |
| `getSessionChart(sessionId, includeDrive?)` | Retrieves temperature time-series, optionally including Drive data              | `ChartChannel[]`        |

### Write methods

| Method                                  | What it changes                                         |
| --------------------------------------- | ------------------------------------------------------- |
| `setDriveSetpoint(deviceUuid, options)` | Auto-mode temperature target and/or PID control channel |
| `setDriveSpeed(deviceUuid, percent)`    | Manual fan speed, from 0 to 100 percent                 |
| `setDriveOff(deviceUuid)`               | Clears the target and stops the fan                     |

Writes return `Promise<void>` and are never automatically retried. Drive control uses a write API absent from Fireboard’s public reference.

### `login(credentials, options?)`

Pass `{ username, password }`; `username` can be a Fireboard username or email address. Returns the API token.

Options are `loginUrl`, `timeoutMs`, `fetch`, and `userAgent`. Store the returned token in your application if needed.

### `getDevices()`

Returns an array of [device summaries](#devicesummary), cached for two minutes by default. Reuse their UUIDs in later method calls.

```typescript
const devices = await fireboard.getDevices();
```

### `getDevicesWithCache()`

Returns `{ data, fromCache, cacheAgeSeconds }`, where `data` is `DeviceSummary[]` (`RawDevice[]` from `/raw`). Shares the same cache as `getDevices()`. Fresh responses have `fromCache: false` and age `0`; cached responses report their rounded age in seconds.

### `getDevice(deviceUuid)`

Pass the device’s UUID, not its numeric ID. Returns a [device summary](#devicesummary) with its available channel metadata. The `/raw` client retains all validated device fields.

### `getDeviceTemperatures(deviceUuid)`

Retrieves the latest channel temperatures for one device. Fireboard includes readings only when they are less than one minute old; older channels are omitted.

```typescript
const readings = await fireboard.getDeviceTemperatures("your-device-uuid");
```

Fireboard does not document this response’s JSON shape. `RawDeviceTemperatures` preserves the returned JSON; narrow the result before accessing its fields.

### `getDriveLog(deviceUuid)`

Returns a [Drive status](#drivestatus) with fan percentage, setpoint, mode, control channel, unit, and timestamp. Pass the device’s UUID.

```typescript
const drive = await fireboard.getDriveLog("your-device-uuid");
console.log(drive.drive_percent, drive.setpoint, drive.unit);
```

Fireboard only returns log data less than one minute old. The client expects a single object; other shapes raise `INVALID_RESPONSE`. Fireboard does not document the empty/stale-log response shape.

### `getSessions()`

Returns [session summaries](#sessionsummary). Ordering is not guaranteed; sort or filter results as needed.

Use each summary’s numeric `id` for session-detail and chart requests. Missing device identifiers become an empty `device_uuids` array.

### `getSessionDetail(sessionId)`

Pass a non-negative integer session ID. Returns [session details](#sessiondetail): metadata, timing, duration, linked devices, flattened channels, and cook notes. Omitted notes become `[]`.

### `getSessionChart(sessionId, includeDrive = false)`

Returns [chart channels](#chartchannel) with ISO timestamp/value pairs. Temperature and Drive values retain their source units.

```typescript
const temperatures = await fireboard.getSessionChart(42);
const temperaturesAndDrive = await fireboard.getSessionChart(42, true);
```

Passing `true` includes Drive data.

### `setDriveSetpoint(deviceUuid, options)`

Pass a finite numeric `setpoint`, a positive integer `channel`, or both. At least one is required, and all arguments are validated before any write is sent.

```typescript
await fireboard.setDriveSetpoint("your-device-uuid", { setpoint: 110 });
await fireboard.setDriveSetpoint("your-device-uuid", { channel: 2 });
await fireboard.setDriveSetpoint("your-device-uuid", { setpoint: 110, channel: 2 });
```

A setpoint switches Drive to automatic control. Its temperature must use the device’s configured unit; the client does not convert Celsius/Fahrenheit. A channel-only call changes the PID control probe without setting a new target.

Changes to the target and control channel are not atomic. If the method fails, one change may already have been applied.

### `setDriveSpeed(deviceUuid, percent)`

Pass a finite percentage between `0` and `100`. This puts Drive in manual mode and overrides the active automatic target.

```typescript
await fireboard.setDriveSpeed("your-device-uuid", 50);
```

A value of `0` stops the fan. Use `setDriveOff` when you want to explicitly clear the setpoint as well.

### `setDriveOff(deviceUuid)`

Clears the setpoint by setting it to zero and stops the Drive fan.

```typescript
await fireboard.setDriveOff("your-device-uuid");
```

### Response validation

Both clients validate Fireboard responses with Zod. The main client then selects and renames fields into the models below. The `/raw` client preserves original field names and unknown fields, including nested fields. Channel, alert, note, and Drive-log models include observed fields that Fireboard’s public reference does not fully specify.

## Response shapes

These types describe the main import. Optional fields are marked with `?` and omitted when unavailable. Temperature values and setpoints are never converted between Celsius and Fahrenheit. Unit codes `1` and `2` become `"C"` and `"F"`; other codes become strings.

### DeviceSummary

Returned by `getDevices()`, `getDevicesWithCache().data`, and `getDevice()`.

```typescript
{
  uuid: string;
  id: number;
  title: string;
  model_name?: string;
  channel_count?: number;
  battery?: number;
  channels: DeviceChannel[];
  last_drive?: DriveStatus;
}
```

`battery` comes from Fireboard’s `last_battery_reading` without rescaling. `last_drive` is omitted when no Drive log is available. Its control-channel label is resolved from the device’s channels.

Each `DeviceChannel` contains `id: number`, `channel: number`, `label: string`, and `alerts: Alert[]`. Channels remain present even without temperature readings. Device summaries omit current temperatures; use the `/raw` device data with `transformDeviceWithTemps` when you need probe readings.

Each `Alert` contains:

- `id: number`, `temp_min: number`, `temp_max: number`, and `enabled: boolean`.
- `notify_app: boolean`, `notify_email: boolean`, and `notify_sms: boolean`.
- `time_start: string`, `time_stop: string`, `minutes_buffer: number`, and `minutes_repeat: number`.

### DriveStatus

Returned by `getDriveLog()` and nested as `DeviceSummary.last_drive`.

```typescript
{
  setpoint: number;
  drive_percent: number;
  mode: string;
  tied_to_channel: number;
  tied_to_channel_label?: string;
  unit: string;
  as_of: string;
}
```

`drive_percent` preserves Fireboard’s `driveper` value. `mode` preserves the source mode, converting numeric codes to strings. `as_of` preserves the log’s `created` timestamp. A standalone `getDriveLog()` result has no channel label; nested device Drive status includes it when matched.

### SessionSummary

Returned by `getSessions()`.

```typescript
{
  id: number;
  title: string;
  description: string;
  start: string;
  end: string | null;
  in_progress: boolean;
  device_uuids: string[];
}
```

`start` and `end` preserve Fireboard’s timestamps. A null `end` means `in_progress: true`. Missing `device_ids` produces an empty `device_uuids` array. Ordering is not guaranteed.

### SessionDetail

Returned by `getSessionDetail()`.

```typescript
{
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
}
```

`duration_minutes` is rounded from the start/end timestamps. Active sessions use the current time. Channels are flattened across all linked devices.

Each `Note` contains `time: string`, `text: string`, `channel: number | null`, and `device_uuid: string`. A null channel means the note is not tied to a specific probe. Note timestamps are preserved; missing notes become an empty array.

### ChartChannel

Returned by `getSessionChart()`.

```typescript
{
  device_uuid: string;
  label: string;
  unit: string;
  readings: {
    t: string;
    temp: number;
  }
  [];
}
```

Fireboard’s Unix timestamps are converted to ISO UTC strings in `t`. `temp` holds the original temperature or Drive percentage for that series. Mismatched timestamp/value arrays throw `TypeError`.

For example:

```json
{
  "device_uuid": "abc-123",
  "label": "Pit",
  "unit": "C",
  "readings": [{ "t": "2026-01-01T00:00:00.000Z", "temp": 110 }]
}
```

### Device temperature responses

`getDeviceTemperatures()` returns `RawDeviceTemperatures` from both imports. Fireboard does not define this endpoint’s JSON structure, so the library preserves its JSON rather than assuming a model. Narrow the result before accessing fields.

### Raw responses

The `/raw` client has the same methods with these return types:

| Method                                      | Raw return type                                                      |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `getDevices()`                              | `RawDevice[]`                                                        |
| `getDevicesWithCache()`                     | `{ data: RawDevice[], fromCache: boolean, cacheAgeSeconds: number }` |
| `getDevice(deviceUuid)`                     | `RawDevice`                                                          |
| `getDeviceTemperatures(deviceUuid)`         | `RawDeviceTemperatures`                                              |
| `getDriveLog(deviceUuid)`                   | `RawDriveLog`                                                        |
| `getSessions()`                             | `RawSessionSummary[]`                                                |
| `getSessionDetail(sessionId)`               | `RawSessionDetail`                                                   |
| `getSessionChart(sessionId, includeDrive?)` | `RawChartChannel[]`                                                  |

Raw means validated source data, not the HTTP response: missing alerts/notes become empty arrays, and numeric chart `channel_id` values become strings. Other fields retain their original names and unknown properties are preserved.

## Additional transforms

Both imports export the transform helpers and their output types for working with stored or raw data:

| Helper                                  | Returns           | Purpose                                                      |
| --------------------------------------- | ----------------- | ------------------------------------------------------------ |
| `transformDeviceSummary(device)`        | `DeviceSummary`   | Device metadata, channels, alerts, battery, and Drive status |
| `transformDeviceWithTemps(device)`      | `DeviceWithTemps` | Probe readings with temperature, unit, and timestamp         |
| `transformDriveLog(log, channels?)`     | `DriveStatus`     | Cleaned Drive status and optional channel label              |
| `transformSessionSummary(session)`      | `SessionSummary`  | Session timing and device identifiers                        |
| `transformSessionDetail(session)`       | `SessionDetail`   | Session metadata, duration, channels, and notes              |
| `transformChartChannels(chart)`         | `ChartChannel[]`  | ISO timestamp/value pairs                                    |
| `transformSessionChart(session, chart)` | `SessionChart`    | Combined session metadata, chart channels, and notes         |

`DeviceWithTemps` contains `uuid: string`, `title: string`, `channels: ChannelReading[]`, and optional `last_drive: DriveStatus`. Each `ChannelReading` has `label: string`, `temp: number`, `unit: string`, and `as_of: string`. Channels missing a current temperature, unit, or reading timestamp are omitted.

```typescript
import { FireboardClient, transformDeviceWithTemps } from "fireboard-api-client/raw";

const fireboard = new FireboardClient({ token });
const readings = (await fireboard.getDevices()).map(transformDeviceWithTemps);
```

`SessionChart` contains `session` (the `id`, `title`, `description`, `start`, `end`, and `in_progress` fields), `channels: ChartChannel[]`, and `notes: Note[]`. All helpers leave inputs unchanged and omit fields outside their output models.

## Options

`new FireboardClient({ token, baseUrl?, deviceCacheTtlMs?, timeoutMs?, fetch?, userAgent? })`

- `baseUrl`: defaults to `https://fireboard.io/api/v1`.
- `deviceCacheTtlMs`: device-list cache TTL; defaults to 120,000 ms. Set `0` to disable caching and shared in-flight reads.
- `timeoutMs`: defaults to 15,000 ms and covers fetching the response body.
- `fetch`: injectable for testing or custom transports.
- `userAgent`: optional application identification; defaults to `fireboard-api-client/<version>`.

`login` accepts `loginUrl`, `timeoutMs`, `fetch`, and `userAgent` separately. URL overrides must use HTTP(S), without credentials, query strings, or fragments. Redirects are rejected to avoid forwarding credentials.

## Caching and rate limits

Only `getDevices()` and `getDevicesWithCache()` are cached. Reuse one client per account: its cache is isolated from other clients, and simultaneous cache misses share a request. The TTL starts when a valid response arrives; errors are never cached. Returned device data is copied so caller mutations do not affect later reads.

Other reads and all writes are uncached. Writes do not invalidate the device cache, so its nested temperature and Drive readings may remain stale until expiry. Set `deviceCacheTtlMs: 0` for fresh device reads.

The client does not schedule requests or retry failures. Consuming applications remain responsible for rate-limit mitigation.

Fireboard returns temperature and Drive-log readings only when they are less than one minute old. Cached device readings can be older.

Fireboard limits each user to **17 API calls within any five-minute period**. After a rate-limit error, pause requests: continued calls can extend the block. Access generally resumes after approximately five minutes, once the request rate falls below the threshold.

## Errors

API and transport failures throw `FireboardError`, with a `code` and an optional HTTP `status`. Invalid arguments throw `TypeError`.

| Code               | Meaning                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| `AUTHENTICATION`   | Fireboard rejected the token or login credentials                       |
| `RATE_LIMIT`       | Fireboard returned HTTP 429; stop making requests until access recovers |
| `API_UNAVAILABLE`  | Fireboard returned another unsuccessful HTTP response                   |
| `INVALID_RESPONSE` | Response JSON could not be parsed or did not match the expected model   |
| `TIMEOUT`          | The request or response-body read exceeded `timeoutMs`                  |
| `NETWORK`          | The transport failed, including rejected redirects                      |

```typescript
import { FireboardError } from "fireboard-api-client";

try {
  await fireboard.getSessions();
} catch (error) {
  if (error instanceof FireboardError) {
    console.error(error.code, error.status, error.message);
  } else {
    throw error;
  }
}
```

Errors omit response bodies and credentials.

## Other public exports

Both `"fireboard-api-client"` and `"fireboard-api-client/raw"` export the shared options, errors, constants, validators, and transform helpers. Each entry exports its own `FireboardClient` and matching `DeviceListResult` type.

### TypeScript types

| Type                     | Describes                                                                    |
| ------------------------ | ---------------------------------------------------------------------------- |
| `FireboardClientOptions` | Constructor options, including the required token                            |
| `RequestOptions`         | Shared transport options: `fetch`, `timeoutMs`, and `userAgent`              |
| `LoginOptions`           | Login transport options and optional `loginUrl`                              |
| `DeviceListResult`       | Device-list data and cache freshness metadata (data type matches the import) |
| `DriveSetpointOptions`   | A setpoint, a control channel, or both for `setDriveSetpoint`                |
| `FireboardErrorCode`     | The union of error codes listed above                                        |
| `RawDevice`              | One parsed device and its available metadata/channels                        |
| `RawDeviceTemperatures`  | JSON returned by the temperature read, without an assumed field schema       |
| `RawAlert`               | An observed channel-alert model                                              |
| `RawDriveLog`            | An observed Drive-log model                                                  |
| `RawSessionSummary`      | A session-list entry                                                         |
| `RawSessionDetail`       | Detailed session metadata, devices, and notes                                |
| `RawChartChannel`        | One channel’s chart series                                                   |

### Default constants

| Constant                      | Value                                       |
| ----------------------------- | ------------------------------------------- |
| `DEFAULT_BASE_URL`            | `https://fireboard.io/api/v1`               |
| `DEFAULT_LOGIN_URL`           | `https://fireboard.io/api/rest-auth/login/` |
| `DEFAULT_DEVICE_CACHE_TTL_MS` | `120_000`                                   |
| `DEFAULT_TIMEOUT_MS`          | `15_000`                                    |

### Zod validators

The client already validates responses. These exports are also available if you need to validate saved or externally fetched data:

| Validator                          | Accepts                                                 |
| ---------------------------------- | ------------------------------------------------------- |
| `deviceSchema`                     | One device                                              |
| `devicesResponseSchema`            | An array of devices                                     |
| `deviceTemperaturesResponseSchema` | JSON temperature data without an assumed response shape |
| `driveLogResponseSchema`           | The observed single-object Drive log                    |
| `sessionsResponseSchema`           | An array of session summaries                           |
| `sessionDetailSchema`              | One detailed session                                    |
| `chartChannelSchema`               | One chart channel                                       |
| `chartResponseSchema`              | An array of chart channels                              |

```typescript
import { devicesResponseSchema } from "fireboard-api-client";

const devices = devicesResponseSchema.parse(savedDeviceData);
```

## Development and releases

```sh
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npm run smoke
npm pack
```

The package contains compiled JavaScript and declaration files under `dist/`. `prepack` builds these automatically. Tests and smoke checks use synthetic responses and make no Fireboard account calls.

No Fireboard credentials are needed for local tests or CI. Release configuration is maintained in `.github/workflows/`.
