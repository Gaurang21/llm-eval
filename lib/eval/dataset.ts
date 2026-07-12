import type { GraderConfig } from "../graders/types";

/**
 * The eval suite (DESIGN §8, phase 6). A small but real cross-section: factual
 * recall, structured extraction, format-following, and open-ended reasoning
 * scored by the LLM-judge. Each case carries deterministic graders (which run
 * first and can short-circuit) plus, where the answer is open-ended, a judge.
 *
 * Adding a case is a data edit here — no code changes.
 */

export interface EvalCase {
  id: string;
  name: string;
  category: "factual" | "extraction" | "format" | "reasoning" | "semantic";
  prompt: string;
  graders: GraderConfig[];
}

export const DATASET: EvalCase[] = [
  {
    id: "capital-france",
    name: "Capital of France",
    category: "factual",
    prompt: "What is the capital of France? Answer with only the city name.",
    graders: [
      { kind: "exact_match", expected: "Paris", caseInsensitive: true },
      { kind: "latency", thresholdMs: 6000 },
    ],
  },
  {
    id: "apollo-year",
    name: "Apollo 11 landing year",
    category: "factual",
    prompt:
      "In what year did Apollo 11 land on the Moon? Reply with only the 4-digit year.",
    graders: [
      { kind: "regex", pattern: "\\b1969\\b" },
      { kind: "latency", thresholdMs: 6000 },
    ],
  },
  {
    id: "arithmetic",
    name: "Multiplication",
    category: "factual",
    prompt: "What is 17 × 23? Reply with only the number.",
    graders: [{ kind: "regex", pattern: "\\b391\\b" }],
  },
  {
    id: "extract-person",
    name: "Extract person to JSON",
    category: "extraction",
    prompt:
      'Extract the person as JSON with keys "name" and "age". Text: "Maria is 34 years old." Reply with only JSON.',
    graders: [
      { kind: "json_schema", required: ["name", "age"] },
      { kind: "latency", thresholdMs: 6000 },
    ],
  },
  {
    id: "sentiment-json",
    name: "Sentiment as JSON",
    category: "extraction",
    prompt:
      'Classify the sentiment of "I absolutely love this product!" Reply with only JSON of the form {"sentiment": "positive|negative|neutral"}.',
    graders: [{ kind: "json_schema", required: ["sentiment"] }],
  },
  {
    id: "primary-colors",
    name: "Comma-separated colors",
    category: "format",
    prompt:
      "List three primary colors as a lowercase comma-separated list, with no other text.",
    graders: [
      { kind: "regex", pattern: "^[a-z]+,\\s*[a-z]+,\\s*[a-z]+\\s*$" },
    ],
  },
  {
    id: "exact-ok",
    name: "Exact echo",
    category: "format",
    prompt: 'Respond with exactly the word "OK" and nothing else.',
    graders: [{ kind: "exact_match", expected: "OK" }],
  },
  {
    id: "bat-and-ball",
    name: "Bat and ball reasoning",
    category: "reasoning",
    prompt:
      "A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost? Explain briefly.",
    graders: [
      { kind: "latency", thresholdMs: 8000 },
      {
        kind: "llm_judge",
        rubric:
          "The correct answer is $0.05 (5 cents). Award a high score only if the response states 5 cents / $0.05 AND the reasoning is sound. A response of $0.10 is the classic wrong answer and should score low.",
      },
    ],
  },
  {
    id: "micro-vs-mono",
    name: "Microservices tradeoffs",
    category: "reasoning",
    prompt:
      "In two sentences, summarize the key tradeoffs between microservices and a monolith.",
    graders: [
      { kind: "cost", thresholdUsd: 0.02 },
      {
        kind: "llm_judge",
        rubric:
          "High score if the answer names at least one genuine advantage AND one genuine disadvantage of microservices relative to a monolith, and stays concise (~2 sentences).",
      },
    ],
  },
  {
    id: "explain-eval",
    name: "Explain evals to a manager",
    category: "reasoning",
    prompt:
      "Explain what an LLM eval harness is to a non-technical manager, in under 120 words.",
    graders: [
      {
        kind: "llm_judge",
        rubric:
          "High score if the explanation is accurate, avoids unexplained jargon, and is genuinely accessible to a non-technical reader while staying under ~120 words.",
      },
    ],
  },
  {
    id: "define-recursion",
    name: "Define recursion (semantic)",
    category: "semantic",
    prompt: "Define recursion in one sentence.",
    graders: [
      { kind: "latency", thresholdMs: 6000 },
      {
        kind: "embedding_similarity",
        reference:
          "Recursion is when a function calls itself to solve smaller instances of a problem until it reaches a base case.",
        threshold: 0.5,
      },
    ],
  },
  {
    id: "haiku-databases",
    name: "Haiku about databases (agentic)",
    category: "reasoning",
    prompt: "Write a haiku about databases. Use exactly three lines.",
    graders: [
      {
        kind: "agentic_judge",
        rubric:
          "A haiku is three lines. Use the tools (e.g. word_count, regex_test for newlines) to check the structure, then score high only if the response is three lines and clearly about databases.",
        maxSteps: 4,
      },
    ],
  },
];
