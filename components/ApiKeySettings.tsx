"use client";

import { useState } from "react";
import { KeyRound, Trash2, ShieldCheck } from "lucide-react";
import type { ProviderId } from "@/lib/types";
import { PROVIDER_LABELS } from "@/lib/providers/registry";
import type { ApiKeys } from "@/hooks/useApiKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const PROVIDERS: { id: ProviderId; placeholder: string; hint: string }[] = [
  { id: "anthropic", placeholder: "sk-ant-…", hint: "console.anthropic.com" },
  { id: "openai", placeholder: "sk-…", hint: "platform.openai.com" },
];

interface Props {
  keys: ApiKeys;
  onSetKey: (provider: ProviderId, value: string) => void;
  onClearKey: (provider: ProviderId) => void;
  onClearAll: () => void;
}

/**
 * In-app AI settings UI — paste BYOK keys here (DESIGN §4). Keys are held in
 * session state only, sent per-request via header, and never stored server-side.
 * The dialog communicates that guarantee explicitly (it's the security story).
 */
export function ApiKeySettings({
  keys,
  onSetKey,
  onClearKey,
  onClearAll,
}: Props) {
  const activeCount = PROVIDERS.filter((p) => keys[p.id]?.trim()).length;

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <KeyRound className="size-4" aria-hidden />
            API keys
            {activeCount > 0 && (
              <Badge variant="pass" aria-label={`${activeCount} keys set`}>
                {activeCount}
              </Badge>
            )}
          </Button>
        }
      />
      <DialogContent>
        <DialogTitle>API keys</DialogTitle>
        <DialogDescription>
          Bring your own key. Keys live in this browser session only, are sent
          per request, used for one call, and never stored or logged.
        </DialogDescription>

        <div className="mt-5 space-y-5">
          {PROVIDERS.map((p) => (
            <KeyField
              key={p.id}
              id={p.id}
              placeholder={p.placeholder}
              hint={p.hint}
              value={keys[p.id] ?? ""}
              onSave={(v) => onSetKey(p.id, v)}
              onClear={() => onClearKey(p.id)}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <ShieldCheck className="size-3.5 text-accent" aria-hidden />
            Never persisted server-side · session-only in your browser
          </p>
          {activeCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onClearAll}>
              <Trash2 className="size-4" aria-hidden />
              Clear all
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function KeyField({
  id,
  placeholder,
  hint,
  value,
  onSave,
  onClear,
}: {
  id: ProviderId;
  placeholder: string;
  hint: string;
  value: string;
  onSave: (v: string) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const inputId = `key-${id}`;
  const saved = value.trim().length > 0;
  const dirty = draft.trim() !== value.trim();

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={inputId} className="text-sm font-medium text-text">
          {PROVIDER_LABELS[id]}
        </label>
        {saved ? (
          <Badge variant="pass">saved</Badge>
        ) : (
          <span className="text-xs text-faint">{hint}</span>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          id={inputId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && dirty) onSave(draft);
          }}
          aria-label={`${PROVIDER_LABELS[id]} API key`}
        />
        {saved && !dirty ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setDraft("");
              onClear();
            }}
            aria-label={`Clear ${PROVIDER_LABELS[id]} key`}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={!dirty || draft.trim().length === 0}
            onClick={() => onSave(draft)}
          >
            Save
          </Button>
        )}
      </div>
    </div>
  );
}
