import type { ImageItem, QueryInfo, SearchResponse, SearchResult } from "../types";
import {
  assign,
  record,
  string,
  number,
  nullableString,
  nullableNumber,
  nullableBoolean,
} from "./values";

function image(value: unknown): ImageItem {
  const item = record(value);
  return {
    url: string(item.url) ?? "",
    width: nullableNumber(item.width) ?? null,
    height: nullableNumber(item.height) ?? null,
    alt: nullableString(item.alt) ?? null,
  };
}

function queryInfo(value: unknown): QueryInfo {
  const item = record(value);
  const original = string(item.original);
  if (original === undefined) throw new TypeError("QueryInfo.original is required");
  return { original };
}

function result(value: unknown): SearchResult {
  const item = record(value);
  const parsed: SearchResult = { images: Array.isArray(item.images) ? item.images.map(image) : [] };
  assign(parsed, "id", string(item.id));
  assign(parsed, "title", string(item.title));
  assign(parsed, "url", string(item.url));
  assign(parsed, "displayUrl", string(item.display_url));
  assign(parsed, "publishedAt", nullableString(item.published_at));
  assign(parsed, "score", number(item.score));
  assign(parsed, "snippet", string(item.snippet));
  if (
    Array.isArray(item.highlights) &&
    item.highlights.every((value) => typeof value === "string")
  ) {
    parsed.highlights = item.highlights;
  }
  assign(parsed, "text", nullableString(item.text));
  assign(parsed, "favicon", string(item.favicon));
  assign(parsed, "isSafe", nullableBoolean(item.is_safe));
  return parsed;
}

export function searchResponse(value: unknown): SearchResponse {
  const item = record(value);
  const id = string(item.id);
  const created = number(item.created);
  const latencyMs = number(item.latency_ms);
  if (
    id === undefined ||
    created === undefined ||
    latencyMs === undefined ||
    string(record(item.query).original) === undefined ||
    !Array.isArray(item.results)
  ) {
    throw new TypeError("SearchResponse is missing one or more required fields");
  }
  const parsed: SearchResponse = {
    id,
    created,
    latencyMs,
    query: queryInfo(item.query),
    results: item.results.map(result),
  };
  assign(parsed, "totalEstimatedMatches", nullableNumber(item.total_estimated_matches));
  return parsed;
}
