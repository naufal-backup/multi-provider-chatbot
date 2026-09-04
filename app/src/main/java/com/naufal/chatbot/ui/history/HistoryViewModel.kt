package com.naufal.chatbot.ui.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.naufal.chatbot.data.repository.ChatRepository
import com.naufal.chatbot.model.Conversation
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class HistoryUiState(
    val conversations: List<Conversation> = emptyList()
)

class HistoryViewModel(
    private val repository: ChatRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(HistoryUiState())
    val uiState: StateFlow<HistoryUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            repository.getAllConversations().collect { convs ->
                _uiState.value = HistoryUiState(conversations = convs)
            }
        }
    }

    fun deleteConversation(conversation: Conversation) {
        viewModelScope.launch {
            repository.deleteConversation(conversation)
        }
    }

    fun renameConversation(id: String, newTitle: String) {
        viewModelScope.launch {
            repository.renameConversation(id, newTitle)
        }
    }

    class Factory(private val repository: ChatRepository) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return HistoryViewModel(repository) as T
        }
    }
}