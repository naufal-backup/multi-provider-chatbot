package com.naufal.chatbot.data.remote

import com.naufal.chatbot.model.ChatMessage
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

class AnthropicClient(private val baseUrl: String = "https://api.anthropic.com/v1/messages") : ProviderClient {
    override fun streamChat(
        apiKey: String,
        model: String,
        messages: List<ChatMessage>
    ): Flow<String> {
        val system = messages.filter { it.role == "system" }
            .joinToString("\n") { it.content }
        val rest = messages.filter { it.role != "system" }

        val body = buildJsonObject {
            put("model", model)
            put("messages", buildJsonArray {
                rest.forEach { m ->
                    addJsonObject {
                        put("role", m.role)
                        if (m.attachments.isEmpty()) {
                            put("content", m.content)
                        } else {
                            put("content", buildJsonArray {
                                if (m.content.isNotBlank()) {
                                    addJsonObject {
                                        put("type", "text")
                                        put("text", m.content)
                                    }
                                }
                                m.attachments.filter { it.type == "image" && it.dataBase64 != null }
                                    .forEach { att ->
                                        addJsonObject {
                                            put("type", "image")
                                            put("source", buildJsonObject {
                                                put("type", "base64")
                                                put("media_type", att.mimeType)
                                                put("data", att.dataBase64)
                                            })
                                        }
                                    }
                            })
                        }
                    }
                }
            })
            put("max_tokens", 4096)
            put("stream", true)
            if (system.isNotEmpty()) put("system", system)
        }

        return SsePump.stream(
            url = baseUrl,
            headers = mapOf(
                "x-api-key" to apiKey,
                "anthropic-version" to "2023-06-01"
            ),
            bodyJson = body.toString(),
            parseChunk = { chunk ->
                val obj = chunk.jsonObject
                if (obj["type"]?.jsonPrimitive?.content == "content_block_delta") {
                    obj["delta"]?.jsonObject?.get("text")?.jsonPrimitive?.content
                } else {
                    null
                }
            }
        )
    }
}