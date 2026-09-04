// Multi-provider chatbot Cloudflare Worker
// Stateless proxy: normalizes requests and streams responses across
// OpenAI, Anthropic, Google (Gemini), and DeepSeek APIs.

interface ChatRequest {
  provider: "openai" | "anthropic" | "google" | "deepseek";
  model: string;
  apiKey: string;
  messages: { role: string; content: string }[];
}

interface ProviderEndpoint {
  url: string;
  headers: (apiKey: string) => Record<string, string>;
  buildBody: (req: ChatRequest) => unknown;
  // Parse a single SSE data chunk -> plain text delta (or null if none)
  parseChunk: (chunk: unknown) => string | null;
}

const PROVIDERS: Record<ChatRequest["provider"], ProviderEndpoint> = {
  openai: {
    url: "https://api.openai.com/v1/chat/completions",
    headers: (key) => ({
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    }),
    buildBody: (req) => ({
      model: req.model,
      messages: req.messages,
      stream: true,
    }),
    parseChunk: (chunk: any) => chunk?.choices?.[0]?.delta?.content ?? null,
  },

  anthropic: {
    url: "https://api.anthropic.com/v1/messages",
    headers: (key) => ({
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    }),
    buildBody: (req) => {
      const system = req.messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n");
      const rest = req.messages.filter((m) => m.role !== "system");
      const body: Record<string, unknown> = {
        model: req.model,
        messages: rest,
        max_tokens: 4096,
        stream: true,
      };
      if (system) body.system = system;
      return body;
    },
    parseChunk: (chunk: any) => {
      if (chunk?.type === "content_block_delta") {
        return chunk?.delta?.text ?? null;
      }
      return null;
    },
  },

  google: {
    // Gemini streaming endpoint (streamGenerateContent?alt=sse)
    url: "https://generativelanguage.googleapis.com/v1beta/models/",
    headers: (key) => ({
      "x-goog-api-key": key,
      "Content-Type": "application/json",
    }),
    buildBody: (req) => {
      const contents = req.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
      return {
        contents,
        generationConfig: {},
      };
    },
    parseChunk: (chunk: any) => {
      const part = chunk?.candidates?.[0]?.content?.parts?.[0];
      return part?.text ?? null;
    },
  },

  deepseek: {
    // DeepSeek uses an OpenAI-compatible API
    url: "https://api.deepseek.com/chat/completions",
    headers: (key) => ({
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    }),
    buildBody: (req) => ({
      model: req.model,
      messages: req.messages,
      stream: true,
    }),
    parseChunk: (chunk: any) => chunk?.choices?.[0]?.delta?.content ?? null,
  },
};

// Google's endpoint needs the model name appended to the URL for streaming.
function resolveUrl(provider: ChatRequest["provider"], req: ChatRequest): string {
  if (provider === "google") {
    return `${PROVIDERS.google.url}${req.model}:streamGenerateContent?alt=sse`;
  }
  return PROVIDERS[provider].url;
}

export default {
  async fetch(request: Request): Promise<Response> {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    let body: ChatRequest;
    try {
      body = (await request.json()) as ChatRequest;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.provider || !PROVIDERS[body.provider]) {
      return json({ error: "Unknown provider" }, 400);
    }
    if (!body.apiKey) {
      return json({ error: "Missing apiKey" }, 400);
    }

    const provider = PROVIDERS[body.provider];
    const upstreamUrl = resolveUrl(body.provider, body);

    const init: RequestInit = {
      method: "POST",
      headers: provider.headers(body.apiKey),
      body: JSON.stringify(provider.buildBody(body)),
    };

    const upstream = await fetch(upstreamUrl, init);

    if (!upstream.ok) {
      const errText = await upstream.text();
      return json(
        { error: `Upstream error (${upstream.status}): ${errText.slice(0, 500)}` },
        502
      );
    }

    // Stream response back to client, re-emitting only text deltas as SSE.
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const reader = upstream.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process complete lines
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const data = trimmed.slice(5).trim();
              if (!data || data === "[DONE]") continue;

              let parsed: unknown;
              try {
                parsed = JSON.parse(data);
              } catch {
                continue;
              }

              const delta = provider.parseChunk(parsed);
              if (delta) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(delta)}\n\n`)
                );
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

    return new Response(readable, {
      headers: {
        ...corsHeaders(),
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  },
} satisfies ExportedHandler;

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}