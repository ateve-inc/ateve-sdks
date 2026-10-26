import sharedGoldenResponse from "../../contract/fixtures/golden-response.json";

export const goldenResponse: typeof sharedGoldenResponse = sharedGoldenResponse;

export function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export function jsonResponse(value: unknown = goldenResponse, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (!headers.has("X-Request-Id")) headers.set("X-Request-Id", "req_header");
  return new Response(JSON.stringify(value), { status: 200, ...init, headers });
}
