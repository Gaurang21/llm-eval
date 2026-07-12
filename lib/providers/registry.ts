import type { ModelInfo, Provider, ProviderId } from "../types";
import { priceFor } from "../pricing";
import { anthropicProvider } from "./anthropic";
import { openaiProvider } from "./openai";
import { stubProvider } from "./stub";

/**
 * Provider + model registry (DESIGN §5.1, invariant #4). Adding a provider is a
 * new file plus one entry here — zero changes to core/harness/route code.
 */

const PROVIDERS: Record<ProviderId, Provider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
};

/** Look up the real provider for a model id. */
export function getProvider(modelId: string): Provider {
  const model = MODELS.find((m) => m.id === modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  return PROVIDERS[model.provider];
}

export { stubProvider };

/** The model catalog the playground and harness target. */
export const MODELS: ModelInfo[] = [
  {
    id: "claude-opus-4-8",
    provider: "anthropic",
    label: "Claude Opus 4.8",
    meta: { contextWindow: 200_000, pricing: priceFor("claude-opus-4-8") },
  },
  {
    id: "claude-sonnet-5",
    provider: "anthropic",
    label: "Claude Sonnet 5",
    meta: { contextWindow: 200_000, pricing: priceFor("claude-sonnet-5") },
  },
  {
    id: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    label: "Claude Haiku 4.5",
    meta: { contextWindow: 200_000, pricing: priceFor("claude-haiku-4-5-20251001") },
  },
  {
    id: "gpt-4o",
    provider: "openai",
    label: "GPT-4o",
    meta: { contextWindow: 128_000, pricing: priceFor("gpt-4o") },
  },
  {
    id: "gpt-4o-mini",
    provider: "openai",
    label: "GPT-4o mini",
    meta: { contextWindow: 128_000, pricing: priceFor("gpt-4o-mini") },
  },
];

export function getModel(modelId: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === modelId);
}

/** Which provider a model belongs to — used by the client to pick the key. */
export function providerForModel(modelId: string): ProviderId | undefined {
  return getModel(modelId)?.provider;
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
};
