package com.naufal.chatbot.data.remote

import com.naufal.chatbot.model.ChatMessage
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

class OpenAiClient(private val baseUrl: String = "https://api.openai.com/v1/chat/completions") : ProviderClient {
    override fun streamChat(
        apiKey: String,
        model: String,
        messages: List<ChatMessage>
    ): Flow<String> {
        val body = buildJsonObject {
            put("model", model)
            put("messages", buildJsonArray {
                messages.forEach { m ->
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
                                            put("type", "image_url")
                                            put("image_url", buildJsonObject {
                                                put("url", "data:${att.mimeType};base64,${att.dataBase64}")
                                            })
                                        }
                                    }
                            })
                        }
                    }
                }
            })
            put("stream", true)
        }

        return SsePump.stream(
            url = baseUrl,
            headers = mapOf(
                "Authorization" to "Bearer $apiKey"
            ),
            bodyJson = body.toString(),
            parseChunk = { chunk ->
                chunk.jsonObject["choices"]
                    ?.jsonArray?.firstOrNull()
                    ?.jsonObject?.get("delta")
                    ?.jsonObject?.get("content")
                    ?.jsonPrimitive?.content
            }
        )
    }
}