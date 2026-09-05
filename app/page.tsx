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

const SUGGESTIONS = [
  "Bantu aku menyusun rencana belajar 30 hari",
  "Jelaskan cara kerja panel surya secara sederhana",
  "Tuliskan caption Instagram untuk kedai kopi",
  "Buatkan draf email cuti kerja yang sopan",
];

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [editingCustom, setEditingCustom] = useState<CustomProvider | null>(null);
  const [retryPayload, setRetryPayload] = useState<{
    text: string;
    attachments: Attachment[];
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const started = messages.length > 0;

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
    setInput("");
    setAttachments([]);
  }

  async function ensureConversation(): Promise<Conversation> {
    if (activeConvId) {
      const existing = await getConversation(activeConvId);
      if (existing) return existing;
    }
    const now = Date.now();
    const conv: Conversation = {
      id: crypto.randomUUID(),
      title: "Percakapan baru",
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

  async function handleSend(retryText?: string, retryAttachments?: Attachment[]) {
    const text = (retryText ?? input).trim();
    const sendAttachments = retryAttachments ?? attachments;
    if ((!text && sendAttachments.length === 0) || streaming) return;

    const userMsg: ChatMessage = { role: "user", content: text, attachments: sendAttachments };
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
    setRetryPayload(null);

    const conv = await ensureConversation();

    await addMessage({ conversationId: conv.id, role: "user", content: text, attachments: sendAttachments });

    const apiKey =
      selection.kind === "builtin"
        ? await getApiKey(selection.provider)
        : await getApiKey(`custom_${selection.provider.id}`);

    if (!apiKey) {
      setError("API key belum diatur. Buka Pengaturan untuk menambahkannya.");
      setStreaming(false);
      setRetryPayload({ text, attachments: sendAttachments });
      setMessages((m) => m.slice(0, -1));
      return;
    }

    abortRef.current = new AbortController();

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

      const curr = await getMessages(conv.id);
      if (curr.length <= 2 && text) {
        const title = text.slice(0, 40) + (text.length > 40 ? "…" : "");
        await renameConversation(conv.id, title);
      }
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "Terjadi kesalahan.");
      setRetryPayload({ text, attachments: sendAttachments });
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
      setAttachments((prev) => [...prev, { type, mimeType, filename: file.name, dataBase64 }]);
    });
    e.target.value = "";
  }

  const currentTitle =
    conversations.find((c) => c.id === activeConvId)?.title ?? "Percakapan baru";

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="drawer">
        <div className="brand">
          <div className="brand-mark"></div>
          <div className="brand-name display-font">Asisten</div>
        </div>

        <button className="new-chat-btn" onClick={newConversation}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          Percakapan baru
        </button>

        <div className="nav-section-label">Terbaru</div>
        {conversations.map((c) => (
          <button
            key={c.id}
            className={`nav-item ${c.id === activeConvId ? "active" : ""}`}
            onClick={() => loadConversation(c.id)}
          >
            <span>{c.title}</span>
            <span
              className="nav-del"
              title="Hapus"
              onClick={async (e) => {
                e.stopPropagation();
                await deleteConversation(c.id);
                if (c.id === activeConvId) newConversation();
                refresh();
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 7h12M9 7V4h6v3m-8 0 1 13h8l1-13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </span>
          </button>
        ))}

        <button className="drawer-footer" onClick={() => setSettingsOpen(true)}>
          <div className="avatar">A</div>
          <div className="footer-text">
            <strong>Pengguna</strong>
            Pengaturan & API key
          </div>
        </button>
      </aside>

      {/* Main */}
      <main className="main">
        <div className="topbar">
          <div className="topbar-left">
            <div className="topbar-title display-font">{currentTitle}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="model-pill">
              <span className="model-dot"></span>
              <select
                value={selection.kind === "builtin" ? `builtin:${selection.provider}` : `custom:${selection.provider.id}`}
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
              >
                {BUILTIN_PROVIDERS.map((p) => (
                  <option key={p.key} value={`builtin:${p.key}`}>{p.displayName}</option>
                ))}
                {customProviders.map((cp) => (
                  <option key={cp.id} value={`custom:${cp.id}`}>{cp.name}</option>
                ))}
              </select>
            </div>

            <div className="model-pill">
              <select
                value={selection.kind === "builtin" ? selection.model : selection.provider.model}
                onChange={(e) => {
                  if (selection.kind === "builtin") {
                    setSelection({ ...selection, model: e.target.value });
                  }
                }}
                disabled={selection.kind === "custom"}
              >
                {selection.kind === "builtin" &&
                  (BUILTIN_PROVIDERS.find((p) => p.key === selection.provider)?.models ?? []).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                {selection.kind === "custom" && (
                  <option value={selection.provider.model}>{selection.provider.model}</option>
                )}
              </select>
            </div>

            <button className="icon-btn" title="Mode" onClick={toggle}>
              {dark ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>
              )}
            </button>

            <button className="icon-btn" title="Pengaturan" onClick={() => setSettingsOpen(true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
          </div>
        </div>

        <div className="conversation" ref={scrollRef}>
          {!started && !streaming && (
            <div className="empty-state">
              <div className="empty-mark"></div>
              <div className="empty-title display-font">Ada yang bisa dibantu?</div>
              <div className="empty-sub">
                Tanyakan apa saja — mulai dari menulis, merangkum, sampai memecahkan masalah sehari-hari.
              </div>
              <div className="suggestion-row">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="suggestion-chip" onClick={() => { setInput(s); handleSend(s); }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(started || streaming) && (
            <div className="conv-inner">
              {messages.map((m, i) => (
                <div key={i} className={`msg-row ${m.role === "user" ? "user" : "bot"}`}>
                  <div className={`msg-avatar ${m.role === "user" ? "user" : "bot"}`}>
                    {m.role === "user" ? "A" : "AI"}
                  </div>
                  <div className="msg-bubble">
                    {m.attachments && m.attachments.length > 0 && (
                      <div className="msg-attachments">
                        {m.attachments.map((a, ai) => <AttachmentView key={ai} att={a} />)}
                      </div>
                    )}
                    {m.role === "assistant" && m.content === "" && streaming ? (
                      <div className="typing"><span></span><span></span><span></span></div>
                    ) : m.role === "assistant" ? (
                      <Markdown content={m.content} />
                    ) : (
                      <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
                    )}
                  </div>
                </div>
              ))}

              {error && (
                <div className="error-banner">
                  <span className="error-text">{error}</span>
                  {retryPayload && (
                    <button className="retry-btn" onClick={() => handleSend(retryPayload.text, retryPayload.attachments)}>
                      Coba lagi
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="composer-wrap">
          <div className="composer">
            <button className="attach-btn" title="Lampirkan file" onClick={() => document.getElementById("file-input")?.click()}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M21 12v0a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1 9-9h1a5 5 0 0 1 5 5v7a3 3 0 1 1-6 0V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <input id="file-input" type="file" multiple hidden onChange={handleAttach} />

            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              {attachments.length > 0 && (
                <div className="attach-chips">
                  {attachments.map((a, i) => (
                    <span key={i} className="attach-chip">
                      {a.filename ?? a.type}
                      <span style={{ cursor: "pointer" }} onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}>✕</span>
                    </span>
                  ))}
                </div>
              )}
              <textarea
                rows={1}
                placeholder="Kirim pesan..."
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
            </div>

            {streaming ? (
              <button className="send-btn stop" title="Hentikan" onClick={handleStop}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
              </button>
            ) : (
              <button className="send-btn" title="Kirim" disabled={!input.trim() && attachments.length === 0} onClick={() => handleSend()}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            )}
          </div>
          <div className="composer-hint">Asisten dapat membuat kesalahan. Periksa kembali informasi penting.</div>
        </div>
      </main>

      {/* Settings */}
      {settingsOpen && (
        <SettingsDialog
          apiKeys={apiKeys}
          customProviders={customProviders}
          dark={dark}
          onToggleTheme={toggle}
          onClose={() => { setSettingsOpen(false); refresh(); }}
          onSaveKey={async (provider, key) => {
            if (key.trim()) await setApiKey(provider, key.trim());
            else await removeApiKey(provider);
            setApiKeys(await listApiKeys());
          }}
          onOpenCustom={() => { setEditingCustom(null); setCustomDialogOpen(true); }}
          onEditCustom={(cp) => { setEditingCustom(cp); setCustomDialogOpen(true); }}
          onDeleteCustom={async (cp) => { await deleteCustomProviderDb(cp.id); refresh(); }}
        />
      )}

      {customDialogOpen && (
        <CustomProviderDialog
          existing={editingCustom}
          onClose={() => { setCustomDialogOpen(false); setEditingCustom(null); }}
          onSave={async (data) => {
            const id = editingCustom?.id ?? crypto.randomUUID();
            await upsertCustomProvider({
              id,
              name: data.name,
              kind: data.kind,
              baseUrl: data.baseUrl,
              model: data.model,
              createdAt: editingCustom?.createdAt ?? Date.now(),
            });
            if (data.apiKey.trim()) await setApiKey(`custom_${id}`, data.apiKey.trim());
            setCustomDialogOpen(false);
            setEditingCustom(null);
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
    return <img src={att.url} alt={att.filename ?? "image"} />;
  }
  if (att.type === "image" && att.dataBase64) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`data:${att.mimeType};base64,${att.dataBase64}`} alt={att.filename ?? "image"} />;
  }
  return <span className="attach-chip">📄 {att.filename}</span>;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function SettingsDialog({
  apiKeys,
  customProviders,
  dark,
  onToggleTheme,
  onClose,
  onSaveKey,
  onOpenCustom,
  onEditCustom,
  onDeleteCustom,
}: {
  apiKeys: Record<string, boolean>;
  customProviders: CustomProvider[];
  dark: boolean;
  onToggleTheme: () => void;
  onClose: () => void;
  onSaveKey: (provider: string, key: string) => void;
  onOpenCustom: () => void;
  onEditCustom: (cp: CustomProvider) => void;
  onDeleteCustom: (cp: CustomProvider) => void;
}) {
  const [keys, setKeys] = useState<Record<string, string>>({});

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <button className="dlg-close" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
        <h2>Pengaturan</h2>

        <div className="switch-row">
          <span>Mode gelap</span>
          <button className={`toggle ${dark ? "on" : ""}`} onClick={onToggleTheme}></button>
        </div>

        <div className="dlg-section">API Keys</div>
        {BUILTIN_PROVIDERS.map((p) => (
          <div className="field" key={p.key}>
            <label>
              {p.displayName}{" "}
              <span className={`key-status ${apiKeys[p.key] ? "ok" : ""}`}>
                {apiKeys[p.key] ? "• terhubung" : "• belum diatur"}
              </span>
            </label>
            <input
              type="password"
              placeholder="API key"
              value={keys[p.key] ?? ""}
              onChange={(e) => setKeys({ ...keys, [p.key]: e.target.value })}
              onBlur={() => keys[p.key] !== undefined && onSaveKey(p.key, keys[p.key])}
            />
          </div>
        ))}

        <div className="dlg-section">Custom Providers</div>
        {customProviders.map((cp) => (
          <div className="provider-row" key={cp.id}>
            <div className="p-info">
              {cp.name}
              <small>{cp.kind} · {cp.model}</small>
            </div>
            <div className="p-actions">
              <button title="Edit" onClick={() => onEditCustom(cp)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>
              </button>
              <button className="danger" title="Hapus" onClick={() => onDeleteCustom(cp)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 7h12M9 7V4h6v3m-8 0 1 13h8l1-13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          </div>
        ))}
        <button className="btn text" style={{ marginTop: 8 }} onClick={onOpenCustom}>
          + Tambah custom provider
        </button>

        <div className="dlg-actions">
          <button className="btn text" onClick={onClose}>Tutup</button>
        </div>
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
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <button className="dlg-close" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
        <h2>{existing ? "Edit Custom Provider" : "Tambah Custom Provider"}</h2>

        <div className="field">
          <label>Nama</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mis. OpenRouter" />
        </div>
        <div className="field">
          <label>Jenis</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as "openai" | "claude")}>
            <option value="openai">OpenAI style</option>
            <option value="claude">Claude style</option>
          </select>
        </div>
        <div className="field">
          <label>Base URL</label>
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={kind === "claude" ? "https://ai.geraikita.com" : "https://ai.geraikita.com/v1"} />
          <small>{kind === "claude" ? "Tambahkan /v1/messages otomatis." : "Tambahkan /chat/completions otomatis."}</small>
        </div>
        <div className="field">
          <label>Model</label>
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="nama-model" />
        </div>
        <div className="field">
          <label>API key</label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={existing ? "Kosongkan jika tidak diubah" : ""} />
          {existing && <small>Biarkan kosong untuk mempertahankan key lama.</small>}
        </div>

        <div className="dlg-actions">
          <button className="btn text" onClick={onClose}>Batal</button>
          <button className="btn primary" onClick={() => onSave({ name: name.trim(), kind, baseUrl: baseUrl.trim(), model: model.trim(), apiKey: apiKey.trim() })}>Simpan</button>
        </div>
      </div>
    </div>
  );
}