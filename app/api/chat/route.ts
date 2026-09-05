import type { NextRequest } from "next/server";

export const runtime = "nodejs";

interface ChatRequestBody {
  provider: string;
  model: string;
  apiKey: string;
  messages: { role: string; content: string; attachments?: { type: string; mimeType: string; dataBase64?: string | null; url?: string | null; filename?: string | null }[] }[];
  kind?: "openai" | "claude";
  baseUrl?: string;
  custom?: boolean;
}

export async function POST(req: NextRequest) {
  let body: ChatRequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body.apiKey) {
    return new Response(JSON.stringify({ error: "Missing API key" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { url, headers, bodyJson, parseChunk } = buildRequest(body);

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers,
      body: bodyJson,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Failed to reach provider" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return new Response(
      JSON.stringify({ error: `Upstream error (${upstream.status}): ${text.slice(0, 500)}` }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  // Stream response back as SSE, emitting only text deltas.
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
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(delta)}\n\n`));
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
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
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
        messages: rest.map((m) => messageToClaude(m)),
        max_tokens: 4096,
        stream: true,
      };
      if (system) payload.system = system;
      const baseUrl = body.custom ? (body.baseUrl || "https://api.anthropic.com/v1/messages") : "https://api.anthropic.com/v1/messages";
      return {
        url: baseUrl,
        headers: {
          "x-api-key": body.apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        bodyJson: JSON.stringify(payload),
        parseChunk: (c) => (c?.type === "content_block_delta" ? c?.delta?.text ?? null : null),
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
        parseChunk: (c) => c?.candidates?.[0]?.content?.parts?.[0]?.text ?? null,
      };
    }

    case "deepseek":
    case "openai":
    default: {
      const payload = {
        model: body.model,
        messages: body.messages.map((m) => (m.attachments?.length ? messageToOpenAi(m) : { role: m.role, content: m.content })),
        stream: true,
      };
      const baseUrl =
        body.custom && body.baseUrl
          ? body.baseUrl
          : kind === "deepseek"
          ? "https://api.deepseek.com/chat/completions"
          : "https://api.openai.com/v1/chat/completions";
      return {
        url: baseUrl,
        headers: { Authorization: `Bearer ${body.apiKey}`, "Content-Type": "application/json" },
        bodyJson: JSON.stringify(payload),
        parseChunk: (c) => c?.choices?.[0]?.delta?.content ?? null,
      };
    }
  }
}

function messageToClaude(m: { role: string; content: string; attachments?: any[] }) {
  if (!m.attachments?.length) return { role: m.role, content: m.content };
  const content: any[] = [];
  if (m.content) content.push({ type: "text", text: m.content });
  for (const a of m.attachments) {
    if (a.type === "image" && a.dataBase64) {
      content.push({ type: "image", source: { type: "base64", media_type: a.mimeType, data: a.dataBase64 } });
    }
  }
  return { role: m.role, content };
}

function messageToOpenAi(m: { role: string; content: string; attachments?: any[] }) {
  if (!m.attachments?.length) return { role: m.role, content: m.content };
  const content: any[] = [];
  if (m.content) content.push({ type: "text", text: m.content });
  for (const a of m.attachments) {
    if (a.type === "image" && a.dataBase64) {
      content.push({ type: "image_url", image_url: { url: `data:${a.mimeType};base64,${a.dataBase64}` } });
    }
  }
  return { role: m.role, content };
}

function googleParts(m: { role: string; content: string; attachments?: any[] }) {
  const parts: any[] = [];
  if (m.content) parts.push({ text: m.content });
  for (const a of m.attachments ?? []) {
    if (a.type === "image" && a.dataBase64) {
      parts.push({ inline_data: { mime_type: a.mimeType, data: a.dataBase64 } });
    }
  }
  return parts;
}