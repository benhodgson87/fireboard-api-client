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

for (const device of devices) {
  console.log(device.uuid, device.title, device.channels);
}
```

If you already have a token, pass it directly to `new FireboardClient({ token })`. Reuse one client per account: device lists are cached for two minutes by default. The client supplies Fireboard’s required User-Agent header and does not store login credentials.

API reference: [Fireboard API](https://docs.fireboard.io/app/app-api/).

## Methods

Read and write methods are called on `FireboardClient`. `login` is a standalone function. Read methods return promises of the listed types.

### Read methods

| Method                                      | What it does                                                                    | Returns              |
| ------------------------------------------- | ------------------------------------------------------------------------------- | -------------------- |
| `getDevices()`                              | Lists the account’s devices with channels, temperatures, and available metadata | `Device[]`           |
| `getDevicesWithCache()`                     | Lists devices with cache freshness metadata                                     | `DeviceListResult`   |
| `getDevice(deviceUuid)`                     | Retrieves detailed information for one device                                   | `Device`             |
| `getDeviceTemperatures(deviceUuid)`         | Retrieves the latest available readings                                         | `DeviceTemperatures` |
| `getDriveLog(deviceUuid)`                   | Retrieves a recent Drive log or an empty object                                 | `DriveLogResponse`   |
| `getSessions()`                             | Lists current and historical account sessions                                   | `SessionSummary[]`   |
| `getSessionDetail(sessionId)`               | Retrieves a session’s metadata, devices, and available notes                    | `SessionDetail`      |
| `getSessionChart(sessionId, includeDrive?)` | Retrieves temperature time-series, optionally including Drive data              | `ChartChannel[]`     |

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

Returns an array of devices, cached for two minutes by default. Pass a device’s `uuid`, not its numeric `id`, to device reads and Drive controls.

### `getDevicesWithCache()`

Returns `{ data, fromCache, cacheAgeSeconds }`, where `data` is `Device[]`. Shares the cache with `getDevices()`. Newly fetched responses have `fromCache: false` and age `0`; cached responses report their rounded age in seconds. This age describes the cached response, not the readings within it.

### `getDevice(deviceUuid)`

Returns the device and its available channel metadata without using the device-list cache.

### `getDeviceTemperatures(deviceUuid)`

Retrieves the latest available channel temperatures. Fireboard documents a one-minute freshness cutoff, but live checks returned older data after power-off. Check reading timestamps before treating values as current.

Fireboard does not document this response’s JSON shape. `DeviceTemperatures` preserves the returned JSON; narrow the result before accessing its fields.

### `getDriveLog(deviceUuid)`

Returns a recent Drive log with `driveper`, `setpoint`, `modetype`, `tiedchannel`, `degreetype`, and `created` fields, or `{}` when no recent log is available.

Check for an empty object before accessing log fields. Incomplete non-empty logs and other response shapes raise `INVALID_RESPONSE`.

```typescript
const drive = await fireboard.getDriveLog("your-device-uuid");

if (Object.keys(drive).length === 0) {
  console.log("No recent Drive data");
}
```

### `getSessions()`

Returns account session summaries. Ordering is not guaranteed; sort or filter results as needed.

Use each summary’s numeric `id` for session-detail and chart requests. `device_ids` is optional.

### `getSessionDetail(sessionId)`

Pass a non-negative integer session ID. Returns metadata, linked devices, and cook notes; omitted notes become `[]`.

### `getSessionChart(sessionId, includeDrive = false)`

Returns an array of channel series. Each includes `x` Unix timestamps in seconds, `y` temperature values or Drive percentages, `device`, `label`, and `degreetype`. `channel_id` is optional; numeric identifiers become strings.

```typescript
const temperatures = await fireboard.getSessionChart(42);
const temperaturesAndDrive = await fireboard.getSessionChart(42, true);
```

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

A value of `0` stops the fan. Use `setDriveOff()` to clear the setpoint as well.

### `setDriveOff(deviceUuid)`

Clears the setpoint by setting it to zero and stops the Drive fan.

```typescript
await fireboard.setDriveOff("your-device-uuid");
```

### Response validation

Responses retain Fireboard’s field names and extra fields, including nested fields. Zod validates known fields; extra fields are preserved without individual validation or specific TypeScript types. Missing alerts and notes become empty arrays, and numeric chart `channel_id` values become strings.

Use each reading or chart series’ `degreetype` to interpret temperatures: `1` is Celsius and `2` is Fahrenheit. Device-level unit metadata may differ from the reading’s unit. Channels remain listed when probes are unplugged, but reading fields may be omitted.

The exported TypeScript types describe the client’s validated fields, including observed fields not covered by Fireboard’s public reference.

## Options

`new FireboardClient({ token, baseUrl?, deviceCacheTtlMs?, timeoutMs?, fetch?, userAgent? })`

- `baseUrl`: defaults to `https://fireboard.io/api/v1`.
- `deviceCacheTtlMs`: device-list cache TTL; defaults to 120,000 ms. Set `0` to disable caching and shared in-flight reads.
- `timeoutMs`: defaults to 15,000 ms and covers fetching the response body.
- `fetch`: injectable for testing or custom transports.
- `userAgent`: optional application identification; defaults to `fireboard-api-client/<version>`.

`login` accepts `loginUrl`, `timeoutMs`, `fetch`, and `userAgent` separately. URL overrides must use HTTP(S), without credentials, query strings, or fragments. Redirects are rejected to avoid forwarding credentials.

## Caching and rate limits

Only `getDevices()` and `getDevicesWithCache()` are cached. Each client has its own cache, and concurrent cache misses share a request. The TTL starts when a valid response arrives; failures are never cached. Returned data is copied so caller mutations do not affect the cache.

Other reads and all writes are uncached. Writes do not invalidate cached device data. Nested temperature and Drive readings can remain stale until expiry; use `deviceCacheTtlMs: 0` for fresh device-list reads.

The client does not schedule requests or retry failures. Consuming applications remain responsible for rate-limit mitigation.

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
| `Device`                 | One parsed device and its available metadata/channels                  |
| `DeviceTemperatures`     | JSON returned by the temperature read, without an assumed field schema |
| `Alert`                  | An observed channel-alert model                                        |
| `DriveLogResponse`       | A populated `DriveLog` or an empty object                              |
| `DriveLog`               | An observed Drive-log model                                            |
| `SessionSummary`         | A session-list entry                                                   |
| `SessionDetail`          | Detailed session metadata, devices, and notes                          |
| `ChartChannel`           | One channel’s chart series                                             |

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
| `driveLogResponseSchema`           | A populated Drive log or an empty object                |
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
