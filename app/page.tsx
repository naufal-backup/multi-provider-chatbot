"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppBar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  FormControl,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Select,
  SelectChangeEvent,
  Switch,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  FormControlLabel,
  IconButton as MuiIconButton,
  Divider,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import DeleteIcon from "@mui/icons-material/Delete";
import CloseIcon from "@mui/icons-material/Close";
import MenuIcon from "@mui/icons-material/Menu";
import SettingsIcon from "@mui/icons-material/Settings";
import SendIcon from "@mui/icons-material/Send";
import StopIcon from "@mui/icons-material/Stop";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import ImageIcon from "@mui/icons-material/Image";
import DescriptionIcon from "@mui/icons-material/Description";

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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [retryPayload, setRetryPayload] = useState<{
    text: string;
    attachments: Attachment[];
  } | null>(null);

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
    setDrawerOpen(false);
  }

  async function newConversation() {
    setActiveConvId(null);
    setMessages([]);
    setError(null);
    setInput("");
    setAttachments([]);
    setDrawerOpen(false);
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
      setError("API key belum diatur. Buka Settings untuk menambahkannya.");
      setStreaming(false);
      setRetryPayload({ text, attachments: sendAttachments });
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

      const curr = await getMessages(conv.id);
      if (curr.length <= 2 && text) {
        const title = text.slice(0, 50) + (text.length > 50 ? "..." : "");
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

  return (
    <Box sx={{ display: "flex", height: "100vh" }}>
      {/* Drawer / sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          width: 260,
          flexShrink: 0,
          display: { xs: "none", md: "block" },
          "& .MuiDrawer-paper": { width: 260, boxSizing: "border-box" },
        }}
      >
        <Toolbar />
        <Box sx={{ p: 1.5, overflow: "auto" }}>
          <Button
            fullWidth
            variant="contained"
            startIcon={<AddIcon />}
            onClick={newConversation}
          >
            New chat
          </Button>
          <List sx={{ mt: 1 }}>
            {conversations.map((c) => (
              <ListItemButton
                key={c.id}
                selected={c.id === activeConvId}
                onClick={() => loadConversation(c.id)}
                sx={{ borderRadius: 2 }}
              >
                <ListItemText primary={c.title} slotProps={{ primary: { noWrap: true } }} />
                <MuiIconButton
                  size="small"
                  onClick={async (e) => {
                    e.stopPropagation();
                    await deleteConversation(c.id);
                    if (c.id === activeConvId) newConversation();
                    refresh();
                  }}
                >
                  <DeleteIcon fontSize="small" />
                </MuiIconButton>
              </ListItemButton>
            ))}
          </List>
        </Box>
        <Divider />
        <Box sx={{ p: 1.5 }}>
          <Button fullWidth startIcon={<SettingsIcon />} onClick={() => setSettingsOpen(true)}>
            Settings
          </Button>
        </Box>
      </Drawer>

      {/* Mobile drawer */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: 260, p: 1.5 }} role="presentation">
          <Button fullWidth variant="contained" startIcon={<AddIcon />} onClick={newConversation}>
            New chat
          </Button>
          <List sx={{ mt: 1 }}>
            {conversations.map((c) => (
              <ListItemButton key={c.id} selected={c.id === activeConvId} onClick={() => loadConversation(c.id)}>
                <ListItemText primary={c.title} slotProps={{ primary: { noWrap: true } }} />
              </ListItemButton>
            ))}
          </List>
          <Divider sx={{ my: 1 }} />
          <Button fullWidth startIcon={<SettingsIcon />} onClick={() => setSettingsOpen(true)}>
            Settings
          </Button>
        </Box>
      </Drawer>

      {/* Main */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Toolbar sx={{ gap: 1 }}>
            <MuiIconButton sx={{ display: { md: "none" } }} onClick={() => setDrawerOpen(true)}>
              <MenuIcon />
            </MuiIconButton>

            <FormControl size="small" sx={{ minWidth: 140 }}>
              <Select
                value={selection.kind === "builtin" ? `builtin:${selection.provider}` : `custom:${selection.provider.id}`}
                onChange={(e: SelectChangeEvent) => {
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
                  <MenuItem key={p.key} value={`builtin:${p.key}`}>
                    {p.displayName}
                  </MenuItem>
                ))}
                {customProviders.map((cp) => (
                  <MenuItem key={cp.id} value={`custom:${cp.id}`}>
                    {cp.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 160 }}>
              <Select
                value={selection.kind === "builtin" ? selection.model : selection.provider.model}
                onChange={(e: SelectChangeEvent) => {
                  if (selection.kind === "builtin") {
                    setSelection({ ...selection, model: e.target.value });
                  }
                }}
                disabled={selection.kind === "custom"}
              >
                {selection.kind === "builtin" &&
                  (BUILTIN_PROVIDERS.find((p) => p.key === selection.provider)?.models ?? []).map((m) => (
                    <MenuItem key={m} value={m}>
                      {m}
                    </MenuItem>
                  ))}
                {selection.kind === "custom" && (
                  <MenuItem value={selection.provider.model}>{selection.provider.model}</MenuItem>
                )}
              </Select>
            </FormControl>

            <Box sx={{ flexGrow: 1 }} />

            <Tooltip title={dark ? "Light mode" : "Dark mode"}>
              <MuiIconButton onClick={toggle}>
                {dark ? <LightModeIcon /> : <DarkModeIcon />}
              </MuiIconButton>
            </Tooltip>

            <Tooltip title="Settings">
              <MuiIconButton onClick={() => setSettingsOpen(true)}>
                <SettingsIcon />
              </MuiIconButton>
            </Tooltip>
          </Toolbar>
        </AppBar>

        {/* Messages */}
        <Box ref={scrollRef} sx={{ flex: 1, overflowY: "auto", p: 3 }}>
          {messages.length === 0 && (
            <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "text.secondary" }}>
              <Typography>Mulai percakapan baru</Typography>
            </Box>
          )}
          <Box sx={{ maxWidth: 760, mx: "auto", display: "flex", flexDirection: "column", gap: 1.5 }}>
            {messages.map((m, i) => (
              <Box key={i} sx={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <Paper
                  elevation={0}
                  sx={{
                    maxWidth: "85%",
                    px: 1.5,
                    py: 1,
                    borderRadius: 3,
                    bgcolor: m.role === "user" ? "primary.main" : "action.hover",
                    color: m.role === "user" ? "primary.contrastText" : "text.primary",
                  }}
                >
                  {m.attachments?.map((a, ai) => (
                    <AttachmentView key={ai} att={a} />
                  ))}
                  {m.role === "assistant" && m.content === "" && streaming ? (
                    <ThinkingIndicator />
                  ) : m.role === "assistant" ? (
                    <Markdown content={m.content} />
                  ) : (
                    <Typography sx={{ whiteSpace: "pre-wrap" }}>{m.content}</Typography>
                  )}
                </Paper>
              </Box>
            ))}
          </Box>
        </Box>

        {error && (
          <Box sx={{ px: 2, py: 1, bgcolor: "error.dark", color: "error.contrastText", display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="body2" sx={{ flex: 1 }}>
              {error}
            </Typography>
            {retryPayload && (
              <Button
                size="small"
                variant="contained"
                color="inherit"
                onClick={() => handleSend(retryPayload.text, retryPayload.attachments)}
              >
                Coba lagi
              </Button>
            )}
          </Box>
        )}

        {/* Attachments */}
        {attachments.length > 0 && (
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", px: 2, py: 1, borderTop: 1, borderColor: "divider" }}>
            {attachments.map((a, i) => (
              <Chip
                key={i}
                icon={a.type === "image" ? <ImageIcon /> : <DescriptionIcon />}
                label={a.filename ?? a.type}
                onDelete={() => setAttachments((p) => p.filter((_, j) => j !== i))}
              />
            ))}
          </Box>
        )}

        {/* Input */}
        <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1, p: 2, borderTop: 1, borderColor: "divider" }}>
          <MuiIconButton component="label">
            <AttachFileIcon />
            <input type="file" multiple hidden onChange={handleAttach} />
          </MuiIconButton>

          <TextField
            fullWidth
            multiline
            maxRows={4}
            variant="outlined"
            placeholder="Ketik pesan..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            size="small"
          />

          {streaming ? (
            <Button variant="contained" color="error" onClick={handleStop} sx={{ minWidth: 0, px: 2 }}>
              <StopIcon />
            </Button>
          ) : (
            <Button variant="contained" onClick={() => handleSend()} sx={{ minWidth: 0, px: 2 }}>
              <SendIcon />
            </Button>
          )}
        </Box>
      </Box>

      {/* Settings */}
      {settingsOpen && (
        <SettingsDialog
          apiKeys={apiKeys}
          customProviders={customProviders}
          dark={dark}
          onToggleTheme={toggle}
          onClose={() => {
            setSettingsOpen(false);
            refresh();
          }}
          onSaveKey={async (provider, key) => {
            if (key.trim()) await setApiKey(provider, key.trim());
            else await removeApiKey(provider);
            setApiKeys(await listApiKeys());
          }}
          onOpenCustom={() => setCustomDialogOpen(true)}
          onDeleteCustom={async (cp) => {
            await deleteCustomProviderDb(cp.id);
            refresh();
          }}
        />
      )}

      {/* Custom provider dialog */}
      {customDialogOpen && (
        <CustomProviderDialog
          existing={null}
          onClose={() => setCustomDialogOpen(false)}
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
            setCustomDialogOpen(false);
            refresh();
          }}
        />
      )}
    </Box>
  );
}

