import type { GraderResult, ModelOutput } from "../types";
import type { TypedGrader } from "./types";

/**
 * Embedding-similarity grader (DESIGN §8). Scores how semantically close the
 * model output is to a reference answer via cosine similarity of their
 * embeddings — catching correct-but-differently-worded answers that exact/regex
 * miss. Like the LLM-judge it isn't static: it's constructed with an `embed` fn
 * so the harness wires it to a real embeddings API (with an env key) or a
 * deterministic sample embedder, keeping the grader free of key/provider detail.
 */

export type EmbedFn = (texts: string[]) => Promise<number[][]>;

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function createEmbeddingGrader(embed: EmbedFn): TypedGrader<"embedding_similarity"> {
  return {
    kind: "embedding_similarity",
    deterministic: false, // needs an embeddings API call — runs after free checks
    async grade(output: ModelOutput, config): Promise<GraderResult> {
      const [outVec, refVec] = await embed([output.text, config.reference]);
      const similarity = outVec && refVec ? cosineSimilarity(outVec, refVec) : 0;
      const rounded = Math.round(similarity * 1000) / 1000;
      return {
        kind: "embedding_similarity",
        passed: similarity >= config.threshold,
        similarity: rounded,
        threshold: config.threshold,
      };
    },
  };
}
