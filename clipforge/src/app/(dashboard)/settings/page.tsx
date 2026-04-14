"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Provider = "openai" | "anthropic" | "gemini";

const PROVIDER_LABEL: Record<Provider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
};

interface ProviderDef {
  id: Provider;
  number: string;
  tag: string;
  name: string;
  description: string;
  placeholder: string;
  prefix: string;
  url: string;
  urlLabel: string;
}

const PROVIDERS: ProviderDef[] = [
  {
    id: "openai",
    number: "01",
    tag: "OpenAI",
    name: "GPT-5.4 & Whisper",
    description: "Video analysis and transcription. Required.",
    placeholder: "sk-...",
    prefix: "sk-",
    url: "https://platform.openai.com/api-keys",
    urlLabel: "platform.openai.com",
  },
  {
    id: "gemini",
    number: "02",
    tag: "Google Gemini",
    name: "Nano Banana 2",
    description: "Photorealistic illustration overlays. Optional, skipped if missing.",
    placeholder: "AIza...",
    prefix: "AIza",
    url: "https://aistudio.google.com/apikey",
    urlLabel: "aistudio.google.com",
  },
  {
    id: "anthropic",
    number: "03",
    tag: "Anthropic",
    name: "Claude Opus 4.6",
    description: "Alternative analysis provider. Optional.",
    placeholder: "sk-ant-...",
    prefix: "sk-ant-",
    url: "https://console.anthropic.com/settings/keys",
    urlLabel: "console.anthropic.com",
  },
];

export default function SettingsPage() {
  const [newKeys, setNewKeys] = useState<Record<Provider, string>>({
    openai: "",
    anthropic: "",
    gemini: "",
  });
  const [savingProvider, setSavingProvider] = useState<Provider | null>(null);
  const [validatingProvider, setValidatingProvider] = useState<Provider | null>(null);

  const { data: allKeys, refetch } = trpc.apiKey.getAll.useQuery();
  const saveKey = trpc.apiKey.save.useMutation();
  const validateKey = trpc.apiKey.validate.useMutation();
  const deleteKey = trpc.apiKey.delete.useMutation();

  function getKeyForProvider(provider: Provider) {
    return allKeys?.find((k) => k.provider === provider) ?? null;
  }

  async function handleSave(provider: Provider) {
    const key = newKeys[provider];
    if (!key.trim()) return;
    setSavingProvider(provider);
    try {
      await saveKey.mutateAsync({ key, provider });
      setNewKeys((prev) => ({ ...prev, [provider]: "" }));
      toast.success(`${PROVIDER_LABEL[provider]} API key saved`);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingProvider(null);
    }
  }

  async function handleValidate(provider: Provider) {
    setValidatingProvider(provider);
    try {
      const result = await validateKey.mutateAsync({ provider });
      if (result.valid) toast.success(`${PROVIDER_LABEL[provider]} API key is valid`);
      else toast.error(result.error ?? "Validation failed");
      refetch();
    } catch {
      toast.error("Validation failed");
    } finally {
      setValidatingProvider(null);
    }
  }

  async function handleDelete(provider: Provider) {
    try {
      await deleteKey.mutateAsync({ provider });
      toast.success("API key deleted");
      refetch();
    } catch {
      toast.error("Failed to delete API key");
    }
  }

  return (
    <div className="px-6 sm:px-10 lg:px-14 py-8 lg:py-12 max-w-[1180px]">
      <header className="flex flex-col gap-4 mb-7 lg:mb-9 max-w-3xl">
        <span className="tag">API keys · Providers</span>
        <h1 className="text-[36px] sm:text-[44px] lg:text-[52px] font-heading font-normal tracking-[-0.028em] leading-none">
          Bring your own keys.
        </h1>
        <p className="text-sm text-muted-foreground leading-[1.55] max-w-2xl">
          Encrypted with AES-256-GCM before we ever write them to disk. Only decrypted server-side
          when we make an outbound call. Never sent to the browser, never logged.
        </p>
      </header>

      <div className="flex flex-col gap-5">
        {PROVIDERS.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            existing={getKeyForProvider(provider.id)}
            newKey={newKeys[provider.id]}
            onNewKeyChange={(v) => setNewKeys((prev) => ({ ...prev, [provider.id]: v }))}
            onSave={() => handleSave(provider.id)}
            onValidate={() => handleValidate(provider.id)}
            onDelete={() => handleDelete(provider.id)}
            isSaving={savingProvider === provider.id}
            isValidating={validatingProvider === provider.id}
          />
        ))}
      </div>
    </div>
  );
}

