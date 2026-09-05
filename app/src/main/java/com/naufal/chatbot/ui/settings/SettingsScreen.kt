package com.naufal.chatbot.ui.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
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
import com.naufal.chatbot.data.repository.ChatRepository
import com.naufal.chatbot.model.CustomKind
import com.naufal.chatbot.model.CustomProvider

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    secureKeyStore: SecureKeyStore,
    repository: ChatRepository,
    onBack: () -> Unit,
    viewModel: SettingsViewModel = viewModel(
        factory = SettingsViewModel.Factory(secureKeyStore, repository)
    )
) {
    val uiState by viewModel.uiState.collectAsState()
    var editingProvider by remember { mutableStateOf<Provider?>(null) }
    var keyInput by remember { mutableStateOf("") }

    var editingCustom by remember { mutableStateOf<CustomProvider?>(null) }
    var showAddCustom by remember { mutableStateOf(false) }

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

            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Custom Providers",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.weight(1f)
                    )
                    IconButton(onClick = {
                        editingCustom = null
                        showAddCustom = true
                    }) {
                        Icon(Icons.Default.Add, contentDescription = "Add custom provider")
                    }
                }
            }

            if (uiState.customProviders.isEmpty()) {
                item {
                    Text(
                        text = "Belum ada custom provider",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            items(uiState.customProviders, key = { it.id }) { custom ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            editingCustom = custom
                            showAddCustom = true
                        }
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(custom.name, style = MaterialTheme.typography.titleMedium)
                            Text(
                                text = "${custom.kind.name} · ${custom.model}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                text = custom.baseUrl,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        IconButton(onClick = { viewModel.deleteCustomProvider(custom) }) {
                            Icon(
                                Icons.Default.Delete,
                                contentDescription = "Delete",
                                tint = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                }
            }
        }
    }

    // Edit built-in key dialog
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

    // Add/edit custom provider dialog
    if (showAddCustom) {
        var name by remember { mutableStateOf(editingCustom?.name ?: "") }
        var kind by remember { mutableStateOf(editingCustom?.kind ?: CustomKind.OPENAI) }
        var baseUrl by remember { mutableStateOf(editingCustom?.baseUrl ?: "") }
        var model by remember { mutableStateOf(editingCustom?.model ?: "") }
        var apiKey by remember { mutableStateOf("") }

        AlertDialog(
            onDismissRequest = { showAddCustom = false },
            title = { Text(if (editingCustom == null) "Tambah Custom Provider" else "Edit Custom Provider") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text("Nama") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(
                            selected = kind == CustomKind.OPENAI,
                            onClick = { kind = CustomKind.OPENAI },
                            label = { Text("OpenAI style") }
                        )
                        FilterChip(
                            selected = kind == CustomKind.CLAUDE,
                            onClick = { kind = CustomKind.CLAUDE },
                            label = { Text("Claude style") }
                        )
                    }
                    OutlinedTextField(
                        value = baseUrl,
                        onValueChange = { baseUrl = it },
                        label = { Text("Base URL") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = model,
                        onValueChange = { model = it },
                        label = { Text("Model") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = apiKey,
                        onValueChange = { apiKey = it },
                        label = { Text("API Key") },
                        singleLine = true,
                        placeholder = {
                            Text(if (editingCustom != null) "Kosongkan jika tidak diubah" else "")
                        },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.saveCustomProvider(
                        id = editingCustom?.id,
                        name = name.trim(),
                        kind = kind,
                        baseUrl = baseUrl.trim(),
                        model = model.trim(),
                        apiKey = apiKey.trim()
                    )
                    showAddCustom = false
                }) {
                    Text("Simpan")
                }
            },
            dismissButton = {
                TextButton(onClick = { showAddCustom = false }) {
                    Text("Batal")
                }
            }
        )
    }
}