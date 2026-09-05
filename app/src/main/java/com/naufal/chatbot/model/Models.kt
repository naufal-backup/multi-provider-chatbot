package com.naufal.chatbot.model

import com.naufal.chatbot.Provider
import kotlinx.serialization.Serializable

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
    val attachmentsJson: String? = null,
    val createdAt: Long
)

/**
 * An attachment attached to a message (image or document).
 * Stored as base64-encoded data in the message for full local persistence.
 */
@Serializable
data class Attachment(
    val type: String,        // "image" | "document" | "audio" | ...
    val mimeType: String,    // e.g. "image/png", "application/pdf"
    val filename: String? = null,
    val dataBase64: String? = null,
    val url: String? = null
)

/**
 * A chat message ready to be sent or displayed.
 * [content] is plain text (may contain markdown).
 * [attachments] carries any non-text content.
 */
data class ChatMessage(
    val role: String,
    val content: String,
    val attachments: List<Attachment> = emptyList()
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