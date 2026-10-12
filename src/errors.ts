export type FireboardErrorCode =
  | "AUTHENTICATION"
  | "RATE_LIMIT"
  | "API_UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "TIMEOUT"
  | "NETWORK";

export class FireboardError extends Error {
  constructor(
    message: string,
    public readonly code: FireboardErrorCode,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "FireboardError";
  }
}
