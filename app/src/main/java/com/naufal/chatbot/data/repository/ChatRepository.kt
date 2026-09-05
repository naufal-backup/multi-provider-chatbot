package com.naufal.chatbot.data.repository

import com.naufal.chatbot.Provider
import com.naufal.chatbot.data.local.ConversationDao
import com.naufal.chatbot.data.local.ConversationEntity
import com.naufal.chatbot.data.local.CustomProviderDao
import com.naufal.chatbot.data.local.CustomProviderEntity
import com.naufal.chatbot.data.local.MessageDao
import com.naufal.chatbot.data.local.MessageEntity
import com.naufal.chatbot.data.local.SecureKeyStore
import com.naufal.chatbot.data.remote.ChatApiService
import com.naufal.chatbot.model.ChatMessage
import com.naufal.chatbot.model.Conversation
import com.naufal.chatbot.model.CustomKind
import com.naufal.chatbot.model.CustomProvider
import com.naufal.chatbot.model.Message
import com.naufal.chatbot.model.ProviderSelection
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.util.UUID

class ChatRepository(
    private val conversationDao: ConversationDao,
    private val messageDao: MessageDao,
    private val customProviderDao: CustomProviderDao,
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

    suspend fun getConversationById(id: String): Conversation? =
        conversationDao.getConversationById(id)?.toDomain()

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
            customProviderId = null,
            createdAt = now,
            updatedAt = now
        )
        conversationDao.upsertConversation(entity)
        return entity.toDomain()
    }

    suspend fun createConversationCustom(
        title: String,
        custom: CustomProvider
    ): Conversation {
        val now = System.currentTimeMillis()
        val entity = ConversationEntity(
            id = UUID.randomUUID().toString(),
            title = title,
            provider = custom.kind.name.lowercase(), // placeholder for display; custom id takes precedence
            model = custom.model,
            customProviderId = custom.id,
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
                customProviderId = conversation.customProviderId,
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

    // ---- Custom providers ----

    fun getAllCustomProviders(): Flow<List<CustomProvider>> =
        customProviderDao.getAll().map { entities ->
            entities.map { it.toDomain() }
        }

    suspend fun saveCustomProvider(
        id: String?,
        name: String,
        kind: CustomKind,
        baseUrl: String,
        model: String,
        apiKey: String
    ) {
        val providerId = id ?: UUID.randomUUID().toString()
        customProviderDao.upsert(
            CustomProviderEntity(
                id = providerId,
                name = name,
                kind = when (kind) {
                    CustomKind.OPENAI -> "openai"
                    CustomKind.CLAUDE -> "claude"
                },
                baseUrl = baseUrl,
                model = model,
                createdAt = System.currentTimeMillis()
            )
        )
        if (apiKey.isBlank()) {
            secureKeyStore.removeKey("custom_$providerId")
        } else {
            secureKeyStore.saveKey("custom_$providerId", apiKey)
        }
    }

    suspend fun deleteCustomProvider(provider: CustomProvider) {
        customProviderDao.delete(
            CustomProviderEntity(
                id = provider.id,
                name = provider.name,
                kind = when (provider.kind) {
                    CustomKind.OPENAI -> "openai"
                    CustomKind.CLAUDE -> "claude"
                },
                baseUrl = provider.baseUrl,
                model = provider.model,
                createdAt = provider.createdAt
            )
        )
        secureKeyStore.removeKey("custom_${provider.id}")
    }

    suspend fun streamChatCustom(
        provider: CustomProvider,
        messages: List<ChatMessage>
    ): Flow<String> {
        val apiKey = secureKeyStore.getKey("custom_${provider.id}")
            ?: throw IllegalStateException("API key not configured for ${provider.name}")
        return apiService.streamChatCustom(
            kind = provider.kind,
            baseUrl = provider.baseUrl,
            apiKey = apiKey,
            model = provider.model,
            messages = messages
        )
    }

    private fun CustomProviderEntity.toDomain() = CustomProvider(
        id = id,
        name = name,
        kind = when (kind) {
            "claude" -> CustomKind.CLAUDE
            else -> CustomKind.OPENAI
        },
        baseUrl = baseUrl,
        model = model,
        createdAt = createdAt
    )

    suspend fun streamChat(
        provider: Provider,
        model: String,
        messages: List<ChatMessage>
    ): Flow<String> {
        val apiKey = secureKeyStore.getKey(provider.key)
            ?: throw IllegalStateException("API key not configured for ${provider.displayName}")

        return apiService.streamChat(provider, apiKey, model, messages)
    }

    suspend fun streamChat(
        selection: ProviderSelection,
        messages: List<ChatMessage>
    ): Flow<String> = when (selection) {
        is ProviderSelection.BuiltIn ->
            streamChat(selection.provider, selection.model, messages)
        is ProviderSelection.Custom ->
            streamChatCustom(selection.provider, messages)
    }

    private fun ConversationEntity.toDomain() = Conversation(
        id = id,
        title = title,
        provider = Provider.fromKey(provider),
        model = model,
        customProviderId = customProviderId,
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