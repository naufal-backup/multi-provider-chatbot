package com.naufal.chatbot.model

import com.naufal.chatbot.Provider

data class Conversation(
    val id: String,
    val title: String,
    val provider: Provider,
    val model: String,
    val customProviderId: String? = null,
    val createdAt: Long,
    val updatedAt: Long
)

data class Message(
    val id: Long = 0,
    val conversationId: String,
    val role: String,
    val content: String,
    val createdAt: Long
)

data class ChatMessage(
    val role: String,
    val content: String
)

enum class CustomKind {
    OPENAI,
    CLAUDE
}

data class CustomProvider(
    val id: String,
    val name: String,
    val kind: CustomKind,
    val baseUrl: String,
    val model: String,
    val createdAt: Long
)

sealed class ProviderSelection {
    data class BuiltIn(val provider: Provider, val model: String) : ProviderSelection()
    data class Custom(val provider: CustomProvider) : ProviderSelection()

    val displayName: String
        get() = when (this) {
            is BuiltIn -> provider.displayName
            is Custom -> provider.name
        }
}