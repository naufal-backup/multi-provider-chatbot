// Multi-provider chatbot API Worker.
// Stateless serverless proxy: forwards chat requests to provider AI endpoints
// and streams back text deltas as SSE. API key is passed per-request (BYOK).

interface Attachment {
  type: string;
  mimeType: string;
  dataBase64?: string | null;
  url?: string | null;
  filename?: string | null;
}

interface Msg {
  role: string;
  content: string;
  attachments?: Attachment[];
}

interface ChatRequestBody {
  provider: string;
  model: string;
  apiKey: string;
  messages: Msg[];
  kind?: "openai" | "claude";
  baseUrl?: string;
  custom?: boolean;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    let body: ChatRequestBody;
    try {
      body = (await request.json()) as ChatRequestBody;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.apiKey) {
      return json({ error: "Missing API key" }, 400);
    }

    const { url, headers, bodyJson, parseChunk } = buildRequest(body);

    let upstream: Response;
    try {
      upstream = await fetch(url, {
        method: "POST",
        headers,
        body: bodyJson,
      });
    } catch {
      return json({ error: "Failed to reach provider" }, 502);
    }

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      const k = body.custom ? (body.kind ?? "openai") : body.provider;
      const friendly = friendlyUpstreamError(upstream.status, text, k);
      return json({ error: friendly }, upstream.status === 401 || upstream.status === 403 ? 401 : 502);
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const reader = upstream.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
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

              let parsed: any;
              try {
                parsed = JSON.parse(data);
              } catch {
                continue;
              }

              const delta = parseChunk(parsed);
              if (delta) {
                const text = typeof delta === "string" ? delta : typeof delta === "number" ? String(delta) : "";
                if (text) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(text)}\n\n`));
                }
              }
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...CORS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  },
} satisfies ExportedHandler;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/**
 * Append the required path suffix to a custom base URL if it isn't already there.
 * This prevents doubled paths like /v1/v1/messages.
 */
function normalizeUrl(baseUrl: string, suffix: string): string {
  const u = baseUrl.trim().replace(/\/+$/, "");
  return u.endsWith(suffix) ? u : u + suffix;
}

/** Convert a raw upstream error body into a short, human-readable message. */
function friendlyUpstreamError(status: number, text: string, kind: string): string {
  // Try to extract a useful message from JSON bodies like
  // {"error": {"message": "..."}} (OpenAI/DeepSeek/Google) or
  // {"type": "error", "error": {"message": "..."}} (Anthropic).
  let message = "";
  try {
    const parsed = JSON.parse(text);
    message =
      parsed?.error?.message ??
      parsed?.error?.Message ??
      parsed?.message ??
      parsed?.error?.error?.message ??
      "";
  } catch {
    message = "";
  }

  if (status === 401 || status === 403) {
    return `API key tidak valid untuk ${kind}${message ? ` (${message})` : ""}.`;
  }
  if (status === 404) {
    return `Endpoint/model tidak ditemukan untuk ${kind}${message ? ` (${message})` : ""}.`;
  }
  if (status === 429) {
    return `Rate limit / kuota habis untuk ${kind}.`;
  }
  if (message) {
    return `${kind}: ${message}`;
  }
  // Fallback: return a truncated, sanitized snippet (avoid dumping long tokens).
  const clean = text.replace(/\s+/g, " ").trim();
  return `${kind} error (${status}): ${clean.slice(0, 200)}`;
}

function buildRequest(body: ChatRequestBody): {
  url: string;
  headers: Record<string, string>;
  bodyJson: string;
  parseChunk: (chunk: any) => string | null;
} {
  const kind = body.custom ? (body.kind ?? "openai") : body.provider;

  switch (kind) {
    case "anthropic":
    case "claude": {
      const system = body.messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n");
      const rest = body.messages.filter((m) => m.role !== "system");
      const payload: Record<string, unknown> = {
        model: body.model,
        messages: rest.map(messageToClaude),
        max_tokens: 4096,
        stream: true,
      };
      if (system) payload.system = system;
      const baseUrl =
        body.custom && body.baseUrl
          ? normalizeUrl(body.baseUrl, "/v1/messages")
          : "https://api.anthropic.com/v1/messages";
      return {
        url: baseUrl,
        headers: {
          "x-api-key": body.apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        bodyJson: JSON.stringify(payload),
        parseChunk: (c: any) =>
          c?.type === "content_block_delta" ? c?.delta?.text ?? null : null,
      };
    }

    case "google": {
      const payload = {
        contents: body.messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: googleParts(m),
        })),
      };
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${body.model}:streamGenerateContent?alt=sse`,
        headers: { "x-goog-api-key": body.apiKey, "Content-Type": "application/json" },
        bodyJson: JSON.stringify(payload),
        parseChunk: (c: any) => c?.candidates?.[0]?.content?.parts?.[0]?.text ?? null,
      };
    }

    case "deepseek":
    case "openai":
    default: {
      const payload = {
        model: body.model,
        messages: body.messages.map((m) =>
          m.attachments?.length ? messageToOpenAi(m) : { role: m.role, content: m.content }
        ),
        stream: true,
      };
      const baseUrl =
        body.custom && body.baseUrl
          ? normalizeUrl(body.baseUrl, "/chat/completions")
          : kind === "deepseek"
          ? "https://api.deepseek.com/chat/completions"
          : "https://api.openai.com/v1/chat/completions";
      return {
        url: baseUrl,
        headers: { Authorization: `Bearer ${body.apiKey}`, "Content-Type": "application/json" },
        bodyJson: JSON.stringify(payload),
        parseChunk: (c: any) => c?.choices?.[0]?.delta?.content ?? null,
      };
    }
  }
}

function messageToClaude(m: Msg): any {
  if (!m.attachments?.length) return { role: m.role, content: m.content };
  const content: any[] = [];
  if (m.content) content.push({ type: "text", text: m.content });
  for (const a of m.attachments) {
    if (a.type === "image" && a.dataBase64) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: a.mimeType, data: a.dataBase64 },
      });
    }
  }
  return { role: m.role, content };
}

function messageToOpenAi(m: Msg): any {
  if (!m.attachments?.length) return { role: m.role, content: m.content };
  const content: any[] = [];
  if (m.content) content.push({ type: "text", text: m.content });
  for (const a of m.attachments) {
    if (a.type === "image" && a.dataBase64) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${a.mimeType};base64,${a.dataBase64}` },
      });
    }
  }
  return { role: m.role, content };
}

function googleParts(m: Msg): any[] {
  const parts: any[] = [];
  if (m.content) parts.push({ text: m.content });
  for (const a of m.attachments ?? []) {
    if (a.type === "image" && a.dataBase64) {
      parts.push({ inline_data: { mime_type: a.mimeType, data: a.dataBase64 } });
    }
  }
  return parts;
}