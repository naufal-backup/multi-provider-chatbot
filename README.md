# Multi-Provider Chatbot (Next.js)

Aplikasi chatbot **web** (Next.js + TypeScript + Tailwind) untuk percakapan dengan berbagai model AI (OpenAI, Anthropic/Claude, Google/Gemini, DeepSeek, dan custom provider) menggunakan **API key milik pengguna sendiri (BYOK)**. Serverless, tanpa login, seluruh data tersimpan **lokal di browser** (IndexedDB).

## Arsitektur

```
[Web App - Next.js]
   ├── UI (React + Tailwind): Chat, History, Settings
   ├── IndexedDB: riwayat percakapan, custom providers, API keys (lokal browser)
   ├── Stream client: fetch SSE dari /api/chat
   └── API Route /api/chat (serverless, stateless)
              │
   ┌──────────┼───────────┬──────────┐
   ▼          ▼           ▼          ▼
OpenAI    Anthropic     Google    DeepSeek   (+ custom OpenAI/Claude style)
```

- **Full local** — data disimpan di `IndexedDB` browser, tanpa database server.
- **Tanpa login/akun** — seluruh state milik browser masing-masing pengguna.
- **BYOK** — API key dikirim dari browser ke API route, tidak disimpan di route.
- **API route** forward request ke provider AI (server-side, bebas CORS).

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
/app            → Next.js App Router (page.tsx, api/chat/route.ts, layout.tsx)
/components     → React components (Markdown, ThemeProvider)
/lib            → db.ts (IndexedDB), stream.ts, types.ts
/.github        → GitHub Actions (build + auto-release)
```

## Development

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`.

## Build & Deploy

```bash
npm run build
npm start
```

**GitHub Actions**: tiap push ke `main` menjalankan build. Build sukses otomatis membuat release `v{n}` + update tag `latest`.

## Catatan

- API key dan riwayat chat tersimpan di browser (IndexedDB) dan hanya ada di perangkat pengguna. Tidak pernah dikirim ke database server manapun.
- Beberapa provider (DeepSeek, dll.) tidak mendukung CORS langsung dari browser; oleh karena itu panggilan dilakukan melalui API route `/api/chat` (serverless, stateless).

## Lisensi

Pribadi / internal.