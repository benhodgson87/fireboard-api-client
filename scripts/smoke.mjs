import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  FireboardClient,
  transformDriveLog,
  DEFAULT_DEVICE_CACHE_TTL_MS,
} from "fireboard-api-client";

import { FireboardClient as RawFireboardClient } from "fireboard-api-client/raw";

const { version } = createRequire(import.meta.url)("../package.json");

let calls = 0;
const client = new FireboardClient({
  token: "synthetic-token",
  fetch: async (url, init) => {
    assert.equal(url, "https://fireboard.io/api/v1/sessions.json");
    assert.equal(init.headers.Authorization, "Token synthetic-token");
    assert.equal(init.headers["User-Agent"], `fireboard-api-client/${version}`);
    calls += 1;
    return Response.json([]);
  },
});
assert.deepEqual(await client.getSessions(), []);
assert.equal(calls, 1);
assert.equal(DEFAULT_DEVICE_CACHE_TTL_MS, 120_000);
assert.equal(
  transformDriveLog({
    setpoint: 110,
    driveper: 25,
    modetype: 2,
    tiedchannel: 1,
    degreetype: 1,
    created: "2026-01-01T00:00:00Z",
  }).unit,
  "C",
);
const device = {
  uuid: "abc-123",
  id: 1,
  title: "Grill",
  channels: [{ id: 1, channel: 1, channel_label: "Pit", enabled: true, alerts: [] }],
};
const options = {
  token: "synthetic-token",
  fetch: async () => Response.json([device]),
};
const normalised = new FireboardClient(options);
const raw = new RawFireboardClient(options);

assert.equal((await normalised.getDevices())[0].channels[0].label, "Pit");
assert.equal((await raw.getDevices())[0].channels[0].channel_label, "Pit");
console.log("Built package smoke check passed without Fireboard calls.");
