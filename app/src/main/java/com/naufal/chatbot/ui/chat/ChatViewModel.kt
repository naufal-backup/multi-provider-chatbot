package com.naufal.chatbot.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.naufal.chatbot.Provider
import com.naufal.chatbot.data.repository.ChatRepository
import com.naufal.chatbot.model.ChatMessage
import com.naufal.chatbot.model.Message
import com.naufal.chatbot.model.Conversation
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID

data class ChatUiState(
    val conversation: Conversation? = null,
    val messages: List<ChatMessage> = emptyList(),
    val selectedProvider: Provider = Provider.OPENAI,
    val selectedModel: String = "gpt-4o-mini",
    val inputText: String = "",
    val isStreaming: Boolean = false,
    val error: String? = null,
    val isInitialized: Boolean = false
)

class ChatViewModel(
    private val repository: ChatRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    fun initialize(provider: Provider, model: String) {
        if (_uiState.value.isInitialized) return
        viewModelScope.launch {
            val conv = repository.createConversation(
                title = "New chat",
                provider = provider,
                model = model
            )
            _uiState.value = _uiState.value.copy(
                conversation = conv,
                selectedProvider = provider,
                selectedModel = model,
                isInitialized = true
            )
        }
    }

    fun loadConversation(conversation: Conversation) {
        _uiState.value = _uiState.value.copy(
            conversation = conversation,
            selectedProvider = conversation.provider,
            selectedModel = conversation.model,
            isInitialized = true
        )
        viewModelScope.launch {
            repository.getMessages(conversation.id).collect { msgs ->
                _uiState.value = _uiState.value.copy(
                    messages = msgs.map { ChatMessage(it.role, it.content) }
                )
            }
        }
    }

    fun setInputText(text: String) {
        _uiState.value = _uiState.value.copy(inputText = text)
    }

    fun setProvider(provider: Provider) {
        _uiState.value = _uiState.value.copy(selectedProvider = provider)
    }

    fun setModel(model: String) {
        _uiState.value = _uiState.value.copy(selectedModel = model)
    }

    fun sendMessage() {
        val text = _uiState.value.inputText.trim()
        val conv = _uiState.value.conversation ?: return
        if (text.isEmpty() || _uiState.value.isStreaming) return

        val userMessage = ChatMessage("user", text)
        val assistantPlaceholder = ChatMessage("assistant", "")

        _uiState.value = _uiState.value.copy(
            messages = _uiState.value.messages + userMessage + assistantPlaceholder,
            inputText = "",
            isStreaming = true,
            error = null
        )

        viewModelScope.launch {
            try {
                // Save user message
                repository.saveMessage(
                    Message(
                        conversationId = conv.id,
                        role = "user",
                        content = text,
                        createdAt = System.currentTimeMillis()
                    )
                )

                val stream = repository.streamChat(
                    provider = _uiState.value.selectedProvider,
                    model = _uiState.value.selectedModel,
                    messages = _uiState.value.messages + userMessage
                )

                val sb = StringBuilder()
                stream.collect { token ->
                    sb.append(token)
                    val msgs = _uiState.value.messages.toMutableList()
                    msgs[msgs.size - 1] = ChatMessage("assistant", sb.toString())
                    _uiState.value = _uiState.value.copy(messages = msgs)
                }

                // Save assistant message
                repository.saveMessage(
                    Message(
                        conversationId = conv.id,
                        role = "assistant",
                        content = sb.toString(),
                        createdAt = System.currentTimeMillis()
                    )
                )

                // Auto-rename conversation with first user message
                if (_uiState.value.messages.size <= 2) {
                    val title = text.take(50) + if (text.length > 50) "..." else ""
                    repository.renameConversation(conv.id, title)
                    _uiState.value = _uiState.value.copy(
                        conversation = _uiState.value.conversation?.copy(title = title)
                    )
                }

            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    error = e.message ?: "Unknown error",
                    isStreaming = false
                )
                // Remove the empty assistant placeholder
                val msgs = _uiState.value.messages.toMutableList()
                if (msgs.isNotEmpty()) msgs.removeAt(msgs.size - 1)
                _uiState.value = _uiState.value.copy(messages = msgs)
            } finally {
                _uiState.value = _uiState.value.copy(isStreaming = false)
            }
        }
    }

    class Factory(private val repository: ChatRepository) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return ChatViewModel(repository) as T
        }
    }
}