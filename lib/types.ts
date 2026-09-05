export type ProviderKey = "openai" | "anthropic" | "google" | "deepseek";

export type CustomKind = "openai" | "claude";

export interface Attachment {
  type: "image" | "document" | "audio" | string;
  mimeType: string;
  filename?: string | null;
  dataBase64?: string | null;
  url?: string | null;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: Attachment[];
}

export interface Conversation {
  id: string;
  title: string;
  provider: ProviderKey;
  model: string;
  customProviderId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CustomProvider {
  id: string;
  name: string;
  kind: CustomKind;
  baseUrl: string;
  models: string[];        // multiple models per custom provider
  /** legacy field for migration from older single-model records */
  model?: string;
  createdAt: number;
}

export function normalizeCustomProvider(cp: CustomProvider): CustomProvider {
  if (!cp.models || cp.models.length === 0) {
    return { ...cp, models: cp.model ? [cp.model] : ["custom-model"] };
  }
  return cp;
}

export type ProviderSelection =
  | { kind: "builtin"; provider: ProviderKey; model: string }
  | { kind: "custom"; provider: CustomProvider; model: string };

export interface BuiltinProviderInfo {
  key: ProviderKey;
  displayName: string;
  models: string[];
  defaultModel: string;
}

export const BUILTIN_PROVIDERS: BuiltinProviderInfo[] = [
  {
    key: "openai",
    displayName: "OpenAI",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"],
    defaultModel: "gpt-4o-mini",
  },
  {
    key: "anthropic",
    displayName: "Anthropic",
    models: ["claude-3-5-sonnet-20241022", "claude-3-haiku-20240307"],
    defaultModel: "claude-3-5-sonnet-20241022",
  },
  {
    key: "google",
    displayName: "Google",
    models: ["gemini-1.5-flash", "gemini-1.5-pro"],
    defaultModel: "gemini-1.5-flash",
  },
  {
    key: "deepseek",
    displayName: "DeepSeek",
    models: ["deepseek-chat", "deepseek-reasoner"],
    defaultModel: "deepseek-chat",
  },
];

export function defaultProviderModels(provider: ProviderKey): string[] {
  return BUILTIN_PROVIDERS.find((p) => p.key === provider)?.models ?? [];
}

export function defaultModelFor(provider: ProviderKey): string {
  return BUILTIN_PROVIDERS.find((p) => p.key === provider)?.defaultModel ?? "";
}