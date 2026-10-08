export type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface AteveOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxConcurrentRequests?: number;
  fetch?: Fetch;
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}
