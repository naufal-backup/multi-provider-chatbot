# Multi-Provider Chatbot (Next.js + Cloudflare Workers)

Aplikasi chatbot **web** (Next.js + TypeScript + Tailwind) untuk percakapan dengan berbagai model AI (OpenAI, Anthropic/Claude, Google/Gemini, DeepSeek, dan custom provider) menggunakan **API key milik pengguna sendiri (BYOK)**. Serverless, tanpa login, seluruh data tersimpan **lokal di browser** (IndexedDB).

## Arsitektur

```
[Frontend Worker]  static Next.js (UI)  — multi-provider-chatbot.<akun>.workers.dev
       │  POST {provider, model, apiKey, messages}
       ▼
[API Worker]       serverless proxy    — multi-provider-chatbot-api.<akun>.workers.dev
       │
   ┌───┼───────┬─────────┬──────────┐
   ▼   ▼       ▼         ▼          ▼
OpenAI Anthropic Google   DeepSeek  (+ custom OpenAI/Claude style)
```

- **Full local** — data disimpan di `IndexedDB` browser, tanpa database server.
- **Tanpa login/akun** — seluruh state milik browser masing-masing pengguna.
- **BYOK** — API key dikirim dari browser ke API Worker, tidak disimpan di Worker.
- **Dua Worker** — frontend (static) & API (proxy), keduanya serverless/stateless.

## Fitur

| # | Fitur |
|---|---|
| F1 | Input & simpan API key (lokal IndexedDB) |
| F2 | Pilih provider & model |
| F3 | Chat streaming token-by-token |
| F4 | Riwayat percakapan tersimpan (history session) |
| F5 | Rename/hapus percakapan |
| F6 | Render markdown/code block + copy |
| F7 | Percakapan baru |
| F8 | Custom provider (OpenAI/Claude style, base URL bebas) |
| F9 | Dark/light mode |
| F10 | Image/document input & output (multimodal) |

## Struktur Project

```
/app            → Next.js App Router (page.tsx, layout.tsx)
/components     → React components (Markdown, ThemeProvider)
/lib            → db.ts (IndexedDB), stream.ts, types.ts
/workers
  /frontend     → Cloudflare Worker (serve static UI, binding `assets`)
  /api          → Cloudflare Worker (proxy ke provider AI, SSE)
/.github        → GitHub Actions (build + auto-release)
```

## Development

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`.

## Deploy (Cloudflare Workers)

Ada **dua** Worker:

1. **API Worker** (`/workers/api`) — proxy ke provider AI:
   ```bash
   cd workers/api
   wrangler deploy
   ```
   Hasil: `https://multi-provider-chatbot-api.<akun>.workers.dev`

2. **Frontend Worker** (`/workers/frontend`) — serve static Next.js:
   ```bash
   # di root, build static export
   npm run build
   # lalu deploy
   cd workers/frontend
   wrangler deploy
   ```
   Hasil: `https://multi-provider-chatbot.<akun>.workers.dev`

   URL API Worker dikonfigurasi di `lib/stream.ts` (`API_URL`), atau lewat env `NEXT_PUBLIC_API_URL` saat build.

## Catatan

- API key & riwayat chat hanya di browser (IndexedDB), tidak pernah ke database server.
- Beberapa provider tidak dukung CORS dari browser; karena itu panggilan lewat API Worker (serverless proxy).

## Lisensi

Pribadi / internal.