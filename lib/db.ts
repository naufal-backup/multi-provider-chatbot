import { openDB, type IDBPDatabase } from "idb";
import type {
  Conversation,
  CustomProvider,
  ChatMessage,
  Attachment,
  ProviderKey,
} from "./types";

const DB_NAME = "multi-provider-chatbot";
const DB_VERSION = 1;

interface DB {
  conversations: Conversation;
  messages: { id?: number; conversationId: string; role: string; content: string; attachmentsJson?: string | null; createdAt: number };
  customProviders: CustomProvider;
  apiKeys: { provider: string; key: string };
}

let dbPromise: Promise<IDBPDatabase<DB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<DB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("conversations")) {
          db.createObjectStore("conversations", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("messages")) {
          const store = db.createObjectStore("messages", {
            keyPath: "id",
            autoIncrement: true,
          });
          store.createIndex("conversationId", "conversationId");
        }
        if (!db.objectStoreNames.contains("customProviders")) {
          db.createObjectStore("customProviders", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("apiKeys")) {
          db.createObjectStore("apiKeys", { keyPath: "provider" });
        }
      },
    });
  }
  return dbPromise;
}

// ---- Conversations ----

export async function getAllConversations(): Promise<Conversation[]> {
  const db = await getDB();
  const all = await db.getAll("conversations");
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  const db = await getDB();
  return db.get("conversations", id);
}

export async function upsertConversation(conv: Conversation): Promise<void> {
  const db = await getDB();
  await db.put("conversations", conv);
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["conversations", "messages"], "readwrite");
  await tx.objectStore("messages").index("conversationId").getAllKeys(id).then(async (keys) => {
    for (const k of keys) {
      await tx.objectStore("messages").delete(k);
    }
  });
  await tx.objectStore("conversations").delete(id);
  await tx.done;
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const db = await getDB();
  const conv = await db.get("conversations", id);
  if (conv) {
    await db.put("conversations", { ...conv, title, updatedAt: Date.now() });
  }
}

// ---- Messages ----

export async function getMessages(conversationId: string): Promise<ChatMessage[]> {
  const db = await getDB();
  const rows = await db.getAllFromIndex("messages", "conversationId", conversationId);
  rows.sort((a, b) => a.createdAt - b.createdAt);
  return rows.map((r) => ({
    role: r.role as ChatMessage["role"],
    content: r.content,
    attachments: r.attachmentsJson ? (JSON.parse(r.attachmentsJson) as Attachment[]) : [],
  }));
}

export async function addMessage(message: {
  conversationId: string;
  role: string;
  content: string;
  attachments: Attachment[];
}): Promise<void> {
  const db = await getDB();
  await db.add("messages", {
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    attachmentsJson: message.attachments.length ? JSON.stringify(message.attachments) : null,
    createdAt: Date.now(),
  });
}

// ---- Custom providers ----

function normalizeCustomList(list: CustomProvider[]): CustomProvider[] {
  return list.map((cp: any) => {
    if (Array.isArray(cp.models) && cp.models.length > 0) return cp as CustomProvider;
    const fallback = cp.model ? [cp.model] : ["custom-model"];
    return { ...cp, models: fallback } as CustomProvider;
  });
}

export async function getAllCustomProviders(): Promise<CustomProvider[]> {
  const db = await getDB();
  const all = await db.getAll("customProviders");
  const normalized = normalizeCustomList(all as any);
  // lazy migrate old single-model records
  for (let i = 0; i < all.length; i++) {
    const raw: any = all[i];
    if (!Array.isArray(raw.models) || raw.models.length === 0) {
      await db.put("customProviders", normalized[i]);
    }
  }
  return normalized.sort((a, b) => a.createdAt - b.createdAt);
}

export async function upsertCustomProvider(p: CustomProvider): Promise<void> {
  const db = await getDB();
  await db.put("customProviders", p);
}

export async function deleteCustomProvider(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("customProviders", id);
}

// ---- API keys ----

export async function getApiKey(provider: string): Promise<string | undefined> {
  const db = await getDB();
  const row = await db.get("apiKeys", provider);
  return row?.key;
}

export async function setApiKey(provider: string, key: string): Promise<void> {
  const db = await getDB();
  await db.put("apiKeys", { provider, key });
}

export async function removeApiKey(provider: string): Promise<void> {
  const db = await getDB();
  await db.delete("apiKeys", provider);
}

export async function listApiKeys(): Promise<Record<string, boolean>> {
  const db = await getDB();
  const all = await db.getAll("apiKeys");
  const out: Record<string, boolean> = {};
  for (const row of all) out[row.provider] = true;
  for (const p of ["openai", "anthropic", "google", "deepseek"]) {
    if (!out[p]) out[p] = false;
  }
  return out;
}

// ---- Export / Import ----

export interface ChatBackup {
  version: 1;
  exportedAt: number;
  conversations: Conversation[];
  messages: { conversationId: string; role: string; content: string; attachments?: Attachment[]; createdAt: number }[];
  customProviders: CustomProvider[];
}

export async function exportAll(): Promise<ChatBackup> {
  const db = await getDB();
  const conversations = await db.getAll("conversations");
  const rawMsgs = await db.getAll("messages");
  const messages = rawMsgs.map((r) => ({
    conversationId: r.conversationId,
    role: r.role,
    content: r.content,
    attachments: r.attachmentsJson ? JSON.parse(r.attachmentsJson) as Attachment[] : [],
    createdAt: r.createdAt,
  }));
  const customProviders = await db.getAll("customProviders");
  return { version: 1, exportedAt: Date.now(), conversations, messages, customProviders };
}

export async function exportConversation(convId: string): Promise<ChatBackup> {
  const db = await getDB();
  const conv = await db.get("conversations", convId);
  const rawMsgs = await db.getAllFromIndex("messages", "conversationId", convId);
  const messages = rawMsgs.map((r) => ({
    conversationId: r.conversationId,
    role: r.role,
    content: r.content,
    attachments: r.attachmentsJson ? JSON.parse(r.attachmentsJson) as Attachment[] : [],
    createdAt: r.createdAt,
  }));
  let customProviders: CustomProvider[] = [];
  if (conv?.customProviderId) {
    const cp = await db.get("customProviders", conv.customProviderId);
    if (cp) customProviders = [cp];
  }
  return { version: 1, exportedAt: Date.now(), conversations: conv ? [conv] : [], messages, customProviders };
}

export async function importBackup(data: ChatBackup): Promise<{ imported: number; skipped: number }> {
  const db = await getDB();
  let imported = 0;
  let skipped = 0;
  const tx = db.transaction(["conversations", "messages", "customProviders"], "readwrite");
  for (const conv of data.conversations ?? []) {
    const existing = await tx.objectStore("conversations").get(conv.id);
    if (existing) { skipped++; continue; }
    await tx.objectStore("conversations").put(conv);
    imported++;
  }
  for (const msg of data.messages ?? []) {
    await tx.objectStore("messages").add({
      conversationId: msg.conversationId,
      role: msg.role,
      content: msg.content,
      attachmentsJson: msg.attachments?.length ? JSON.stringify(msg.attachments) : null,
      createdAt: msg.createdAt,
    });
  }
  for (const cp of data.customProviders ?? []) {
    const existing = await tx.objectStore("customProviders").get(cp.id);
    if (!existing) await tx.objectStore("customProviders").put(cp);
  }
  await tx.done;
  return { imported, skipped };
}