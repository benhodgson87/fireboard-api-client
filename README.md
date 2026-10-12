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

API reference: [Fireboard Cloud API](https://docs.fireboard.io/app/app-api/). This package implements the endpoints listed below; the official API also documents individual-device and device-temperature endpoints, which are not implemented yet.

## Methods

| Method                                      | Result                                                  | API calls                       |
| ------------------------------------------- | ------------------------------------------------------- | ------------------------------- |
| `getDevices()`                              | `{ data, fromCache, cacheAgeSeconds }`                  | 0 when cached; 1 on a miss      |
| `getDriveLog(deviceUuid)`                   | Most recent Drive log object                            | 1                               |
| `getSessions()`                             | Session summaries                                       | 1                               |
| `getSessionDetail(sessionId)`               | Session metadata, devices, and notes                    | 1                               |
| `getSessionChart(sessionId, includeDrive?)` | Raw temperature time-series, optionally including Drive | 1                               |
| `controlDrive(deviceUuid, payload)`         | `void`                                                  | 1                               |
| `login(credentials, options?)`              | API token                                               | Separate authentication request |

Responses retain Fireboard's field names and are validated with Zod. Exported `RawDevice`, `RawAlert`, `RawDriveLog`, `RawSessionSummary`, `RawSessionDetail`, and `RawChartChannel` types describe the parsed responses. Unknown fields are preserved so additional API properties are not discarded. Documented device and session properties are typed where their format is specified. Nested channel/alert/note fields and the optional `channel_id` and `device_ids` fields reflect observed responses; they are not a complete contract published by Fireboard.

Drive control’s `/mq.json` endpoint and payload are **not documented in the official API page**; they are based on the existing fireboard-mcp implementation and may change independently. Drive control writes to real hardware. The payload uses Fireboard's raw wire format, for example `{ t: "fan", p: "0.5" }` for 50% fan speed or `{ t: "fan", setpoint: "110" }` for a target in the device's configured temperature unit. The envelope and `request_type: "control"` are supplied by the client.

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

`FireboardError` exposes `code` and optional HTTP `status`: `AUTHENTICATION`, `RATE_LIMIT`, `API_UNAVAILABLE`, `INVALID_RESPONSE`, `TIMEOUT`, or `NETWORK`. Invalid arguments throw `TypeError`. Errors do not include response bodies, usernames, passwords, or API tokens. There is no built-in logging or dependency on environment variables.

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
