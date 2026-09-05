package com.naufal.chatbot.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.naufal.chatbot.Provider
import com.naufal.chatbot.data.local.SecureKeyStore
import com.naufal.chatbot.data.repository.ChatRepository
import com.naufal.chatbot.model.CustomKind
import com.naufal.chatbot.model.CustomProvider
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SettingsUiState(
    val keys: Map<Provider, Boolean> = Provider.entries.associateWith { false },
    val customProviders: List<CustomProvider> = emptyList()
)

class SettingsViewModel(
    private val secureKeyStore: SecureKeyStore,
    private val repository: ChatRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    init {
        refreshKeyStatus()
        observeCustomProviders()
    }

    private fun observeCustomProviders() {
        viewModelScope.launch {
            repository.getAllCustomProviders().collect { providers ->
                _uiState.update { it.copy(customProviders = providers) }
            }
        }
    }

    fun refreshKeyStatus() {
        _uiState.update { state ->
            state.copy(
                keys = Provider.entries.associateWith { secureKeyStore.hasKey(it.key) }
            )
        }
    }

    fun saveKey(provider: Provider, apiKey: String) {
        if (apiKey.isBlank()) {
            secureKeyStore.removeKey(provider.key)
        } else {
            secureKeyStore.saveKey(provider.key, apiKey.trim())
        }
        refreshKeyStatus()
    }

    fun saveCustomProvider(
        id: String?,
        name: String,
        kind: CustomKind,
        baseUrl: String,
        model: String,
        apiKey: String
    ) {
        viewModelScope.launch {
            repository.saveCustomProvider(id, name, kind, baseUrl, model, apiKey)
        }
    }

    fun deleteCustomProvider(provider: CustomProvider) {
        viewModelScope.launch {
            repository.deleteCustomProvider(provider)
        }
    }

    class Factory(
        private val secureKeyStore: SecureKeyStore,
        private val repository: ChatRepository
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return SettingsViewModel(secureKeyStore, repository) as T
        }
    }
}