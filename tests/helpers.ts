import { FireboardClient } from "../src/raw.js";
import type { FireboardClientOptions } from "../src/raw.js";

export const device = {
  uuid: "abc-123",
  id: 1,
  title: "Grill",
  channel_count: 1,
  active: true,
  channels: [
    {
      id: 1,
      channel: 1,
      channel_label: "Pit",
      degreetype: null,
      enabled: true,
    },
  ],
};

export function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

export function createClient(
  fetcher: typeof fetch,
  options: Partial<FireboardClientOptions> = {},
): FireboardClient {
  return new FireboardClient({
    token: "synthetic-token",
    fetch: fetcher,
    ...options,
  });
}
