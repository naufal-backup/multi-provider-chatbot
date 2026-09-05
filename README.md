# Multi-Provider Chatbot

Aplikasi chatbot mobile **Android native** (Kotlin + Jetpack Compose) yang memungkinkan percakapan dengan berbagai model AI (OpenAI, Anthropic/Claude, Google/Gemini, DeepSeek, dan custom provider) menggunakan **API key milik pengguna sendiri (BYOK)**. Serverless murni, tanpa login, tanpa proxy — seluruh data tersimpan lokal di perangkat.

## Arsitektur

```
[Android App - Kotlin + Jetpack Compose]
   ├── UI (Material 3): Chat, History, Settings
   ├── Room DB: riwayat percakapan (conversations, messages, custom_providers)
   ├── EncryptedSharedPreferences: API keys (terenkripsi)
   ├── Ktor Client: networking + streaming (SSE)
   └── HTTP langsung → API provider (tanpa proxy/worker)
                          │
             ┌────────────┼────────────┬──────────────┐
             ▼            ▼            ▼              ▼
         OpenAI       Anthropic      Google        DeepSeek   (+ custom OpenAI/Claude style)
```

- **Tanpa server/proxy** — app memanggil API tiap provider langsung dari perangkat.
- **MVVM** — ViewModel + StateFlow, Repository untuk akses Room & network.
- **BYOK** — API key dikirim langsung ke provider per-request, tidak pernah lewat server pihak ketiga.

## Struktur Project

```
/app       → Android (Kotlin + Compose, MVVM, Room, Ktor)
/.github   → GitHub Actions (build APK)
```

## Fitur

| # | Fitur |
|---|---|
| F1 | Input & simpan API key (terenkripsi lokal) |
| F2 | Pilih provider & model |
| F3 | Chat streaming token-by-token |
| F4 | Riwayat percakapan tersimpan (history session) |
| F5 | Rename/hapus percakapan |
| F6 | Render markdown & code block |
| F7 | Percakapan baru |
| F8 | Custom provider (OpenAI/Claude style, base URL bebas) |

## Custom Provider

Selain 4 provider bawaan, pengguna bisa menambah provider sendiri:
- **OpenAI style** — kompatibel dengan OpenRouter, Groq, Together, Ollama, endpoint OpenAI-compatible lainnya.
- **Claude style** — kompatibel dengan endpoint Anthropic-compatible.

Setiap custom provider memiliki base URL, model, dan API key sendiri (API key terenkripsi lokal).

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

## Konfigurasi API Key

API key disimpan terenkripsi (Android Keystore + `EncryptedSharedPreferences`) dan hanya di perangkat pengguna. Tidak ada server yang menyimpannya.

## Lisensi

Pribadi / internal.