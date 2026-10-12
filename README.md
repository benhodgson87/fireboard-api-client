# Fireboard API Client

An unofficial TypeScript client for the [Fireboard](https://fireboard.io) temperature monitoring API. Provides typed, validated device, session, chart, and Drive responses using native `fetch`.

Requires Node.js 22 or newer. ESM only. Not affiliated with Fireboard.

## Installation

```sh
npm install fireboard-api-client
```

Version 0.1.0 is prepared for release, but has not been published. Before release, build and pack this repository with `npm ci && npm pack`, then install the resulting `.tgz` file.

## Usage

```typescript
import { FireboardClient, login } from "fireboard-api-client";

const token = await login({
  username: process.env.FIREBOARD_USERNAME!,
  password: process.env.FIREBOARD_PASSWORD!,
});
const fireboard = new FireboardClient({ token });

const { data: devices, fromCache, cacheAgeSeconds } = await fireboard.getDevices();
const sessions = await fireboard.getSessions();
const detail = await fireboard.getSessionDetail(42);
const chart = await fireboard.getSessionChart(42, true);
```

You can also provide an existing Fireboard API token. Fireboard requires a User-Agent header on all API calls, including login; the client supplies one by default. Authentication uses Fireboard's username/password exchange; this library does not implement OAuth or persist credentials.

API reference: [Fireboard Cloud API](https://docs.fireboard.io/app/app-api/).

## Methods

Create one `FireboardClient` per account/token and reuse it. `login` is a standalone function; the other methods are called on the client.

### Read methods

| Method                                      | What it does                                                                    | Returns                 | API calls                  |
| ------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------- | -------------------------- |
| `getDevices()`                              | Lists the account’s devices with channels, temperatures, and available metadata | `DeviceListResult`      | 0 when cached; 1 on a miss |
| `getDevice(deviceUuid)`                     | Retrieves detailed information for one device                                   | `RawDevice`             | 1, uncached                |
| `getDeviceTemperatures(deviceUuid)`         | Retrieves readings less than one minute old                                     | `RawDeviceTemperatures` | 1, uncached                |
| `getDriveLog(deviceUuid)`                   | Retrieves a Drive log less than one minute old                                  | `RawDriveLog`           | 1, uncached                |
| `getSessions()`                             | Lists current and historical account sessions                                   | `RawSessionSummary[]`   | 1, uncached                |
| `getSessionDetail(sessionId)`               | Retrieves a session’s metadata, devices, and available notes                    | `RawSessionDetail`      | 1, uncached                |
| `getSessionChart(sessionId, includeDrive?)` | Retrieves temperature time-series, optionally including Drive data              | `RawChartChannel[]`     | 1, uncached                |

### Write methods

| Method                                  | What it changes                                         | API calls                      |
| --------------------------------------- | ------------------------------------------------------- | ------------------------------ |
| `setDriveSetpoint(deviceUuid, options)` | Auto-mode temperature target and/or PID control channel | 1 for either field; 2 for both |
| `setDriveSpeed(deviceUuid, percent)`    | Manual fan speed, from 0 to 100 percent                 | 1                              |
| `setDriveOff(deviceUuid)`               | Clears the target and stops the fan                     | 1                              |

Writes return `Promise<void>`, are not cached or automatically retried, and do not refresh the device-list cache. They control real hardware. These commands use an API extension observed in fireboard-mcp, which is not documented on the official API page.

### Authentication

`login(credentials, options?)` exchanges credentials for an API token using one authentication request.

### `login(credentials, options?)`

Pass `{ username, password }`; `username` can be a Fireboard username or email address. Returns the API token from Fireboard’s `key` response field. Credentials are sent to Fireboard and are not stored by the library.

```typescript
const token = await login({ username: "your-email", password: "your-password" });
const fireboard = new FireboardClient({ token });
```

Options are `loginUrl`, `timeoutMs`, `fetch`, and `userAgent`. This function does not create an OAuth session or persist the returned token.

### `getDevices()`

Returns `{ data, fromCache, cacheAgeSeconds }`, where `data` is `RawDevice[]`. The device list is cached for two minutes by default. Concurrent cache misses share one request. `cacheAgeSeconds` reports the rounded age of cached data; a fresh response has age `0` and `fromCache: false`.

```typescript
const { data, fromCache, cacheAgeSeconds } = await fireboard.getDevices();
```

Reuse returned UUIDs in later method calls. Temperature and Drive readings nested in devices are subject to the device-list cache’s age.

### `getDevice(deviceUuid)`

Returns one device, including its available channel and device metadata. Pass the device’s UUID, not its numeric ID. This always makes a request and neither reads nor updates the device-list cache.

```typescript
const device = await fireboard.getDevice("your-device-uuid");
```

### `getDeviceTemperatures(deviceUuid)`

Retrieves the latest channel temperatures for one device. Fireboard includes readings only when they are less than one minute old; older channels are omitted. This method is not cached.

```typescript
const readings = await fireboard.getDeviceTemperatures("your-device-uuid");
```

The official reference does not specify the JSON fields or top-level response shape. `RawDeviceTemperatures` therefore preserves JSON as returned, without inventing a schema for individual readings. Narrow the result before accessing its fields.

### `getDriveLog(deviceUuid)`

Returns a recent Drive log containing the observed `driveper`, `setpoint`, `modetype`, `tiedchannel`, `degreetype`, and `created` fields. Pass the device’s UUID. This method is not cached.

```typescript
const drive = await fireboard.getDriveLog("your-device-uuid");
```

Fireboard only returns log data less than one minute old. The documented API does not define the empty/stale-log response shape; the current parser expects the single-object shape observed in fireboard-mcp and rejects other shapes with `INVALID_RESPONSE`.

### `getSessions()`

Returns session summaries for the authenticated account. This method is not cached. The official API does not guarantee ordering, so sort or filter results in your application as needed.

```typescript
const sessions = await fireboard.getSessions();
```

Use each summary’s numeric `id` for session-detail and chart requests. Observed fields such as `device_ids` are optional.

### `getSessionDetail(sessionId)`

Returns session metadata, linked devices, and available cook notes. Pass a non-negative integer session ID. This method is not cached. An omitted notes array is normalized to `[]`.

```typescript
const session = await fireboard.getSessionDetail(42);
```

Choose this method when you need session context without downloading temperature time-series.

### `getSessionChart(sessionId, includeDrive = false)`

Returns an array of channel series. Each includes `x` timestamps, `y` temperature values or Drive percentages, `device`, `label`, and `degreetype` (`1` for Celsius, `2` for Fahrenheit). Observed `channel_id` values are optional and numeric identifiers are normalized to strings.

```typescript
const temperatures = await fireboard.getSessionChart(42);
const temperaturesAndDrive = await fireboard.getSessionChart(42, true);
```

`includeDrive: true` sends `drive=1`; it does not add another API request. The method is not cached.

### `setDriveSetpoint(deviceUuid, options)`

Pass a finite numeric `setpoint`, a positive integer `channel`, or both. At least one is required, and all arguments are validated before any write is sent.

```typescript
await fireboard.setDriveSetpoint("your-device-uuid", { setpoint: 110 });
await fireboard.setDriveSetpoint("your-device-uuid", { channel: 2 });
await fireboard.setDriveSetpoint("your-device-uuid", { setpoint: 110, channel: 2 });
```

A setpoint switches Drive to automatic control. Its temperature must use the device’s configured unit; the client does not convert Celsius/Fahrenheit. A channel-only call changes the PID control probe without setting a new target.

Supplying both fields sends two separate writes in parallel. If one fails, the other may already have been applied. The method does not retry either write.

### `setDriveSpeed(deviceUuid, percent)`

Pass a finite percentage between `0` and `100`. This puts Drive in manual mode and overrides the active automatic target. The client converts the percentage into Fireboard’s wire-format fraction.

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

Responses retain Fireboard’s field names and are validated with Zod. Unknown fields, including nested fields, are preserved. Documented device/session metadata is typed where its format is specified. Nested channel, alert, and note models reflect observed responses rather than a complete contract published by Fireboard.

## Options

`new FireboardClient({ token, baseUrl?, deviceCacheTtlMs?, timeoutMs?, fetch?, userAgent? })`

- `baseUrl`: defaults to `https://fireboard.io/api/v1`.
- `deviceCacheTtlMs`: defaults to 120,000 ms; use `0` to disable caching.
- `timeoutMs`: defaults to 15,000 ms and covers fetching the response body.
- `fetch`: injectable for testing or custom transports.
- `userAgent`: optional application identification.

Fireboard documents a one-minute freshness cutoff for `latest_temps`, `/temps.json`, and `/drivelog.json`: older readings are not returned. This server-side cutoff is separate from the client’s device cache. The docs do not specify the empty Drive-log response shape.

The cache is isolated per client instance. Reuse an instance for the same account; simultaneous device reads share one request. Only the device list is cached, including its nested temperature and Drive readings. Writes do not refresh cached readings.

Fireboard limits each user to **17 API calls within any five-minute period**. The client does not automatically retry or schedule requests. Stop sending requests after a rate-limit response: continued requests can extend the block. Access resumes when the rate falls below the threshold, generally after approximately five minutes. Reuse device UUIDs and session IDs, cache device data, and request only the data you need.

`login` accepts `loginUrl`, `timeoutMs`, `fetch`, and `userAgent` options separately. Endpoint overrides must use HTTP(S), without credentials, query strings, or fragments. Requests reject redirects to avoid forwarding credentials unexpectedly.

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

Errors do not include response bodies, usernames, passwords, or API tokens. There is no built-in logging or dependency on environment variables.

## Other public exports

All public exports are imported from `"fireboard-api-client"`; no internal file paths are needed.

### TypeScript types

| Type                     | Describes                                                              |
| ------------------------ | ---------------------------------------------------------------------- |
| `FireboardClientOptions` | Constructor options, including the required token                      |
| `RequestOptions`         | Shared transport options: `fetch`, `timeoutMs`, and `userAgent`        |
| `LoginOptions`           | Login transport options and optional `loginUrl`                        |
| `DeviceListResult`       | Device-list data and cache metadata                                    |
| `DriveSetpointOptions`   | A setpoint, a control channel, or both for `setDriveSetpoint`          |
| `FireboardErrorCode`     | The union of error codes listed above                                  |
| `RawDevice`              | One parsed device and its available metadata/channels                  |
| `RawDeviceTemperatures`  | JSON returned by the temperature read, without an assumed field schema |
| `RawAlert`               | An observed channel-alert model                                        |
| `RawDriveLog`            | An observed Drive-log model                                            |
| `RawSessionSummary`      | A session-list entry                                                   |
| `RawSessionDetail`       | Detailed session metadata, devices, and notes                          |
| `RawChartChannel`        | One channel’s chart series                                             |

```typescript
import type { FireboardClientOptions, RawDevice } from "fireboard-api-client";

const options: FireboardClientOptions = { token: "your-api-token" };
const fireboard = new FireboardClient(options);
const device: RawDevice = await fireboard.getDevice("your-device-uuid");
```

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

GitHub CI validates and packs release candidates. The Release Please workflow follows `premium-bonds-client`: configure GitHub App secrets `APP_ID` and `APP_PRIVATE_KEY`, grant that App access to this repository, and configure a protected `npm` environment with `NPM_TOKEN` before enabling releases. No credentials are needed for CI or local tests. Publishing is a separate release action.