function ThinkingIndicator() {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "text.secondary", py: 0.5 }}>
      <Typography variant="body2">Berpikir</Typography>
      <Box sx={{ display: "flex", gap: 0.5 }}>
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              bgcolor: "text.secondary",
              animation: "pulse 1.2s ease-in-out infinite",
              animationDelay: `${i * 0.2}s`,
              "@keyframes pulse": {
                "0%, 60%, 100%": { opacity: 0.2, transform: "scale(0.8)" },
                "30%": { opacity: 1, transform: "scale(1)" },
              },
            }}
          />
        ))}
      </Box>
    </Box>
  );
}

function AttachmentView({ att }: { att: Attachment }) {
  if (att.url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={att.url} alt={att.filename ?? "image"} style={{ maxWidth: "100%", borderRadius: 8, margin: "4px 0" }} />;
  }
  if (att.type === "image" && att.dataBase64) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`data:${att.mimeType};base64,${att.dataBase64}`} alt={att.filename ?? "image"} style={{ maxWidth: "100%", borderRadius: 8, margin: "4px 0" }} />
    );
  }
  return (
    <Chip
      icon={<DescriptionIcon />}
      label={att.filename}
      variant="outlined"
      size="small"
      sx={{ my: 0.5 }}
    />
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
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Settings</DialogTitle>
      <DialogContent>
        <FormControlLabel
          control={<Switch checked={dark} onChange={onToggleTheme} />}
          label="Dark mode"
          sx={{ mb: 1 }}
        />

        <Typography variant="subtitle1" sx={{ mt: 1, mb: 1 }}>
          API Keys
        </Typography>
        {BUILTIN_PROVIDERS.map((p) => (
          <Box key={p.key} sx={{ mb: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
              <Typography variant="body2">{p.displayName}</Typography>
              <Typography variant="caption" color={apiKeys[p.key] ? "success.main" : "text.secondary"}>
                {apiKeys[p.key] ? "● terhubung" : "○ belum diatur"}
              </Typography>
            </Box>
            <TextField
              fullWidth
              size="small"
              type="password"
              placeholder="API key"
              value={keys[p.key] ?? ""}
              onChange={(e) => setKeys({ ...keys, [p.key]: e.target.value })}
              onBlur={() => keys[p.key] !== undefined && onSaveKey(p.key, keys[p.key])}
            />
          </Box>
        ))}

        <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
          Custom Providers
        </Typography>
        {customProviders.map((cp) => (
          <Box key={cp.id} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
            <Typography variant="body2">
              {cp.name} · {cp.kind} · {cp.model}
            </Typography>
            <MuiIconButton size="small" color="error" onClick={() => onDeleteCustom(cp)}>
              <DeleteIcon fontSize="small" />
            </MuiIconButton>
          </Box>
        ))}
        <Button startIcon={<AddIcon />} onClick={onOpenCustom} variant="outlined" size="small">
          Tambah
        </Button>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Tutup</Button>
      </DialogActions>
    </Dialog>
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
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{existing ? "Edit Custom Provider" : "Tambah Custom Provider"}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField label="Nama" value={name} onChange={(e) => setName(e.target.value)} fullWidth size="small" />
          <FormControl size="small" fullWidth>
            <Select value={kind} onChange={(e) => setKind(e.target.value as "openai" | "claude")}>
              <MenuItem value="openai">OpenAI style</MenuItem>
              <MenuItem value="claude">Claude style</MenuItem>
            </Select>
          </FormControl>
          <TextField label="Base URL" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} fullWidth size="small" />
          <TextField label="Model" value={model} onChange={(e) => setModel(e.target.value)} fullWidth size="small" />
          <TextField label="API key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} fullWidth size="small" />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Batal</Button>
        <Button
          variant="contained"
          onClick={() => onSave({ name: name.trim(), kind, baseUrl: baseUrl.trim(), model: model.trim(), apiKey: apiKey.trim() })}
        >
          Simpan
        </Button>
      </DialogActions>
    </Dialog>
  );
}