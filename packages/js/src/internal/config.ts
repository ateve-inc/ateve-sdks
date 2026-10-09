import type { AteveOptions, Fetch } from "../options";

function environment(name: string): string | undefined {
  const maybeGlobal = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return maybeGlobal.process?.env?.[name];
}

function requireHeaderValue(value: string, name: string): string {
  const checked = value.trim();
  if (!checked) {
    throw new Error(`${name} must not be blank`);
  }
  // Header validation intentionally rejects control characters, including NUL.
  // oxlint-disable-next-line eslint/no-control-regex
  if (/[\r\n\u0000]/.test(checked)) {
    throw new Error(`${name} must not contain CR, LF, or NUL characters`);
  }
  return checked;
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch (error) {
    throw new Error(`baseUrl is not a valid URL: ${value}`, { cause: error });
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "baseUrl must be an absolute http(s) URL without user-info, query, or fragment",
    );
  }
  return url.toString().replace(/\/+$/, "");
}

export interface ClientConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxResponseBytes: number;
  maxConcurrentRequests: number;
  fetch: Fetch;
}

export function validateTimeout(value: number, name = "timeoutMs"): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be positive`);
  }
}

export function resolveConfig(
  options: AteveOptions,
  defaults: Pick<ClientConfig, "baseUrl" | "timeoutMs" | "maxResponseBytes">,
): ClientConfig {
  const apiKey = requireHeaderValue(options.apiKey ?? environment("ATEVE_API_KEY") ?? "", "apiKey");
  const baseUrl = normalizeBaseUrl(
    options.baseUrl ?? environment("ATEVE_BASE_URL") ?? defaults.baseUrl,
  );
  const timeoutMs = options.timeoutMs ?? defaults.timeoutMs;
  const maxResponseBytes = options.maxResponseBytes ?? defaults.maxResponseBytes;
  const maxConcurrentRequests = options.maxConcurrentRequests ?? 0;
  validateTimeout(timeoutMs);
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 0) {
    throw new Error("maxResponseBytes must be a non-negative integer");
  }
  if (!Number.isInteger(maxConcurrentRequests) || maxConcurrentRequests < 0) {
    throw new Error("maxConcurrentRequests must be a non-negative integer");
  }
  const fetch = options.fetch ?? globalThis.fetch?.bind(globalThis);
  if (fetch === undefined) {
    throw new Error("A global fetch implementation is required (Node.js 22+)");
  }
  return { apiKey, baseUrl, timeoutMs, maxResponseBytes, maxConcurrentRequests, fetch };
}
