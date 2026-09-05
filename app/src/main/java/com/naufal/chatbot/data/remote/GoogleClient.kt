package com.naufal.chatbot.data.remote

import com.naufal.chatbot.model.ChatMessage
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

class GoogleClient : ProviderClient {
    override fun streamChat(
        apiKey: String,
        model: String,
        messages: List<ChatMessage>
    ): Flow<String> {
        val body = buildJsonObject {
            put("contents", buildJsonArray {
                messages.forEach { m ->
                    addJsonObject {
                        put("role", if (m.role == "assistant") "model" else "user")
                        put("parts", buildJsonArray {
                            if (m.content.isNotBlank()) {
                                addJsonObject { put("text", m.content) }
                            }
                            m.attachments.forEach { att ->
                                if (att.type == "image" && att.dataBase64 != null) {
                                    addJsonObject {
                                        put("inline_data", buildJsonObject {
                                            put("mime_type", att.mimeType)
                                            put("data", att.dataBase64)
                                        })
                                    }
                                }
                            }
                        })
                    }
                }
            })
        }

        return SsePump.stream(
            url = "https://generativelanguage.googleapis.com/v1beta/models/$model:streamGenerateContent?alt=sse",
            headers = mapOf(
                "x-goog-api-key" to apiKey
            ),
            bodyJson = body.toString(),
            parseChunk = { chunk ->
                chunk.jsonObject["candidates"]
                    ?.jsonArray?.firstOrNull()
                    ?.jsonObject?.get("content")
                    ?.jsonObject?.get("parts")
                    ?.jsonArray?.firstOrNull()
                    ?.jsonObject?.get("text")
                    ?.jsonPrimitive?.content
            }
        )
    }
}