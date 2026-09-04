package com.naufal.chatbot.ui.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.naufal.chatbot.Provider
import com.naufal.chatbot.data.local.SecureKeyStore

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    secureKeyStore: SecureKeyStore,
    onBack: () -> Unit,
    viewModel: SettingsViewModel = viewModel(factory = SettingsViewModel.Factory(secureKeyStore))
) {
    val uiState by viewModel.uiState.collectAsState()
    var editingProvider by remember { mutableStateOf<Provider?>(null) }
    var keyInput by remember { mutableStateOf("") }
    var workerUrlDialog by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp)
        ) {
            item {
                Text(
                    text = "API Keys",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(vertical = 8.dp)
                )
            }

            items(Provider.entries) { provider ->
                val isConfigured = uiState.keys[provider] ?: false
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            editingProvider = provider
                            keyInput = ""
                        }
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = if (isConfigured)
                                Icons.Default.CheckCircle
                            else
                                Icons.Default.RadioButtonUnchecked,
                            contentDescription = null,
                            tint = if (isConfigured)
                                MaterialTheme.colorScheme.primary
                            else
                                MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(24.dp)
                        )
                        Column(modifier = Modifier.padding(start = 16.dp)) {
                            Text(provider.displayName, style = MaterialTheme.typography.titleMedium)
                            Text(
                                text = if (isConfigured) "Terhubung" else "Belum diatur",
                                style = MaterialTheme.typography.bodySmall,
                                color = if (isConfigured)
                                    MaterialTheme.colorScheme.primary
                                else
                                    MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }
    }

    // Edit key dialog
    editingProvider?.let { provider ->
        AlertDialog(
            onDismissRequest = { editingProvider = null },
            title = { Text("API Key — ${provider.displayName}") },
            text = {
                Column {
                    OutlinedTextField(
                        value = keyInput,
                        onValueChange = { keyInput = it },
                        label = { Text("API Key") },
                        singleLine = true
                    )
                    Text(
                        text = "Kunci disimpan terenkripsi di perangkat ini saja.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.saveKey(provider, keyInput)
                    editingProvider = null
                }) {
                    Text("Simpan")
                }
            },
            dismissButton = {
                TextButton(onClick = { editingProvider = null }) {
                    Text("Batal")
                }
            }
        )
    }
}