export { FireboardClient, DEFAULT_BASE_URL } from "./client.js";
export * from "./shared.js";

import type { DeviceListResult as CacheResult } from "./types.js";
import type { DeviceSummary } from "./transforms/types.js";

export type DeviceListResult = CacheResult<DeviceSummary>;
