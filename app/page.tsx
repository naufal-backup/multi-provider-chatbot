"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { useTheme } from "@/components/ThemeProvider";
import {
  BUILTIN_PROVIDERS,
  type Attachment,
  type ChatMessage,
  type Conversation,
  type CustomProvider,
  type ProviderSelection,
} from "@/lib/types";
import { getCavemanPrompt, type CavemanLevel } from "@/lib/caveman";
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
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [cavemanEnabled, setCavemanEnabled] = useState(false);
  const [cavemanLevel, setCavemanLevel] = useState<CavemanLevel>("full");
  const [retryPayload, setRetryPayload] = useState<{
    text: string;
    attachments: Attachment[];
  } | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [modelDropOpen, setModelDropOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const modelDropRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const ce = localStorage.getItem("cavemanEnabled");
    const cl = localStorage.getItem("cavemanLevel") as CavemanLevel | null;
    if (ce !== null) setCavemanEnabled(ce === "true");
    if (cl && ["lite", "full", "ultra"].includes(cl)) setCavemanLevel(cl);
  }, []);

  useEffect(() => {
    localStorage.setItem("cavemanEnabled", String(cavemanEnabled));
  }, [cavemanEnabled]);

  useEffect(() => {
    localStorage.setItem("cavemanLevel", cavemanLevel);
  }, [cavemanLevel]);

  useEffect(() => {
    if (!modelDropOpen) return;
    function handleClick(e: MouseEvent) {
      if (modelDropRef.current && !modelDropRef.current.contains(e.target as Node)) {
        setModelDropOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [modelDropOpen]);

  async function persistModelForSession(
    convId: string,
    sel: ProviderSelection
  ) {
    const conv = await getConversation(convId);
    if (!conv) return;
    const next: Conversation = {
      ...conv,
      provider: sel.kind === "builtin" ? sel.provider : "openai",
      model: sel.model,
      customProviderId: sel.kind === "custom" ? sel.provider.id : null,
      updatedAt: Date.now(),
    };
    await upsertConversation(next);
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? next : c))
    );
  }

  async function loadConversation(id: string) {
    const conv = await getConversation(id);
    if (!conv) return;
    setActiveConvId(id);
    if (conv.customProviderId) {
      const cp = customProviders.find((c) => c.id === conv.customProviderId);
      if (cp) {
        const savedModel = conv.model;
        const list: string[] =
          Array.isArray((cp as any).models) && (cp as any).models.length
            ? (cp as any).models
            : cp.model
            ? [cp.model]
            : ["custom-model"];
        const m = list.includes(savedModel) ? savedModel : list[0];
        setSelection({ kind: "custom", provider: cp as any, model: m });
      } else {
        setSelection({ kind: "builtin", provider: conv.provider, model: conv.model });
      }
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
      model: selection.model,
      customProviderId: selection.kind === "custom" ? selection.provider.id : null,
      createdAt: now,
      updatedAt: now,
    };
    await upsertConversation(conv);
    setActiveConvId(conv.id);
    return conv;
  }

  async function sendToApi(
    msgs: ChatMessage[],
    onToken: (t: string) => void,
    signal?: AbortSignal
  ) {
    const apiKey =
      selection.kind === "builtin"
        ? await getApiKey(selection.provider)
        : await getApiKey(`custom_${selection.provider.id}`);
    if (!apiKey) throw new Error("API key belum diatur. Buka Pengaturan untuk menambahkannya.");
    await streamChat(
      {
        provider: selection.kind === "builtin" ? selection.provider : selection.provider.kind,
        model: selection.model,
        apiKey,
        messages: msgs.map(({ role, content, attachments }) => ({ role, content, attachments })),
        custom: selection.kind === "custom",
        kind: selection.kind === "custom" ? selection.provider.kind : undefined,
        baseUrl: selection.kind === "custom" ? selection.provider.baseUrl : undefined,
      },
      onToken,
      signal
    );
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

    abortRef.current = new AbortController();

    let full = "";
    try {
      const outMessages: ChatMessage[] = cavemanEnabled
        ? [{ role: "system", content: getCavemanPrompt(cavemanLevel) }, ...messages.concat(userMsg)]
        : messages.concat(userMsg);
      await sendToApi(outMessages, (token) => {
        full += token;
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: full };
          return copy;
        });
      }, abortRef.current.signal);

      await addMessage({ conversationId: conv.id, role: "assistant", content: full, attachments: [] });

      const curr = await getMessages(conv.id);
      if (curr.length <= 2 && text) {
        const title = text.slice(0, 40) + (text.length > 40 ? "..." : "");
        await renameConversation(conv.id, title);
      }
      await refresh();
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setError(e?.message ?? "Terjadi kesalahan.");
      setRetryPayload({ text, attachments: sendAttachments });
      setMessages((m) => m.slice(0, -1));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  async function handleRegenerate() {
    if (streaming || messages.length < 2) return;
    const lastUserIdx = messages.length - 2;
    const lastUser = messages[lastUserIdx];
    if (lastUser.role !== "user") return;

    setMessages((m) => m.slice(0, -1));
    setStreaming(true);
    setError(null);
    setRetryPayload(null);

    const conv = await ensureConversation();

    abortRef.current = new AbortController();

    let full = "";
    try {
      const hist = messages.slice(0, -1);
      const outMessages: ChatMessage[] = cavemanEnabled
        ? [{ role: "system", content: getCavemanPrompt(cavemanLevel) }, ...hist]
        : hist;
      await sendToApi(outMessages, (token) => {
        full += token;
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: full };
          return copy;
        });
      }, abortRef.current.signal);

      await addMessage({ conversationId: conv.id, role: "assistant", content: full, attachments: [] });
      await refresh();
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setError(e?.message ?? "Terjadi kesalahan.");
      setMessages((m) => m.slice(0, -1));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  async function handleEditSave(idx: number) {
    const newText = editingText.trim();
    if (!newText) return;
    const userMsg = messages[idx];
    if (!userMsg || userMsg.role !== "user") return;

    const updated = [...messages];
    updated[idx] = { ...updated[idx], content: newText };
    const trimmed = updated.slice(0, idx + 1);
    setMessages([...trimmed, { role: "assistant", content: "" }]);
    setEditingIdx(null);
    setEditingText("");
    setStreaming(true);
    setError(null);

    const conv = await ensureConversation();
    abortRef.current = new AbortController();

    let full = "";
    try {
      const outMessages: ChatMessage[] = cavemanEnabled
        ? [{ role: "system", content: getCavemanPrompt(cavemanLevel) }, ...trimmed]
        : trimmed;
      await sendToApi(outMessages, (token) => {
        full += token;
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: full };
          return copy;
        });
      }, abortRef.current.signal);

      await addMessage({ conversationId: conv.id, role: "assistant", content: full, attachments: [] });
      await refresh();
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setError(e?.message ?? "Terjadi kesalahan.");
      setMessages(trimmed);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function handleRevert() {
    if (messages.length < 2) return;
    setMessages((m) => m.slice(0, -2));
    setError(null);
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
    <div className={`app ${collapsed ? "collapsed" : ""}`}>
      {/* Sidebar */}
      <aside className={`drawer ${mobileNav ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a4 4 0 0 0-4 4v2h8V6a4 4 0 0 0-4-4z"/>
              <rect x="4" y="8" width="16" height="14" rx="2"/>
              <path d="M12 12v2M9 18h6"/>
            </svg>
          </div>
          <div className="brand-name display-font">Asisten</div>
          <button className="collapse-btn" title="Minimize" onClick={() => { setCollapsed(!collapsed); setMobileNav(false); }} style={{ marginLeft: "auto" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>

        <button className="new-chat-btn" onClick={newConversation} title="Percakapan baru">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          <span>Percakapan baru</span>
        </button>

        <div className="nav-section-label">Terbaru</div>
        {conversations.map((c) => (
          <button
            key={c.id}
            className={`nav-item ${c.id === activeConvId ? "active" : ""}`}
            onClick={() => { loadConversation(c.id); setMobileNav(false); }}
            title={c.title}
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 7h12M9 7V4h6v3m-8 0 1 13h8l1-13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
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
      {mobileNav && <div className="overlay" style={{ background: "rgba(0,0,0,0.16)" }} onClick={() => setMobileNav(false)}></div>}

      {/* Main */}
      <main className="main">
        <div className="topbar">
          <div className="topbar-left">
            <button className="collapse-btn" title="Expand sidebar" onClick={() => setCollapsed(!collapsed)} style={{ display: collapsed ? "flex" : "none" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <div className="topbar-title display-font">{currentTitle}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {started && !streaming && (
              <button className="icon-btn" title="Salin percakapan" onClick={() => {
                const text = messages.map((m) => `${m.role === "user" ? "Kamu" : "AI"}: ${m.content}`).join("\n\n");
                navigator.clipboard.writeText(text);
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            )}

            <div className="model-pill" ref={modelDropRef} style={{ position: "relative" }}>
              <button className="model-pill-btn" onClick={() => setModelDropOpen((v) => !v)}>
                <span className="model-dot"></span>
                <span className="model-pill-label">
                  {selection.kind === "builtin"
                    ? `${BUILTIN_PROVIDERS.find((p) => p.key === selection.provider)?.displayName ?? selection.provider}`
                    : (selection.provider as CustomProvider).name}
                  <span className="model-pill-model">{selection.model}</span>
                </span>
                <span className="pill-caret" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
              </button>

              {modelDropOpen && (
                <div className="model-dropdown">
                  {BUILTIN_PROVIDERS.map((p) => (
                    <div key={p.key} className="md-group">
                      <div className="md-group-label">{p.displayName}</div>
                      {p.models.map((m) => {
                        const active = selection.kind === "builtin" && selection.provider === p.key && selection.model === m;
                        return (
                          <button key={m} className={`md-item ${active ? "active" : ""}`} onClick={() => {
                            const next: ProviderSelection = { kind: "builtin", provider: p.key, model: m };
                            setSelection(next);
                            if (activeConvId) persistModelForSession(activeConvId, next);
                            setModelDropOpen(false);
                          }}>
                            {m}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  {customProviders.length > 0 && (
                    <div className="md-group">
                      <div className="md-group-label">Custom</div>
                      {customProviders.map((cp) => {
                        const list: string[] = Array.isArray((cp as any).models) && (cp as any).models.length ? (cp as any).models : cp.model ? [cp.model] : ["custom-model"];
                        return list.map((m) => {
                          const active = selection.kind === "custom" && (selection.provider as CustomProvider).id === cp.id && selection.model === m;
                          return (
                            <button key={`${cp.id}:${m}`} className={`md-item ${active ? "active" : ""}`} onClick={() => {
                              const next: ProviderSelection = { kind: "custom", provider: cp as any, model: m };
                              setSelection(next);
                              if (activeConvId) persistModelForSession(activeConvId, next);
                              setModelDropOpen(false);
                            }}>
                              {cp.name} - {m}
                            </button>
                          );
                        });
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button className="icon-btn" title="Mode" onClick={toggle}>
              {dark ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>
              )}
            </button>

            <button
              className="icon-btn"
              title={cavemanEnabled ? `Caveman ${cavemanLevel}` : "Caveman off"}
              onClick={() => setCavemanEnabled((v) => !v)}
              style={cavemanEnabled ? { background: "var(--md-primary-container)", color: "var(--md-on-primary-container)", borderColor: "var(--md-primary)" } : undefined}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M7 14l2-6 3 4 2-3 3 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M4 16l2 2 3-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            <button className="icon-btn" title="Pengaturan" onClick={() => setSettingsOpen(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
        </div>

        <div className="conversation" ref={scrollRef}>
          {!started && !streaming && (
            <div className="empty-state">
              <div className="empty-mark"></div>
              <div className="empty-title display-font">Ada yang bisa dibantu?</div>
              <div className="empty-sub">
                Tanyakan apa saja - mulai dari menulis, merangkum, sampai memecahkan masalah sehari-hari.
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
              {messages.map((m, i) => {
                const isLastAssistant = m.role === "assistant" && i === messages.length - 1;
                return (
                <div key={i} className={`msg-row ${m.role === "user" ? "user" : "bot"}`}>
                  <div className={`msg-avatar ${m.role === "user" ? "user" : "bot"}`}>
                    {m.role === "user" ? "A" : "AI"}
                  </div>
                  <div className="msg-body">
                    <div className="msg-bubble">
                      {m.attachments && m.attachments.length > 0 && (
                        <div className="msg-attachments">
                          {m.attachments.map((a, ai) => <AttachmentView key={ai} att={a} />)}
                        </div>
                      )}
                      {m.role === "assistant" && m.content === "" && streaming ? (
                        <div className="typing"><span></span><span></span><span></span></div>
                      ) : editingIdx === i ? (
                        <div>
                          <textarea
                            className="msg-edit-area"
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEditSave(i); }
                              if (e.key === "Escape") { setEditingIdx(null); setEditingText(""); }
                            }}
                            autoFocus
                          />
                          <div className="msg-edit-btns">
                            <button className="btn primary" onClick={() => handleEditSave(i)}>Simpan</button>
                            <button className="btn text" onClick={() => { setEditingIdx(null); setEditingText(""); }}>Batal</button>
                          </div>
                        </div>
                      ) : m.role === "assistant" ? (
                        <Markdown content={m.content} />
                      ) : (
                        <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
                      )}
                    </div>

                    {m.content && !streaming && (
                      <div className="msg-actions">
                        {m.role === "user" && (
                          <button className="msg-action" title="Edit" onClick={() => { setEditingIdx(i); setEditingText(m.content); }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z"/></svg>
                          </button>
                        )}
                        {isLastAssistant && (
                          <button className="msg-action" title="Regenerate" onClick={handleRegenerate}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
                          </button>
                        )}
                        <button className="msg-action" title="Salin" onClick={() => navigator.clipboard.writeText(m.content)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </button>
                        {isLastAssistant && messages.length >= 2 && (
                          <button className="msg-action" title="Revert" onClick={handleRevert}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                );
              })}

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
                      <span style={{ cursor: "pointer" }} onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}>&#x2715;</span>
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
          cavemanEnabled={cavemanEnabled}
          cavemanLevel={cavemanLevel}
          onToggleCaveman={() => setCavemanEnabled((v) => !v)}
          onSetCavemanLevel={setCavemanLevel}
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
              models: data.models,
              createdAt: editingCustom?.createdAt ?? Date.now(),
            } as any);
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
  function downloadData(dataBase64: string, mimeType: string, filename: string) {
    const bin = atob(dataBase64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const blob = new Blob([arr], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function copyData(dataBase64: string) {
    const bin = atob(dataBase64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    navigator.clipboard.write([new ClipboardItem({ [att.mimeType]: new Blob([arr], { type: att.mimeType }) })]);
  }

  if (att.url) {
    return (
      <span className="attach-chip">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
        {att.filename ?? "link"}
        <span className="attach-actions">
          <a className="attach-action" href={att.url} target="_blank" rel="noopener noreferrer" title="Buka"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg></a>
        </span>
      </span>
    );
  }
  if (att.type === "image" && att.dataBase64) {
    return (
      <span className="attach-chip">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
        {att.filename ?? "gambar"}
        <span className="attach-actions">
          <button className="attach-action" title="Lihat" onClick={() => { const w = window.open(); if (w) { w.document.write(`<img src="data:${att.mimeType};base64,${att.dataBase64}" style="max-width:100%"/>`); } }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
          <button className="attach-action" title="Salin" onClick={() => copyData(att.dataBase64!)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
          <button className="attach-action" title="Unduh" onClick={() => downloadData(att.dataBase64!, att.mimeType, att.filename ?? "image")}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg></button>
        </span>
      </span>
    );
  }
  return (
    <span className="attach-chip">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 12v6M9 15h6"/></svg>
      {att.filename}
      <span className="attach-actions">
        {att.dataBase64 && (
          <>
            <button className="attach-action" title="Salin" onClick={() => copyData(att.dataBase64!)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
            <button className="attach-action" title="Unduh" onClick={() => downloadData(att.dataBase64!, att.mimeType, att.filename ?? "file")}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg></button>
          </>
        )}
      </span>
    </span>
  );
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
  cavemanEnabled,
  cavemanLevel,
  onToggleCaveman,
  onSetCavemanLevel,
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
  cavemanEnabled: boolean;
  cavemanLevel: import("@/lib/caveman").CavemanLevel;
  onToggleCaveman: () => void;
  onSetCavemanLevel: (l: import("@/lib/caveman").CavemanLevel) => void;
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

        <div className="switch-row" style={{ marginTop: 8 }}>
          <span>Caveman mode {cavemanEnabled ? `(${cavemanLevel})` : ""}</span>
          <button className={`toggle ${cavemanEnabled ? "on" : ""}`} onClick={onToggleCaveman}></button>
        </div>
        {cavemanEnabled && (
          <div className="field" style={{ marginTop: 8 }}>
            <label>Tingkat</label>
            <select value={cavemanLevel} onChange={(e) => onSetCavemanLevel(e.target.value as any)}>
              <option value="lite">lite - no filler, full sentences</option>
              <option value="full">full - classic caveman</option>
              <option value="ultra">ultra - max terse</option>
            </select>
          </div>
        )}

        <div className="dlg-section">API Keys</div>
        {BUILTIN_PROVIDERS.map((p) => (
          <div className="field" key={p.key}>
            <label>
              {p.displayName}{" "}
              <span className={`key-status ${apiKeys[p.key] ? "ok" : ""}`}>
                {apiKeys[p.key] ? "terhubung" : "belum diatur"}
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
        {customProviders.map((cp) => {
          const list: string[] = Array.isArray((cp as any).models) && (cp as any).models.length ? (cp as any).models : cp.model ? [cp.model] : [];
          return (
          <div className="provider-row" key={cp.id}>
            <div className="p-info">
              {cp.name}
              <small>{cp.kind} - {list.join(", ") || "---"}</small>
            </div>
            <div className="p-actions">
              <button title="Edit" onClick={() => onEditCustom(cp)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button className="danger" title="Hapus" onClick={() => onDeleteCustom(cp)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 7h12M9 7V4h6v3m-8 0 1 13h8l1-13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          </div>
        );})}
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
  onSave: (data: { name: string; kind: "openai" | "claude"; baseUrl: string; models: string[]; apiKey: string }) => void;
}) {
  const existingModels: string[] =
    existing && Array.isArray((existing as any).models) && (existing as any).models.length
      ? (existing as any).models
      : existing?.model
      ? [existing.model]
      : [];
  const [name, setName] = useState(existing?.name ?? "");
  const [kind, setKind] = useState<"openai" | "claude">(existing?.kind ?? "openai");
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? "");
  const [modelsText, setModelsText] = useState(existingModels.join(", "));
  const [apiKey, setApiKey] = useState("");

  function parseModels(): string[] {
    return modelsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

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
          <label>Model - pisahkan dengan koma untuk banyak model</label>
          <input value={modelsText} onChange={(e) => setModelsText(e.target.value)} placeholder="mis. deepseek-chat, deepseek-reasoner" />
          <small>Satu provider bisa punya banyak model. Model aktif dipilih di topbar & disimpan per sesi.</small>
        </div>
        <div className="field">
          <label>API key</label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={existing ? "Kosongkan jika tidak diubah" : ""} />
          {existing && <small>Biarkan kosong untuk mempertahankan key lama.</small>}
        </div>

        <div className="dlg-actions">
          <button className="btn text" onClick={onClose}>Batal</button>
          <button
            className="btn primary"
            disabled={!name.trim() || parseModels().length === 0}
            onClick={() => onSave({ name: name.trim(), kind, baseUrl: baseUrl.trim(), models: parseModels(), apiKey: apiKey.trim() })}
          >
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}
