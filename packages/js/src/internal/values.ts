export function assign<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function number(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

export function boolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function nullableString(value: unknown): string | null | undefined {
  return value === null ? null : string(value);
}

export function nullableNumber(value: unknown): number | null | undefined {
  return value === null ? null : number(value);
}

export function nullableBoolean(value: unknown): boolean | null | undefined {
  return value === null ? null : boolean(value);
}
