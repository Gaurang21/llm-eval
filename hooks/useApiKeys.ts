"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProviderId } from "@/lib/types";

/**
 * Session-only API key state, per provider (DESIGN §5.4, invariant #1).
 * Keys live in React state and MAY mirror to sessionStorage so a refresh
 * doesn't wipe them. NEVER localStorage (that persists across sessions), and
 * they are only ever sent per-request via the `x-provider-key` header.
 */

export type ApiKeys = Partial<Record<ProviderId, string>>;

const STORAGE_KEY = "llm-eval:keys";

function readSession(): ApiKeys {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ApiKeys) : {};
  } catch {
    return {};
  }
}

export function useApiKeys() {
  const [keys, setKeys] = useState<ApiKeys>({});

  // Hydrate from sessionStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    setKeys(readSession());
  }, []);

  const persist = useCallback((next: ApiKeys) => {
    setKeys(next);
    try {
      // Drop empty strings so an emptied field reverts to "no key" (stub).
      const clean: ApiKeys = {};
      for (const [k, v] of Object.entries(next)) {
        if (v && v.trim()) clean[k as ProviderId] = v.trim();
      }
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch {
      /* sessionStorage unavailable — keep keys in memory only */
    }
  }, []);

  const setKey = useCallback(
    (provider: ProviderId, value: string) => {
      persist({ ...readSession(), [provider]: value });
    },
    [persist],
  );

  const clearKey = useCallback(
    (provider: ProviderId) => {
      const next = { ...readSession() };
      delete next[provider];
      persist(next);
    },
    [persist],
  );

  const clearAll = useCallback(() => persist({}), [persist]);

  const hasKey = useCallback(
    (provider: ProviderId) => Boolean(keys[provider]?.trim()),
    [keys],
  );

  return { keys, setKey, clearKey, clearAll, hasKey };
}
