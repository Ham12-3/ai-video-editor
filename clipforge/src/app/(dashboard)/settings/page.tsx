"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Key,
  Shield,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

type Provider = "openai" | "anthropic" | "gemini";

const PROVIDER_LABEL: Record<Provider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
};

const PROVIDERS: Array<{
  id: Provider;
  name: string;
  description: string;
  placeholder: string;
  prefix: string;
  url: string;
  urlLabel: string;
  models: string;
}> = [
  {
    id: "openai",
    name: "OpenAI",
    description:
      "Powers video analysis (GPT-5.4) and transcription (Whisper / gpt-4o-mini-transcribe). Illustrations now use Gemini Nano Banana.",
    placeholder: "sk-...",
    prefix: "sk-",
    url: "https://platform.openai.com/api-keys",
    urlLabel: "platform.openai.com",
    models: "GPT-5.4, Whisper",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description:
      "Alternative AI provider for video analysis using Claude Opus 4.6. Requires OpenAI key for transcription and illustrations.",
    placeholder: "sk-ant-...",
    prefix: "sk-ant-",
    url: "https://console.anthropic.com/settings/keys",
    urlLabel: "console.anthropic.com",
    models: "Claude Opus 4.6, Claude Sonnet 4.6",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description:
      "Generates on-topic illustration overlays using Nano Banana 2 (Gemini 3.1 Flash Image). Much better at literal, concrete images than DALL-E.",
    placeholder: "AIza...",
    prefix: "AIza",
    url: "https://aistudio.google.com/apikey",
    urlLabel: "aistudio.google.com",
    models: "Nano Banana 2 (Gemini 3.1 Flash Image)",
  },
];

export default function SettingsPage() {
  const [newKeys, setNewKeys] = useState<Record<Provider, string>>({
    openai: "",
    anthropic: "",
    gemini: "",
  });
  const [savingProvider, setSavingProvider] = useState<Provider | null>(null);
  const [validatingProvider, setValidatingProvider] = useState<Provider | null>(
    null
  );

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
      toast.success(`${PROVIDER_LABEL[provider]} API key saved and encrypted`);
      refetch();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save API key"
      );
    } finally {
      setSavingProvider(null);
    }
  }

  async function handleValidate(provider: Provider) {
    setValidatingProvider(provider);
    try {
      const result = await validateKey.mutateAsync({ provider });
      if (result.valid) {
        toast.success(`${PROVIDER_LABEL[provider]} API key is valid`);
      } else {
        toast.error(result.error ?? "Validation failed");
      }
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
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight mb-2">Settings</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Manage your account and API keys
      </p>

      {/* Security note */}
      <div className="flex items-start gap-3 p-3 rounded-md bg-primary/5 border border-primary/10 mb-6">
        <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">
            How your keys are protected
          </p>
          <ul className="space-y-1 list-disc list-inside">
            <li>Encrypted with AES-256-GCM before storage</li>
            <li>Decrypted only server-side when making API calls</li>
            <li>Never sent to the browser or exposed in logs</li>
            <li>You can delete them at any time</li>
          </ul>
        </div>
      </div>

      <div className="space-y-6">
        {PROVIDERS.map((provider) => {
          const existing = getKeyForProvider(provider.id);
          const isSaving = savingProvider === provider.id;
          const isValidating = validatingProvider === provider.id;
          const keyValue = newKeys[provider.id];

          return (
            <Card key={provider.id}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Key className="h-5 w-5 text-primary" />
                  <CardTitle>{provider.name} API Key</CardTitle>
                  {existing && (
                    <Badge variant="outline" className="ml-auto text-xs">
                      {provider.models}
                    </Badge>
                  )}
                </div>
                <CardDescription>{provider.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Current key status */}
                {existing && (
                  <div className="flex items-center justify-between p-3 rounded-md border">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono text-muted-foreground">
                        {existing.maskedKey}
                      </span>
                      {existing.isValid === 1 ? (
                        <Badge
                          variant="outline"
                          className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Valid
                        </Badge>
                      ) : existing.isValid === 0 &&
                        existing.lastValidated ? (
                        <Badge
                          variant="outline"
                          className="bg-red-500/10 text-red-500 border-red-500/20"
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          Invalid
                        </Badge>
                      ) : (
                        <Badge variant="outline">Not validated</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleValidate(provider.id)}
                        disabled={isValidating}
                      >
                        {isValidating && (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        )}
                        Test
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(provider.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}

                <Separator />

                {/* Save new key */}
                <div className="space-y-3">
                  <Label>
                    {existing
                      ? `Replace ${provider.name} key`
                      : `Enter your ${provider.name} API key`}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder={provider.placeholder}
                      value={keyValue}
                      onChange={(e) =>
                        setNewKeys((prev) => ({
                          ...prev,
                          [provider.id]: e.target.value,
                        }))
                      }
                      autoComplete="off"
                    />
                    <Button
                      onClick={() => handleSave(provider.id)}
                      disabled={!keyValue.trim() || isSaving}
                    >
                      {isSaving && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      Save
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Get your key from{" "}
                    <a
                      href={provider.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      {provider.urlLabel}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
