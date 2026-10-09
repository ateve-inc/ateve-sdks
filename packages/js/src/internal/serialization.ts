import type { SearchRequest } from "../types";
import { assign } from "./values";

export function toWire(request: SearchRequest): Record<string, unknown> {
  const wire: Record<string, unknown> = { query: request.query };
  assign(wire, "limit", request.limit);
  assign(wire, "offset", request.offset);
  assign(wire, "date_range", request.dateRange);
  assign(wire, "include_domains", request.includeDomains);
  assign(wire, "exclude_domains", request.excludeDomains);
  assign(wire, "safe_search", request.safeSearch);
  if (request.locale !== undefined) {
    const locale: Record<string, unknown> = {};
    assign(locale, "mkt", request.locale.mkt);
    assign(locale, "language", request.locale.language);
    if (request.locale.userLocation !== undefined) {
      const location: Record<string, unknown> = {};
      assign(location, "country", request.locale.userLocation.country);
      assign(location, "region", request.locale.userLocation.region);
      assign(location, "city", request.locale.userLocation.city);
      assign(location, "timezone", request.locale.userLocation.timezone);
      locale.user_location = location;
    }
    wire.locale = locale;
  }
  if (request.content !== undefined) {
    const content: Record<string, unknown> = {};
    assign(content, "snippet", request.content.snippet);
    assign(content, "raw_content", request.content.rawContent);
    assign(content, "format", request.content.format);
    assign(content, "summary", request.content.summary);
    assign(content, "highlights", request.content.highlights);
    assign(content, "max_characters", request.content.maxCharacters);
    assign(content, "favicon", request.content.favicon);
    wire.content = content;
  }
  return wire;
}
