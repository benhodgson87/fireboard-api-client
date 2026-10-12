export function validateEndpoint(value: string): string {
  const url = new URL(value);

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new TypeError("Endpoint must be an HTTP(S) URL without credentials, query, or fragment");
  }

  return url.href;
}

export function validateTiming(value: number, name: string, allowZero = false): number {
  if (!Number.isFinite(value) || value < (allowZero ? 0 : 1) || value > 2_147_483_647) {
    throw new TypeError(`Invalid ${name}`);
  }

  return value;
}

export function encodeDeviceId(uuid: string): string {
  if (typeof uuid !== "string" || !uuid.trim() || uuid === "." || uuid === "..") {
    throw new TypeError("Invalid device UUID");
  }

  return encodeURIComponent(uuid);
}

export function validateSessionId(id: number): number {
  if (!Number.isSafeInteger(id) || id < 0) {
    throw new TypeError("Invalid session ID");
  }

  return id;
}
