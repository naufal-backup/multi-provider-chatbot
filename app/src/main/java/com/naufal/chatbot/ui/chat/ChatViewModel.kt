package com.naufal.chatbot.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.naufal.chatbot.Provider
import com.naufal.chatbot.data.repository.ChatRepository
import com.naufal.chatbot.model.ChatMessage
import com.naufal.chatbot.model.Conversation
import com.naufal.chatbot.model.CustomProvider
import com.naufal.chatbot.model.Message
import com.naufal.chatbot.model.ProviderSelection
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ChatUiState(
    val conversation: Conversation? = null,
    val messages: List<ChatMessage> = emptyList(),
    val selection: ProviderSelection = ProviderSelection.BuiltIn(Provider.OPENAI, "gpt-4o-mini"),
    val customProviders: List<CustomProvider> = emptyList(),
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

    init {
        viewModelScope.launch {
            repository.getAllCustomProviders().collect { providers ->
                _uiState.value = _uiState.value.copy(customProviders = providers)
            }
        }
    }

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
                selection = ProviderSelection.BuiltIn(provider, model),
                isInitialized = true
            )
        }
    }

    fun loadConversationById(id: String) {
        if (_uiState.value.isInitialized) return
        viewModelScope.launch {
            val conversation = repository.getConversationById(id) ?: return@launch
            val selection = if (conversation.customProviderId != null) {
                _uiState.value.customProviders
                    .firstOrNull { it.id == conversation.customProviderId }
                    ?.let { ProviderSelection.Custom(it) }
                    ?: ProviderSelection.BuiltIn(conversation.provider, conversation.model)
            } else {
                ProviderSelection.BuiltIn(conversation.provider, conversation.model)
            }
            _uiState.value = _uiState.value.copy(
                conversation = conversation,
                selection = selection,
                isInitialized = true
            )
            repository.getMessages(id).collect { msgs ->
                _uiState.value = _uiState.value.copy(
                    messages = msgs.map { ChatMessage(it.role, it.content) }
                )
            }
        }
    }

    fun loadConversation(conversation: Conversation) {
        _uiState.value = _uiState.value.copy(isInitialized = false)
        loadConversationById(conversation.id)
    }

    fun setInputText(text: String) {
        _uiState.value = _uiState.value.copy(inputText = text)
    }

    fun setSelection(selection: ProviderSelection) {
        _uiState.value = _uiState.value.copy(selection = selection)
    }

    fun setProvider(provider: Provider) {
        val model = when (provider) {
            Provider.OPENAI -> "gpt-4o-mini"
            Provider.ANTHROPIC -> "claude-3-5-sonnet-20241022"
            Provider.GOOGLE -> "gemini-1.5-flash"
            Provider.DEEPSEEK -> "deepseek-chat"
        }
        setSelection(ProviderSelection.BuiltIn(provider, model))
    }

    fun setModel(model: String) {
        val current = _uiState.value.selection
        if (current is ProviderSelection.BuiltIn) {
            setSelection(current.copy(model = model))
        }
    }

    fun setCustomProvider(custom: CustomProvider) {
        setSelection(ProviderSelection.Custom(custom))
    }

    fun sendMessage() {
        val text = _uiState.value.inputText.trim()
        val conv = _uiState.value.conversation ?: return
        if (text.isEmpty() || _uiState.value.isStreaming) return

        val selection = _uiState.value.selection
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
                repository.saveMessage(
                    Message(
                        conversationId = conv.id,
                        role = "user",
                        content = text,
                        createdAt = System.currentTimeMillis()
                    )
                )

                val stream = repository.streamChat(
                    selection = selection,
                    messages = _uiState.value.messages + userMessage
                )

                val sb = StringBuilder()
                stream.collect { token ->
                    sb.append(token)
                    val msgs = _uiState.value.messages.toMutableList()
                    msgs[msgs.size - 1] = ChatMessage("assistant", sb.toString())
                    _uiState.value = _uiState.value.copy(messages = msgs)
                }

                repository.saveMessage(
                    Message(
                        conversationId = conv.id,
                        role = "assistant",
                        content = sb.toString(),
                        createdAt = System.currentTimeMillis()
                    )
                )

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