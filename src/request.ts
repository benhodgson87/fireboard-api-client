import type { z } from "zod";
import { FireboardError } from "./errors.js";
import type { RequestOptions } from "./types.js";
import { validateTiming } from "./validation.js";

export const DEFAULT_TIMEOUT_MS = 15_000;

export async function request(
  url: string,
  init: RequestInit,
  options: RequestOptions,
  isLogin = false,
): Promise<Response> {
  const timeoutMs = validateTiming(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, "timeoutMs");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await (options.fetch ?? globalThis.fetch)(url, {
      ...init,
      signal: controller.signal,
      redirect: "error",
    });

    if (response.status === 401 || (isLogin && response.status === 400)) {
      throw new FireboardError(
        "Invalid Fireboard token. Check your API key.",
        "AUTHENTICATION",
        response.status,
      );
    }

    if (response.status === 429) {
      throw new FireboardError(
        "Fireboard REST API rate limit reached (17 calls / 5 min). Further requests are blocked for ~5 minutes. See: https://docs.fireboard.io/app/app-api/#rate-limits",
        "RATE_LIMIT",
        429,
      );
    }

    if (!response.ok) {
      throw new FireboardError(
        "Fireboard API unavailable. Try again shortly.",
        "API_UNAVAILABLE",
        response.status,
      );
    }

    // Read the body under the timeout; method callers validate the decoded JSON.
    const body = await response.text();

    return new Response(body || null, { status: response.status, headers: response.headers });
  } catch (error) {
    if (error instanceof FireboardError) {
      throw error;
    }

    if (controller.signal.aborted) {
      throw new FireboardError("Fireboard API request timed out.", "TIMEOUT");
    }

    throw new FireboardError("Could not connect to the Fireboard API.", "NETWORK");
  } finally {
    clearTimeout(timer);
  }
}

export async function decode<S extends z.ZodType>(
  response: Response,
  schema: S,
): Promise<z.output<S>> {
  try {
    return schema.parse(await response.json());
  } catch {
    throw new FireboardError(
      "Unexpected Fireboard API response.",
      "INVALID_RESPONSE",
      response.status,
    );
  }
}

export function headers(options: RequestOptions, token?: string): Record<string, string> {
  return {
    ...(token ? { Authorization: `Token ${token}` } : {}),
    "User-Agent": options.userAgent ?? "fireboard-api-client",
  };
}
