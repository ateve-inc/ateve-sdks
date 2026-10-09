import type {
  AnswerBlock,
  Citation,
  ImageItem,
  QueryInfo,
  SearchResponse,
  SearchResult,
  Usage,
  VideoItem,
} from "../types";
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

function citation(value: unknown): Citation {
  const item = record(value);
  const parsed: Citation = {};
  assign(parsed, "url", string(item.url));
  assign(parsed, "title", string(item.title));
  assign(parsed, "startIndex", number(item.start_index));
  assign(parsed, "endIndex", number(item.end_index));
  assign(parsed, "quote", string(item.quote));
  return parsed;
}

function answer(value: unknown): AnswerBlock {
  const item = record(value);
  const parsed: AnswerBlock = {};
  assign(parsed, "content", string(item.content));
  if (Array.isArray(item.citations)) {
    parsed.citations = item.citations.map(citation);
  }
  return parsed;
}

function queryInfo(value: unknown): QueryInfo {
  const item = record(value);
  const original = string(item.original);
  if (original === undefined) {
    throw new TypeError("QueryInfo.original is required");
  }
  const parsed: QueryInfo = { original };
  assign(parsed, "effective", string(item.effective));
  if (item.auto_tuned !== undefined) {
    parsed.autoTuned = record(item.auto_tuned);
  }
  return parsed;
}

function result(value: unknown): SearchResult {
  const item = record(value);
  const parsed: SearchResult = { images: Array.isArray(item.images) ? item.images.map(image) : [] };
  assign(parsed, "id", string(item.id));
  assign(parsed, "title", string(item.title));
  assign(parsed, "url", string(item.url));
  assign(parsed, "displayUrl", string(item.display_url));
  assign(parsed, "siteName", string(item.site_name));
  assign(parsed, "language", string(item.language));
  assign(parsed, "publishedAt", nullableString(item.published_at));
  assign(parsed, "score", number(item.score));
  assign(parsed, "snippet", string(item.snippet));
  assign(parsed, "rawContent", string(item.raw_content));
  assign(parsed, "summary", nullableString(item.summary));
  assign(parsed, "favicon", string(item.favicon));
  assign(parsed, "isSafe", nullableBoolean(item.is_safe));
  if (item.highlights === null) {
    parsed.highlights = null;
  } else if (Array.isArray(item.highlights)) {
    parsed.highlights = item.highlights.filter(
      (entry): entry is string => typeof entry === "string",
    );
  }
  return parsed;
}

function usage(value: unknown): Usage {
  const item = record(value);
  const parsed: Usage = {};
  assign(parsed, "credits", number(item.credits));
  if (item.breakdown !== undefined) {
    const breakdown = record(item.breakdown);
    parsed.breakdown = {};
    assign(parsed.breakdown, "search", number(breakdown.search));
    assign(parsed.breakdown, "rerank", number(breakdown.rerank));
    assign(parsed.breakdown, "answer", number(breakdown.answer));
  }
  return parsed;
}

function video(value: unknown): VideoItem {
  const item = record(value);
  const parsed: VideoItem = {};
  assign(parsed, "url", string(item.url));
  assign(parsed, "thumbnail", string(item.thumbnail));
  assign(parsed, "title", string(item.title));
  assign(parsed, "durationSeconds", number(item.duration_seconds));
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
  if (item.answer !== undefined) {
    parsed.answer = answer(item.answer);
  }
  if (Array.isArray(item.news)) {
    parsed.news = item.news.map(result);
  }
  if (Array.isArray(item.images)) {
    parsed.images = item.images.map(image);
  }
  if (Array.isArray(item.videos)) {
    parsed.videos = item.videos.map(video);
  }
  assign(parsed, "totalEstimatedMatches", nullableNumber(item.total_estimated_matches));
  if (item.usage !== undefined) {
    parsed.usage = usage(item.usage);
  }
  return parsed;
}