interface ProviderCardProps {
  provider: ProviderDef;
  existing: { isValid: number | null; lastValidated: string | Date | null; maskedKey: string } | null;
  newKey: string;
  onNewKeyChange: (v: string) => void;
  onSave: () => void;
  onValidate: () => void;
  onDelete: () => void;
  isSaving: boolean;
  isValidating: boolean;
}

function ProviderCard({
  provider,
  existing,
  newKey,
  onNewKeyChange,
  onSave,
  onValidate,
  onDelete,
  isSaving,
  isValidating,
}: ProviderCardProps) {
  const hasKey = existing !== null;
  return (
    <section
      className={cn(
        "flex flex-col lg:flex-row gap-5 lg:gap-8 p-5 lg:p-7 border border-border",
        hasKey ? "bg-card" : "bg-transparent"
      )}
    >
      <div className="w-full lg:w-[260px] shrink-0 flex flex-col gap-1.5">
        <span className="tag">
          {provider.number} · {provider.tag}
        </span>
        <h2 className="font-heading text-[24px] tracking-[-0.015em] leading-tight">
          {provider.name}
        </h2>
        <p className="text-[13px] text-muted-foreground leading-[1.45]">{provider.description}</p>
        <a
          href={provider.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 tag hover:text-foreground transition-colors self-start"
        >
          Get key · {provider.urlLabel} →
        </a>
      </div>

      <div className="flex-1 flex flex-col gap-3">
        {hasKey ? (
          <>
            <div className="flex items-center justify-between gap-3 px-4 py-3.5 border border-border bg-background">
              <span className="font-mono text-[13px] truncate">{existing.maskedKey}</span>
              <StatusPill valid={existing.isValid} lastValidated={existing.lastValidated} />
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onValidate}
                disabled={isValidating}
                className="px-4 py-2.5 text-[13px] font-medium border border-foreground hover:bg-foreground hover:text-foreground-inverse transition-colors disabled:opacity-50"
              >
                {isValidating ? "Testing…" : "Test"}
              </button>
              <ReplaceInline
                placeholder={provider.placeholder}
                value={newKey}
                onChange={onNewKeyChange}
                onSubmit={onSave}
                saving={isSaving}
                label="Replace"
              />
              <button
                type="button"
                onClick={onDelete}
                className="px-4 py-2.5 text-[13px] text-accent hover:text-accent/80 transition-colors"
              >
                Delete
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 px-4 py-3.5 border border-border bg-background">
              <span className="font-mono text-[13px] text-muted-foreground italic">
                {provider.placeholder}
              </span>
              <span className="tag">Not set</span>
            </div>
            <div className="flex items-center gap-2.5">
              <input
                type="password"
                placeholder={provider.placeholder}
                value={newKey}
                onChange={(e) => onNewKeyChange(e.target.value)}
                autoComplete="off"
                className="flex-1 px-4 py-2.5 text-[13px] font-mono border border-border bg-background placeholder:text-muted-foreground/70 placeholder:italic focus:border-foreground focus:outline-none"
              />
              <button
                type="button"
                onClick={onSave}
                disabled={!newKey.trim() || isSaving}
                className="px-5 py-2.5 text-[13px] font-medium bg-foreground text-foreground-inverse hover:bg-foreground/90 transition-colors disabled:opacity-40"
              >
                {isSaving ? "Saving…" : "Add key"}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function ReplaceInline({
  placeholder,
  value,
  onChange,
  onSubmit,
  saving,
  label,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  saving: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-2.5 text-[13px] hover:bg-muted transition-colors"
      >
        {label}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 flex-1">
      <input
        type="password"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        autoFocus
        className="flex-1 px-3 py-2 text-[13px] font-mono border border-border bg-background placeholder:text-muted-foreground/70 placeholder:italic focus:border-foreground focus:outline-none"
      />
      <button
        type="button"
        onClick={() => {
          onSubmit();
          if (value.trim()) setOpen(false);
        }}
        disabled={!value.trim() || saving}
        className="px-4 py-2 text-[13px] font-medium bg-foreground text-foreground-inverse hover:bg-foreground/90 transition-colors disabled:opacity-40"
      >
        {saving ? "…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => {
          onChange("");
          setOpen(false);
        }}
        className="px-3 py-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

function StatusPill({
  valid,
  lastValidated,
}: {
  valid: number | null;
  lastValidated: string | Date | null;
}) {
  if (valid === 1) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 border border-foreground tag !text-foreground">
        Valid
      </span>
    );
  }
  if (valid === 0 && lastValidated) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 border border-accent tag !text-accent">
        Invalid
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-1 border border-border tag">Untested</span>
  );
}
