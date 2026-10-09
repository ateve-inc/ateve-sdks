import type { SearchRequest } from "../types";

function requireIntegerRange(
  value: number | undefined,
  minimum: number,
  maximum: number,
  name: string,
): void {
  if (value !== undefined && (!Number.isInteger(value) || value < minimum || value > maximum)) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
}

function parseCalendarDate(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`dateRange contains an invalid date shape: ${value}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`dateRange contains an invalid calendar date: ${value}`);
  }
  return timestamp;
}

function validateDateRange(value: string | undefined): void {
  if (value === undefined || value === "" || ["day", "week", "month", "year"].includes(value)) {
    return;
  }
  if (!value.includes("..")) {
    parseCalendarDate(value);
    return;
  }
  const parts = value.split("..");
  if (parts.length !== 2 || (!parts[0] && !parts[1])) {
    throw new Error("dateRange must contain exactly one non-empty '..' range");
  }
  const start = parts[0] ? parseCalendarDate(parts[0]) : undefined;
  const end = parts[1] ? parseCalendarDate(parts[1]) : undefined;
  if (start !== undefined && end !== undefined && end < start) {
    throw new Error("dateRange end date must be on or after the start date");
  }
}

function validateTimeZone(value: string): void {
  if (/^(PST|EST|CST|MST)$/.test(value) || /^UTC[+-]/.test(value)) {
    throw new Error("timezone must be a region-based IANA Time Zone identifier");
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
  } catch (error) {
    throw new Error("timezone must be a valid IANA Time Zone identifier", {
      cause: error,
    });
  }
}

export function validateRequest(request: SearchRequest): void {
  if (typeof request.query !== "string" || !request.query.trim()) {
    throw new Error("query is required");
  }
  if (request.query.length > 2_000) {
    throw new Error("query must not exceed 2000 characters");
  }
  requireIntegerRange(request.maxResults, 1, 100, "maxResults");
  if (request.content?.text !== undefined) {
    const text = request.content.text;
    if (typeof text !== "object" || text === null || Array.isArray(text)) {
      throw new Error("content.text must be an object");
    }
    requireIntegerRange(text.maxCharacters, 1, 2_147_483_647, "content.text.maxCharacters");
    if (text.format !== undefined && !["text", "markdown"].includes(text.format)) {
      throw new Error("content.text.format must be 'text' or 'markdown'");
    }
  }
  if ((request.includeDomains?.length ?? 0) > 300) {
    throw new Error("includeDomains must not exceed 300 entries");
  }
  if ((request.excludeDomains?.length ?? 0) > 300) {
    throw new Error("excludeDomains must not exceed 300 entries");
  }
  validateDateRange(request.dateRange);
  if (request.locale?.mkt !== undefined && !/^[A-Z]{2}$/.test(request.locale.mkt)) {
    throw new Error("locale.mkt must be an uppercase ISO 3166-1 alpha-2 code");
  }
  if (request.locale?.language !== undefined && !/^[a-z]{2}$/.test(request.locale.language)) {
    throw new Error("locale.language must be a lowercase ISO 639-1 code");
  }
  if (
    request.locale?.userLocation?.country !== undefined &&
    !/^[A-Z]{2}$/.test(request.locale.userLocation.country)
  ) {
    throw new Error("locale.userLocation.country must be an uppercase ISO 3166-1 alpha-2 code");
  }
  if (request.locale?.userLocation?.timezone !== undefined) {
    validateTimeZone(request.locale.userLocation.timezone);
  }
}
