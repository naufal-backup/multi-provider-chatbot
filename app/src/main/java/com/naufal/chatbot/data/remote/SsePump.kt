package com.naufal.chatbot.data.remote

import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.request.preparePost
import io.ktor.client.request.header
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsChannel
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.utils.io.readUTF8Line
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Shared HTTP + SSE plumbing for direct provider calls.
 * Each provider supplies its own URL, headers, body, and chunk parser.
 */
internal object SsePump {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private val client: HttpClient by lazy {
        HttpClient(OkHttp) {
            expectSuccess = false
        }
    }

    fun stream(
        url: String,
        headers: Map<String, String>,
        bodyJson: String,
        parseChunk: (JsonElement) -> String?
    ): Flow<String> = flow {
        val response: HttpResponse = client.preparePost(url) {
            contentType(ContentType.Application.Json)
            headers.forEach { (k, v) -> header(k, v) }
            setBody(bodyJson)
        }.execute()

        if (!response.status.isSuccess()) {
            val text = response.bodyAsText()
            throw ChatException("Upstream error (${response.status.value}): ${text.take(500)}")
        }

        val channel = response.bodyAsChannel()
        while (!channel.isClosedForRead) {
            val line = channel.readUTF8Line() ?: break
            val trimmed = line.trim()
            if (!trimmed.startsWith("data:")) continue
            val data = trimmed.removePrefix("data:").trim()
            if (data.isEmpty() || data == "[DONE]") continue

            val parsed = try {
                json.parseToJsonElement(data)
            } catch (_: Exception) {
                continue
            }

            val delta = parseChunk(parsed)
            if (!delta.isNullOrEmpty()) {
                emit(delta)
            }
        }
    }
}

class ChatException(message: String) : Exception(message)