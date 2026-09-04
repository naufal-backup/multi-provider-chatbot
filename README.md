# Multi-Provider Chatbot

Aplikasi chatbot mobile **Android native** (Kotlin + Jetpack Compose) yang memungkinkan percakapan dengan berbagai model AI (OpenAI, Anthropic/Claude, Google/Gemini, DeepSeek) menggunakan **API key milik pengguna sendiri (BYOK)**. Serverless, tanpa login, seluruh data tersimpan lokal di perangkat.

## Arsitektur

```
[Android App - Kotlin + Jetpack Compose]
   ├── UI (Compose): Chat, History, Settings
   ├── Room DB: riwayat percakapan (conversations, messages)
   ├── EncryptedSharedPreferences: API keys (terenkripsi)
   ├── Ktor Client: networking + streaming (SSE)
   └── HTTP → [Cloudflare Worker (stateless proxy)]
                       │
              ┌────────┼─────────┬──────────┐
              ▼        ▼         ▼          ▼
          OpenAI   Anthropic   Google    DeepSeek
```

- **Worker stateless** — tidak menyimpan API key/sesi, hanya menyeragamkan format request/response & streaming antar provider.
- **MVVM** — ViewModel + StateFlow, Repository untuk akses Room & network.
- **BYOK** — API key dikirim per-request, tidak pernah tersimpan di server.

## Struktur Project

```
/app       → Android (Kotlin + Compose, MVVM, Room, Ktor)
/worker    → Cloudflare Worker (TypeScript, routing 4 provider)
/.github   → GitHub Actions (build APK)
```

## Fitur MVP (Fase 1)

| # | Fitur |
|---|---|
| F1 | Input & simpan API key (terenkripsi lokal) |
| F2 | Pilih provider & model |
| F3 | Chat streaming token-by-token |
| F4 | Riwayat percakapan tersimpan |
| F5 | Rename/hapus percakapan |
| F6 | Render markdown & code block |
| F7 | Percakapan baru |

## Build (via GitHub Actions)

Build full dilakukan otomatis di **GitHub Actions**:

1. Push ke branch `main` (atau jalankan manual via `workflow_dispatch`).
2. Workflow menjalankan `./gradlew assembleDebug`.
3. Hasil APK diunggah sebagai artifact `app-debug`.

Status build: [![Build Android APK](https://github.com/naufal-backup/multi-provider-chatbot/actions/workflows/build.yml/badge.svg)](https://github.com/naufal-backup/multi-provider-chatbot/actions/workflows/build.yml)

### Build lokal (opsional)

```bash
cd app
./gradlew assembleDebug      # Linux/macOS
gradlew.bat assembleDebug    # Windows
```

## Deploy Worker (Cloudflare)

```bash
cd worker
npm install
npx wrangler login
npx wrangler deploy
```

Setelah deploy, ganti nilai `WORKER_URL` di `app/src/main/java/com/naufal/chatbot/ui/MainScreen.kt` dengan URL worker kamu (mis. `https://your-worker.your-subdomain.workers.dev/chat`).

## Konfigurasi API Key

API key disimpan terenkripsi (Android Keystore + `EncryptedSharedPreferences`) dan hanya di perangkat pengguna. Tidak ada server yang menyimpannya.

## Lisensi

Pribadi / internal.