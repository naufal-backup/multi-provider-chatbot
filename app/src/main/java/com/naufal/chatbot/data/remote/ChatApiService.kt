package com.naufal.chatbot.data.remote

import com.naufal.chatbot.Provider
import com.naufal.chatbot.model.ChatMessage
import com.naufal.chatbot.model.CustomKind
import kotlinx.coroutines.flow.Flow

/**
 * Routes stream requests to the correct provider client. No proxy, no worker —
 * each provider is called directly from the device.
 */
class ChatApiService {

    private val builtinClients: Map<Provider, ProviderClient> = mapOf(
        Provider.OPENAI to OpenAiClient(),
        Provider.ANTHROPIC to AnthropicClient(),
        Provider.GOOGLE to GoogleClient(),
        Provider.DEEPSEEK to DeepSeekClient()
    )

    fun streamChat(
        provider: Provider,
        apiKey: String,
        model: String,
        messages: List<ChatMessage>
    ): Flow<String> {
        val client = builtinClients[provider]
            ?: throw ChatException("Unknown provider: ${provider.key}")
        return client.streamChat(apiKey, model, messages)
    }

    fun streamChatCustom(
        kind: CustomKind,
        baseUrl: String,
        apiKey: String,
        model: String,
        messages: List<ChatMessage>
    ): Flow<String> {
        val client: ProviderClient = when (kind) {
            CustomKind.OPENAI -> OpenAiClient(baseUrl)
            CustomKind.CLAUDE -> AnthropicClient(baseUrl)
        }
        return client.streamChat(apiKey, model, messages)
    }
}