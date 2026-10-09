export class BodyLimitExceededError extends Error {}

export async function readLimited(
  response: Response,
  maximum: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  signal?.throwIfAborted();
  const declared = response.headers.get("Content-Length");
  if (maximum > 0 && declared !== null && /^\d+$/.test(declared) && Number(declared) > maximum) {
    await response.body?.cancel();
    throw new BodyLimitExceededError();
  }
  if (response.body === null) {
    return new Uint8Array();
  }
  const reader = response.body.getReader();
  const onAbort = (): void => {
    void reader.cancel(signal?.reason).catch(() => {});
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) {
        break;
      }
      if (maximum > 0 && value.byteLength > maximum - received) {
        await reader.cancel();
        throw new BodyLimitExceededError();
      }
      received += value.byteLength;
      chunks.push(value);
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export function decodeJson(body: Uint8Array): unknown {
  const text = new TextDecoder().decode(body);
  if (!text) {
    return undefined;
  }
  return JSON.parse(text) as unknown;
}
