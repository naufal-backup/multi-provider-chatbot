package com.naufal.chatbot.data.remote

import com.naufal.chatbot.data.remote.dto.ChatRequest
import com.naufal.chatbot.data.remote.dto.ErrorResponse
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.preparePost
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsChannel
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import io.ktor.utils.io.readUTF8Line
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.serialization.json.Json

class ChatApiService(private val workerUrl: String) {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    private val client = HttpClient(OkHttp) {
        install(ContentNegotiation) {
            json(json)
        }
    }

    suspend fun streamChat(request: ChatRequest): Flow<String> = flow {
        val response = client.preparePost(workerUrl) {
            contentType(ContentType.Application.Json)
            setBody(request)
        }.execute()

        if (!response.status.value.let { it in 200..299 }) {
            val errorBody = try {
                val text = response.bodyAsText()
                json.decodeFromString(ErrorResponse.serializer(), text).error
            } catch (_: Exception) {
                "Unknown error (${response.status.value})"
            }
            throw ChatException(errorBody)
        }

        val channel = response.bodyAsChannel()
        while (!channel.isClosedForRead) {
            val line = channel.readUTF8Line() ?: break
            if (line.startsWith("data: ")) {
                val data = line.removePrefix("data: ").trim()
                if (data.isNotEmpty() && data != "[DONE]") {
                    val clean = data.trim('"')
                    emit(clean)
                }
            }
        }
        channel.close()
    }
}

class ChatException(message: String) : Exception(message)