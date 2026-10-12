# Fireboard API Client

An unofficial TypeScript client for the [Fireboard](https://fireboard.io) temperature monitoring API. Read devices, temperatures, and cook sessions, or control a Drive fan with typed methods.

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

API reference: [Fireboard Cloud API](https://docs.fireboard.io/app/app-api/).

## Methods

All methods below are called on `FireboardClient`, except the standalone `login` function. Read methods return promises of the listed types.

### Read methods

| Method                                      | What it does                                                                    | Returns                 |
| ------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------- |
| `getDevices()`                              | Lists the account’s devices with channels, temperatures, and available metadata | `RawDevice[]`           |
| `getDevicesWithCache()`                     | Lists devices with cache freshness metadata                                     | `DeviceListResult`      |
| `getDevice(deviceUuid)`                     | Retrieves detailed information for one device                                   | `RawDevice`             |
| `getDeviceTemperatures(deviceUuid)`         | Retrieves readings less than one minute old                                     | `RawDeviceTemperatures` |
| `getDriveLog(deviceUuid)`                   | Retrieves a Drive log less than one minute old                                  | `RawDriveLog`           |
| `getSessions()`                             | Lists current and historical account sessions                                   | `RawSessionSummary[]`   |
| `getSessionDetail(sessionId)`               | Retrieves a session’s metadata, devices, and available notes                    | `RawSessionDetail`      |
| `getSessionChart(sessionId, includeDrive?)` | Retrieves temperature time-series, optionally including Drive data              | `RawChartChannel[]`     |

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

Returns an array of devices, cached for two minutes by default. Reuse their UUIDs in later method calls.

```typescript
const devices = await fireboard.getDevices();
```

### `getDevicesWithCache()`

Returns `{ data, fromCache, cacheAgeSeconds }`, where `data` is `RawDevice[]`. Shares the same cache as `getDevices()`. Fresh responses have `fromCache: false` and age `0`; cached responses report their rounded age in seconds.

### `getDevice(deviceUuid)`

Pass the device’s UUID, not its numeric ID. Returns the device and its available channel metadata.

### `getDeviceTemperatures(deviceUuid)`

Retrieves the latest channel temperatures for one device. Fireboard includes readings only when they are less than one minute old; older channels are omitted.

```typescript
const readings = await fireboard.getDeviceTemperatures("your-device-uuid");
```

Fireboard does not document this response’s JSON shape. `RawDeviceTemperatures` preserves the returned JSON; narrow the result before accessing its fields.

### `getDriveLog(deviceUuid)`

Returns a recent Drive log containing the observed `driveper`, `setpoint`, `modetype`, `tiedchannel`, `degreetype`, and `created` fields. Pass the device’s UUID.

```typescript
const drive = await fireboard.getDriveLog("your-device-uuid");
```

Fireboard only returns log data less than one minute old. The client expects a single object; other shapes raise `INVALID_RESPONSE`. Fireboard does not document the empty/stale-log response shape.

### `getSessions()`

Returns account session summaries. Ordering is not guaranteed; sort or filter results as needed.

Use each summary’s numeric `id` for session-detail and chart requests. `device_ids` is optional.

### `getSessionDetail(sessionId)`

Pass a non-negative integer session ID. Returns metadata, linked devices, and cook notes; omitted notes become `[]`.

### `getSessionChart(sessionId, includeDrive = false)`

Returns an array of channel series. Each includes `x` timestamps, `y` temperature values or Drive percentages, `device`, `label`, and `degreetype` (`1` for Celsius, `2` for Fahrenheit). Observed `channel_id` values are optional and numeric identifiers are normalized to strings.

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

Responses retain Fireboard’s field names and unknown fields, including nested fields. Zod validates known fields. Channel, alert, note, and Drive-log models include observed fields that Fireboard’s public reference does not fully specify.

## Output transforms

Read methods return validated Fireboard data. Use these helpers to select useful fields and produce simpler output:

```typescript
import { transformDeviceWithTemps, transformSessionDetail } from "fireboard-api-client";

const readings = (await fireboard.getDevices()).map(transformDeviceWithTemps);
const session = transformSessionDetail(await fireboard.getSessionDetail(42));
```

| Helper                                  | Returns           | Cleanup                                                                                                |
| --------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------ |
| `transformDeviceSummary(device)`        | `DeviceSummary`   | Device metadata, channel labels, alerts, battery, and last Drive status                                |
| `transformDeviceWithTemps(device)`      | `DeviceWithTemps` | Probe readings with `temp`, `unit`, and `as_of`; omits channels without readings, units, or timestamps |
| `transformDriveLog(log, channels?)`     | `DriveStatus`     | Fan percentage, setpoint, mode, unit, timestamp, and optional control-channel label                    |
| `transformSessionSummary(session)`      | `SessionSummary`  | Start/end times, `in_progress`, and device UUIDs                                                       |
| `transformSessionDetail(session)`       | `SessionDetail`   | Duration in minutes, devices, flattened channels, and notes                                            |
| `transformChartChannels(chart)`         | `ChartChannel[]`  | Paired readings with ISO timestamps instead of separate `x`/`y` arrays                                 |
| `transformSessionChart(session, chart)` | `SessionChart`    | Session metadata, transformed chart channels, and notes                                                |

Transforms leave their inputs unchanged and omit fields outside their output models. Degree codes `1` and `2` become `C` and `F`; other codes remain strings. Values are not converted between units. Chart readings use `temp` for both temperatures and Drive percentages, matching the source series. Mismatched chart timestamp/value arrays throw `TypeError`.

Completed session durations use the end time; active sessions use the current time. If a session summary omits `device_ids`, `device_uuids` is empty. Missing device channel counts remain omitted.

All return types above are exported, along with `Alert`, `DeviceChannel`, `ChannelReading`, and `Note`.

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

All public exports are imported from `"fireboard-api-client"`; no internal file paths are needed.

### TypeScript types

| Type                     | Describes                                                              |
| ------------------------ | ---------------------------------------------------------------------- |
| `FireboardClientOptions` | Constructor options, including the required token                      |
| `RequestOptions`         | Shared transport options: `fetch`, `timeoutMs`, and `userAgent`        |
| `LoginOptions`           | Login transport options and optional `loginUrl`                        |
| `DeviceListResult`       | Device-list data and cache freshness metadata                          |
| `DriveSetpointOptions`   | A setpoint, a control channel, or both for `setDriveSetpoint`          |
| `FireboardErrorCode`     | The union of error codes listed above                                  |
| `RawDevice`              | One parsed device and its available metadata/channels                  |
| `RawDeviceTemperatures`  | JSON returned by the temperature read, without an assumed field schema |
| `RawAlert`               | An observed channel-alert model                                        |
| `RawDriveLog`            | An observed Drive-log model                                            |
| `RawSessionSummary`      | A session-list entry                                                   |
| `RawSessionDetail`       | Detailed session metadata, devices, and notes                          |
| `RawChartChannel`        | One channel’s chart series                                             |

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
