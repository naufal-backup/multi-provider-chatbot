package com.naufal.chatbot.model

import com.naufal.chatbot.Provider

data class Conversation(
    val id: String,
    val title: String,
    val provider: Provider,
    val model: String,
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