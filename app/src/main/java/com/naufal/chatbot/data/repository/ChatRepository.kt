package com.naufal.chatbot.data.repository

import com.naufal.chatbot.Provider
import com.naufal.chatbot.data.local.ConversationDao
import com.naufal.chatbot.data.local.ConversationEntity
import com.naufal.chatbot.data.local.MessageDao
import com.naufal.chatbot.data.local.MessageEntity
import com.naufal.chatbot.data.local.SecureKeyStore
import com.naufal.chatbot.data.remote.ChatApiService
import com.naufal.chatbot.data.remote.dto.ChatMessageDto
import com.naufal.chatbot.data.remote.dto.ChatRequest
import com.naufal.chatbot.model.ChatMessage
import com.naufal.chatbot.model.Conversation
import com.naufal.chatbot.model.Message
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.util.UUID

class ChatRepository(
    private val conversationDao: ConversationDao,
    private val messageDao: MessageDao,
    private val secureKeyStore: SecureKeyStore,
    private val apiService: ChatApiService
) {

    fun getAllConversations(): Flow<List<Conversation>> =
        conversationDao.getAllConversations().map { entities ->
            entities.map { it.toDomain() }
        }

    fun getMessages(conversationId: String): Flow<List<Message>> =
        messageDao.getMessagesByConversation(conversationId).map { entities ->
            entities.map { it.toDomain() }
        }

    suspend fun createConversation(
        title: String,
        provider: Provider,
        model: String
    ): Conversation {
        val now = System.currentTimeMillis()
        val entity = ConversationEntity(
            id = UUID.randomUUID().toString(),
            title = title,
            provider = provider.key,
            model = model,
            createdAt = now,
            updatedAt = now
        )
        conversationDao.upsertConversation(entity)
        return entity.toDomain()
    }

    suspend fun deleteConversation(conversation: Conversation) {
        conversationDao.deleteConversation(
            ConversationEntity(
                id = conversation.id,
                title = conversation.title,
                provider = conversation.provider.key,
                model = conversation.model,
                createdAt = conversation.createdAt,
                updatedAt = conversation.updatedAt
            )
        )
    }

    suspend fun renameConversation(id: String, title: String) {
        conversationDao.renameConversation(id, title, System.currentTimeMillis())
    }

    suspend fun saveMessage(message: Message) {
        messageDao.insertMessage(
            MessageEntity(
                conversationId = message.conversationId,
                role = message.role,
                content = message.content,
                createdAt = message.createdAt
            )
        )
    }

    suspend fun streamChat(
        provider: Provider,
        model: String,
        messages: List<ChatMessage>
    ): Flow<String> {
        val apiKey = secureKeyStore.getKey(provider.key)
            ?: throw IllegalStateException("API key not configured for ${provider.displayName}")

        val request = ChatRequest(
            provider = provider.key,
            model = model,
            apiKey = apiKey,
            messages = messages.map { ChatMessageDto(it.role, it.content) }
        )

        return apiService.streamChat(request)
    }

    private fun ConversationEntity.toDomain() = Conversation(
        id = id,
        title = title,
        provider = Provider.fromKey(provider),
        model = model,
        createdAt = createdAt,
        updatedAt = updatedAt
    )

    private fun MessageEntity.toDomain() = Message(
        id = id,
        conversationId = conversationId,
        role = role,
        content = content,
        createdAt = createdAt
    )
}