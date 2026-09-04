package com.naufal.chatbot.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.naufal.chatbot.Provider
import com.naufal.chatbot.data.local.SecureKeyStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

data class SettingsUiState(
    val keys: Map<Provider, Boolean> = Provider.entries.associateWith { false },
    val workerUrl: String = "https://your-worker.your-subdomain.workers.dev/chat"
)

class SettingsViewModel(
    private val secureKeyStore: SecureKeyStore
) : ViewModel() {

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    init {
        refreshKeyStatus()
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

    class Factory(private val secureKeyStore: SecureKeyStore) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return SettingsViewModel(secureKeyStore) as T
        }
    }
}