import assert from "node:assert/strict";
import { FireboardClient } from "../dist/index.js";

let calls = 0;
const client = new FireboardClient({
  token: "synthetic-token",
  fetch: async (url, init) => {
    assert.equal(url, "https://fireboard.io/api/v1/sessions.json");
    assert.equal(init.headers.Authorization, "Token synthetic-token");
    calls += 1;
    return Response.json([]);
  },
});
assert.deepEqual(await client.getSessions(), []);
assert.equal(calls, 1);
console.log("Built package smoke check passed without Fireboard calls.");
