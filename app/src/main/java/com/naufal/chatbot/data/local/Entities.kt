package com.naufal.chatbot.data.local

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.PrimaryKey

@Entity(tableName = "conversations")
data class ConversationEntity(
    @PrimaryKey val id: String,
    val title: String,
    val provider: String,
    val model: String,
    val customProviderId: String? = null,
    val createdAt: Long,
    val updatedAt: Long
)

@Entity(
    tableName = "messages",
    foreignKeys = [
        ForeignKey(
            entity = ConversationEntity::class,
            parentColumns = ["id"],
            childColumns = ["conversationId"],
            onDelete = ForeignKey.CASCADE
        )
    ]
)
data class MessageEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val conversationId: String,
    val role: String,
    val content: String,
    val createdAt: Long
)

@Entity(tableName = "custom_providers")
data class CustomProviderEntity(
    @PrimaryKey val id: String,
    val name: String,
    val kind: String,      // "openai" | "claude"
    val baseUrl: String,
    val model: String,
    val createdAt: Long
)