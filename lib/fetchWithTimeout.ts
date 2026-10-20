import "server-only";

/**
 * `fetch` with a hard timeout, shared by every outbound call from an API
 * route (ipapi, OpenWeather, Google Places). A hung upstream must never hang
 * the route past a bounded time — the caller always gets a response (success
 * or a thrown error to catch-and-fall-back-to-demo-data), never silence.
 */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = 4000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
