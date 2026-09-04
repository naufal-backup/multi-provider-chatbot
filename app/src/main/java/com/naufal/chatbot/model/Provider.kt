package com.naufal.chatbot

enum class Provider(val key: String, val displayName: String) {
    OPENAI("openai", "OpenAI"),
    ANTHROPIC("anthropic", "Anthropic"),
    GOOGLE("google", "Google"),
    DEEPSEEK("deepseek", "DeepSeek");

    companion object {
        fun fromKey(key: String): Provider =
            entries.firstOrNull { it.key == key } ?: OPENAI
    }
}