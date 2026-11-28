import type {
  DecisionAnswer,
  DecisionResponse,
  FetchResponse,
  JsonValue,
  ListModelsResponse,
} from "../types";

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Expected a JSON object");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("Expected a string");
  return value;
}

function finiteNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("Expected a finite number");
  }
  return value;
}

function probability(value: unknown): number {
  const parsed = finiteNumber(value);
  if (parsed < 0 || parsed > 1) throw new TypeError("Expected a probability from 0 to 1");
  return parsed;
}

function tokens(value: unknown): number {
  const parsed = finiteNumber(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new TypeError("Expected a non-negative token count");
  }
  return parsed;
}

function map<T>(value: unknown, parse: (item: unknown) => T): Record<string, T> {
  return Object.fromEntries(Object.entries(object(value)).map(([key, item]) => [key, parse(item)]));
}

function level(value: unknown): string | JsonValue[] | { [key: string]: JsonValue } {
  if (typeof value === "string") return value;
  // Values come from JSON decoding. Only the top-level description kind is restricted.
  if (Array.isArray(value)) return value as JsonValue[];
  return object(value) as { [key: string]: JsonValue };
}

function answer(value: unknown): DecisionAnswer {
  const item = object(value);
  switch (item.type) {
    case "choice":
      return {
        type: item.type,
        choice: text(item.choice),
        probabilities: map(item.probabilities, probability),
        confidence: probability(item.confidence),
      };
    case "score":
      return {
        type: item.type,
        score: finiteNumber(item.score),
        probabilities: map(item.probabilities, probability),
        confidence: probability(item.confidence),
        legend: map(item.legend, level),
      };
    case "noul":
      return { type: item.type, noul: probability(item.noul) };
    default:
      throw new TypeError("Unknown decision answer type");
  }
}

export function fetchResponse(value: unknown): FetchResponse {
  const item = object(value);
  return { title: text(item.title), content: text(item.content) };
}

export function decisionResponse(value: unknown): DecisionResponse {
  const item = object(value);
  const usage = object(item.usage);
  return {
    model: text(item.model),
    answers: map(item.answers, answer),
    usage: { inputTokens: tokens(usage.input_tokens), outputTokens: tokens(usage.output_tokens) },
  };
}

export function listModelsResponse(value: unknown): ListModelsResponse {
  const { models } = object(value);
  if (!Array.isArray(models)) throw new TypeError("Expected a models array");
  return {
    models: models.map((value: unknown) => {
      const item = object(value);
      return {
        name: text(item.name),
        description: text(item.description),
        releaseDate: text(item.release_date),
      };
    }),
  };
}
