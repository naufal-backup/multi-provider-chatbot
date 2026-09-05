import type { ChatMessage } from "./types";

export interface StreamRequest {
  provider: string;
  model: string;
  apiKey: string;
  messages: ChatMessage[];
  custom?: boolean;
  kind?: "openai" | "claude";
  baseUrl?: string;
}

// The API Worker endpoint. Replace with your deployed API Worker URL.
// Inlined at build time (static export), so use a constant or NEXT_PUBLIC_ var.
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  "https://multi-provider-chatbot-api.naufalalamsyah453.workers.dev";

export async function streamChat(
  req: StreamRequest,
  onToken: (token: string) => void
): Promise<string> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    let msg = "Unknown error";
    try {
      const j = await res.json();
      msg = j.error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;

      let token: string;
      try {
        token = JSON.parse(data);
      } catch {
        continue;
      }
      full += token;
      onToken(token);
    }
  }

  return full;
}