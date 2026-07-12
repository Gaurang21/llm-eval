"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { ProviderId } from "@/lib/types";

/**
 * Session-only API key state, per provider (DESIGN §5.4, invariant #1).
 * Keys live in a tiny external store backed by sessionStorage so a refresh
 * doesn't wipe them. NEVER localStorage (that persists across sessions), and
 * they are only ever sent per-request via the `x-provider-key` header.
 *
 * Implemented with useSyncExternalStore: the store is the source of truth,
 * every consumer stays in sync on writes, and there's no setState-in-effect
 * hydration dance. The server snapshot is a stable empty object.
 */

export type ApiKeys = Partial<Record<ProviderId, string>>;

const STORAGE_KEY = "llm-eval:keys";
const EMPTY: ApiKeys = Object.freeze({});

let cache: ApiKeys | null = null; // client cache; getSnapshot must be stable
const listeners = new Set<() => void>();

function readSession(): ApiKeys {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ApiKeys) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): ApiKeys {
  if (cache === null) cache = readSession();
  return cache;
}

function getServerSnapshot(): ApiKeys {
  return EMPTY;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function write(next: ApiKeys) {
  // Drop empty values so an emptied field reverts to "no key" (stub).
  const clean: ApiKeys = {};
  for (const [k, v] of Object.entries(next)) {
    if (v && v.trim()) clean[k as ProviderId] = v.trim();
  }
  cache = clean;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    /* sessionStorage unavailable — keep keys in memory only */
  }
  for (const cb of listeners) cb();
}

export function useApiKeys() {
  const keys = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setKey = useCallback((provider: ProviderId, value: string) => {
    write({ ...getSnapshot(), [provider]: value });
  }, []);

  const clearKey = useCallback((provider: ProviderId) => {
    const next = { ...getSnapshot() };
    delete next[provider];
    write(next);
  }, []);

  const clearAll = useCallback(() => write({}), []);

  const hasKey = useCallback(
    (provider: ProviderId) => Boolean(keys[provider]?.trim()),
    [keys],
  );

  return { keys, setKey, clearKey, clearAll, hasKey };
}
