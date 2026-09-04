package com.naufal.chatbot.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class ChatRequest(
    val provider: String,
    val model: String,
    val apiKey: String,
    val messages: List<ChatMessageDto>
)

@Serializable
data class ChatMessageDto(
    val role: String,
    val content: String
)

@Serializable
data class ChatResponse(
    val content: String
)

@Serializable
data class ErrorResponse(
    val error: String
)