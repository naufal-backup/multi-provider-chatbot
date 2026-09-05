"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { useTheme } from "@/components/ThemeProvider";
import {
  BUILTIN_PROVIDERS,
  defaultModelFor,
  type Attachment,
  type ChatMessage,
  type Conversation,
  type CustomProvider,
  type ProviderSelection,
} from "@/lib/types";
import {
  addMessage,
  deleteConversation,
  getAllConversations,
  getAllCustomProviders,
  getApiKey,
  getConversation,
  getMessages,
  listApiKeys,
  removeApiKey,
  renameConversation,
  setApiKey,
  upsertConversation,
  upsertCustomProvider,
  deleteCustomProvider as deleteCustomProviderDb,
} from "@/lib/db";
import { streamChat } from "@/lib/stream";

export default function Home() {
  const { dark, toggle } = useTheme();

  const [selection, setSelection] = useState<ProviderSelection>({
    kind: "builtin",
    provider: "openai",
    model: "gpt-4o-mini",
  });
  const [customProviders, setCustomProviders] = useState<CustomProvider[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<Record<string, boolean>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [showCustomDialog, setShowCustomDialog] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    setConversations(await getAllConversations());
    setCustomProviders(await getAllCustomProviders());
    setApiKeys(await listApiKeys());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function loadConversation(id: string) {
    const conv = await getConversation(id);
    if (!conv) return;
    setActiveConvId(id);
    if (conv.customProviderId) {
      const cp = customProviders.find((c) => c.id === conv.customProviderId);
      if (cp) setSelection({ kind: "custom", provider: cp });
      else setSelection({ kind: "builtin", provider: conv.provider, model: conv.model });
    } else {
      setSelection({ kind: "builtin", provider: conv.provider, model: conv.model });
    }
    setMessages(await getMessages(id));
    setError(null);
  }

  async function newConversation() {
    setActiveConvId(null);
    setMessages([]);
    setError(null);
  }

  async function ensureConversation(): Promise<Conversation> {
    if (activeConvId) {
      const existing = await getConversation(activeConvId);
      if (existing) return existing;
    }
    const now = Date.now();
    const conv: Conversation = {
      id: crypto.randomUUID(),
      title: "New chat",
      provider: selection.kind === "builtin" ? selection.provider : "openai",
      model: selection.kind === "builtin" ? selection.model : selection.provider.model,
      customProviderId: selection.kind === "custom" ? selection.provider.id : null,
      createdAt: now,
      updatedAt: now,
    };
    await upsertConversation(conv);
    setActiveConvId(conv.id);
    return conv;
  }

  async function handleSend() {
    const text = input.trim();
    if ((!text && attachments.length === 0) || streaming) return;

    const userMsg: ChatMessage = { role: "user", content: text, attachments };
    const nextMessages: ChatMessage[] = [
      ...messages,
      userMsg,
      { role: "assistant", content: "" },
    ];
    setMessages(nextMessages);
    setInput("");
    setAttachments([]);
    setStreaming(true);
    setError(null);

    const conv = await ensureConversation();

    await addMessage({ conversationId: conv.id, role: "user", content: text, attachments });

    const apiKey =
      selection.kind === "builtin"
        ? await getApiKey(selection.provider)
        : await getApiKey(`custom_${selection.provider.id}`);

    if (!apiKey) {
      setError("API key belum diatur untuk provider ini.");
      setStreaming(false);
      setMessages((m) => m.slice(0, -1));
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    let full = "";
    try {
      await streamChat(
        {
          provider: selection.kind === "builtin" ? selection.provider : selection.provider.kind,
          model: selection.kind === "builtin" ? selection.model : selection.provider.model,
          apiKey,
          messages: messages.concat(userMsg).map(({ role, content, attachments }) => ({ role, content, attachments })),
          custom: selection.kind === "custom",
          kind: selection.kind === "custom" ? selection.provider.kind : undefined,
          baseUrl: selection.kind === "custom" ? selection.provider.baseUrl : undefined,
        },
        (token) => {
          full += token;
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: "assistant", content: full };
            return copy;
          });
        }
      );

      await addMessage({ conversationId: conv.id, role: "assistant", content: full, attachments: [] });

      // Auto-rename on first exchange
      const curr = await getMessages(conv.id);
      if (curr.length <= 2 && text) {
        const title = text.slice(0, 50) + (text.length > 50 ? "..." : "");
        await renameConversation(conv.id, title);
      }
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "Terjadi kesalahan.");
      setMessages((m) => m.slice(0, -1));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  function handleAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(async (file) => {
      const mimeType = file.type || "application/octet-stream";
      const type = mimeType.startsWith("image") ? "image" : "document";
      const dataBase64 = await fileToBase64(file);
      setAttachments((prev) => [
        ...prev,
        { type, mimeType, filename: file.name, dataBase64 },
      ]);
    });
    e.target.value = "";
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 md:flex">
        <button
          onClick={newConversation}
          className="mb-3 w-full rounded-lg bg-zinc-900 py-2 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          + New chat
        </button>
        <div className="flex-1 overflow-y-auto">
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                c.id === activeConvId ? "bg-zinc-100 dark:bg-zinc-800" : ""
              }`}
            >
              <button onClick={() => loadConversation(c.id)} className="flex-1 truncate text-left">
                {c.title}
              </button>
              <button
                onClick={async () => {
                  await deleteConversation(c.id);
                  if (c.id === activeConvId) newConversation();
                  refresh();
                }}
                className="hidden text-zinc-400 hover:text-red-500 group-hover:block"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="mt-3 w-full rounded-lg border border-zinc-200 py-2 text-sm dark:border-zinc-800"
        >
          Settings
        </button>
      </aside>

      {/* Main */}
      <main className="flex flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-zinc-200 p-3 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <select
              value={
                selection.kind === "builtin"
                  ? `builtin:${selection.provider}`
                  : `custom:${selection.provider.id}`
              }
              onChange={(e) => {
                const val = e.target.value;
                if (val.startsWith("custom:")) {
                  const cp = customProviders.find((c) => c.id === val.slice(7));
                  if (cp) setSelection({ kind: "custom", provider: cp });
                } else {
                  const provider = val.slice(8) as any;
                  setSelection({ kind: "builtin", provider, model: defaultModelFor(provider) });
                }
              }}
              className="rounded border border-zinc-300 bg-white p-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {BUILTIN_PROVIDERS.map((p) => (
                <option key={p.key} value={`builtin:${p.key}`}>
                  {p.displayName}
                </option>
              ))}
              {customProviders.map((cp) => (
                <option key={cp.id} value={`custom:${cp.id}`}>
                  {cp.name}
                </option>
              ))}
            </select>

            <select
              value={selection.kind === "builtin" ? selection.model : selection.provider.model}
              onChange={(e) => {
                if (selection.kind === "builtin") {
                  setSelection({ ...selection, model: e.target.value });
                }
              }}
              disabled={selection.kind === "custom"}
              className="rounded border border-zinc-300 bg-white p-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {selection.kind === "builtin" &&
                (BUILTIN_PROVIDERS.find((p) => p.key === selection.provider)?.models ?? []).map(
                  (m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  )
                )}
              {selection.kind === "custom" && (
                <option value={selection.provider.model}>{selection.provider.model}</option>
              )}
            </select>
          </div>

          <button
            onClick={toggle}
            className="rounded-lg border border-zinc-200 p-2 text-sm dark:border-zinc-800"
          >
            {dark ? "Light" : "Dark"}
          </button>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center text-zinc-400">
              Mulai percakapan baru
            </div>
          )}
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl p-3 ${
                    m.role === "user"
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                  }`}
                >
                  {m.attachments?.map((a, ai) => (
                    <AttachmentView key={ai} att={a} />
                  ))}
                  {m.role === "assistant" ? (
                    <Markdown content={m.content} />
                  ) : (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  )}
                </div>
              </div>
            ))}
            {streaming && (
              <div className="flex justify-start">
                <span className="animate-pulse text-zinc-400">●</span>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="border-t border-red-200 bg-red-50 p-2 text-sm text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Attachments preview */}
        {attachments.length > 0 && (
          <div className="flex gap-2 border-t border-zinc-200 p-2 dark:border-zinc-800">
            {attachments.map((a, i) => (
              <span
                key={i}
                className="flex items-center gap-1 rounded bg-zinc-100 px-2 py-1 text-xs dark:bg-zinc-800"
              >
                {a.filename ?? a.type}
                <button onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex items-end gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
          <label className="cursor-pointer rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
            📎
            <input type="file" multiple className="hidden" onChange={handleAttach} />
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={1}
            placeholder="Ketik pesan..."
            className="flex-1 resize-none rounded-lg border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          {streaming ? (
            <button
              onClick={handleStop}
              className="rounded-lg bg-red-500 px-3 py-2 text-sm text-white"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleSend}
              className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Send
            </button>
          )}
        </div>
      </main>

      {showSettings && (
        <SettingsModal
          apiKeys={apiKeys}
          customProviders={customProviders}
          dark={dark}
          onToggleTheme={toggle}
          onClose={() => {
            setShowSettings(false);
            refresh();
          }}
          onSaveKey={async (provider, key) => {
            if (key.trim()) await setApiKey(provider, key.trim());
            else await removeApiKey(provider);
            setApiKeys(await listApiKeys());
          }}
          onOpenCustom={() => setShowCustomDialog(true)}
          onDeleteCustom={async (cp) => {
            await deleteCustomProviderDb(cp.id);
            refresh();
          }}
        />
      )}

      {showCustomDialog && (
        <CustomProviderDialog
          existing={null}
          onClose={() => setShowCustomDialog(false)}
          onSave={async (data) => {
            const id = crypto.randomUUID();
            await upsertCustomProvider({
              id,
              name: data.name,
              kind: data.kind,
              baseUrl: data.baseUrl,
              model: data.model,
              createdAt: Date.now(),
            });
            if (data.apiKey.trim()) {
              await setApiKey(`custom_${id}`, data.apiKey.trim());
            }
            setShowCustomDialog(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function AttachmentView({ att }: { att: Attachment }) {
  if (att.url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={att.url} alt={att.filename ?? "image"} className="max-w-full rounded" />;
  }
  if (att.type === "image" && att.dataBase64) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`data:${att.mimeType};base64,${att.dataBase64}`} alt={att.filename ?? "image"} className="max-w-full rounded" />
    );
  }
  return <div className="text-sm text-blue-500">📄 {att.filename}</div>;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function SettingsModal({
  apiKeys,
  customProviders,
  dark,
  onToggleTheme,
  onClose,
  onSaveKey,
  onOpenCustom,
  onDeleteCustom,
}: {
  apiKeys: Record<string, boolean>;
  customProviders: CustomProvider[];
  dark: boolean;
  onToggleTheme: () => void;
  onClose: () => void;
  onSaveKey: (provider: string, key: string) => void;
  onOpenCustom: () => void;
  onDeleteCustom: (cp: CustomProvider) => void;
}) {
  const [keys, setKeys] = useState<Record<string, string>>({});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 dark:bg-zinc-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button onClick={onClose}>✕</button>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <span>Dark mode</span>
          <button
            onClick={onToggleTheme}
            className={`relative h-6 w-11 rounded-full ${dark ? "bg-zinc-300" : "bg-zinc-600"}`}
          >
            <span
              className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${
                dark ? "left-1" : "left-6"
              }`}
            />
          </button>
        </div>

        <h3 className="mb-2 font-semibold">API Keys</h3>
        {BUILTIN_PROVIDERS.map((p) => (
          <div key={p.key} className="mb-3">
            <div className="mb-1 flex items-center gap-2 text-sm">
              <span>{p.displayName}</span>
              <span className={apiKeys[p.key] ? "text-green-500" : "text-zinc-400"}>
                {apiKeys[p.key] ? "● terhubung" : "○ belum diatur"}
              </span>
            </div>
            <input
              type="password"
              placeholder="API key"
              value={keys[p.key] ?? ""}
              onChange={(e) => setKeys({ ...keys, [p.key]: e.target.value })}
              onBlur={() => keys[p.key] !== undefined && onSaveKey(p.key, keys[p.key])}
              className="w-full rounded border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
        ))}

        <h3 className="mb-2 mt-4 font-semibold">Custom Providers</h3>
        {customProviders.map((cp) => (
          <div key={cp.id} className="mb-2 flex items-center justify-between text-sm">
            <span>
              {cp.name} · {cp.kind} · {cp.model}
            </span>
            <button onClick={() => onDeleteCustom(cp)} className="text-red-500">
              Hapus
            </button>
          </div>
        ))}
        <button
          onClick={onOpenCustom}
          className="mt-2 rounded-lg border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-700"
        >
          + Tambah
        </button>
      </div>
    </div>
  );
}

function CustomProviderDialog({
  existing,
  onClose,
  onSave,
}: {
  existing: CustomProvider | null;
  onClose: () => void;
  onSave: (data: { name: string; kind: "openai" | "claude"; baseUrl: string; model: string; apiKey: string }) => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [kind, setKind] = useState<"openai" | "claude">(existing?.kind ?? "openai");
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? "");
  const [model, setModel] = useState(existing?.model ?? "");
  const [apiKey, setApiKey] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold">Tambah Custom Provider</h2>
        <div className="flex flex-col gap-3">
          <input
            placeholder="Nama"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded border border-zinc-300 p-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setKind("openai")}
              className={`flex-1 rounded-lg p-2 text-sm ${kind === "openai" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-300 dark:border-zinc-700"}`}
            >
              OpenAI style
            </button>
            <button
              onClick={() => setKind("claude")}
              className={`flex-1 rounded-lg p-2 text-sm ${kind === "claude" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-300 dark:border-zinc-700"}`}
            >
              Claude style
            </button>
          </div>
          <input
            placeholder="Base URL"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="rounded border border-zinc-300 p-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            placeholder="Model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="rounded border border-zinc-300 p-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            type="password"
            placeholder="API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="rounded border border-zinc-300 p-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
            Batal
          </button>
          <button
            onClick={() =>
              onSave({ name: name.trim(), kind, baseUrl: baseUrl.trim(), model: model.trim(), apiKey: apiKey.trim() })
            }
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}