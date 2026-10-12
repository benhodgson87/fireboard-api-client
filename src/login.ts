import { z } from "zod";
import { decode, headers, request } from "./request.js";
import type { LoginOptions } from "./types.js";
import { validateEndpoint } from "./validation.js";

export const DEFAULT_LOGIN_URL = "https://fireboard.io/api/rest-auth/login/";

export async function login(
  credentials: { username: string; password: string },
  options: LoginOptions = {},
): Promise<string> {
  if (
    typeof credentials?.username !== "string" ||
    !credentials.username.trim() ||
    typeof credentials.password !== "string" ||
    !credentials.password
  ) {
    throw new TypeError("Username and password are required");
  }

  const loginUrl = validateEndpoint(options.loginUrl ?? DEFAULT_LOGIN_URL);
  const response = await request(
    loginUrl,
    {
      method: "POST",
      headers: { ...headers(options), "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    },
    options,
    true,
  );

  return (await decode(response, z.object({ key: z.string().min(1) }))).key;
}
