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

export async function getAllCustomProviders(): Promise<CustomProvider[]> {
  const db = await getDB();
  const all = await db.getAll("customProviders");
  return all.sort((a, b) => a.createdAt - b.createdAt);
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