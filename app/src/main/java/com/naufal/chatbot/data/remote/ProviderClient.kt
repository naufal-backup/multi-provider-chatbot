package com.naufal.chatbot.data.remote

import com.naufal.chatbot.model.ChatMessage
import kotlinx.coroutines.flow.Flow

/**
 * Abstract client for a single AI provider. Each implementation knows how to
 * build the provider-specific request and parse the provider-specific SSE stream.
 */
interface ProviderClient {
    fun streamChat(
        apiKey: String,
        model: String,
        messages: List<ChatMessage>
    ): Flow<String>
}