package com.naufal.chatbot.ui.history

import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
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
import com.naufal.chatbot.data.repository.ChatRepository
import com.naufal.chatbot.model.Conversation
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(
    repository: ChatRepository,
    onOpenConversation: (Conversation) -> Unit,
    onBack: () -> Unit,
    onNewChat: () -> Unit,
    viewModel: HistoryViewModel = viewModel(factory = HistoryViewModel.Factory(repository))
) {
    val uiState by viewModel.uiState.collectAsState()
    var conversationToDelete by remember { mutableStateOf<Conversation?>(null) }
    var conversationToRename by remember { mutableStateOf<Conversation?>(null) }
    var renameText by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Riwayat Percakapan") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = onNewChat) {
                        Icon(Icons.Default.Add, contentDescription = "New chat")
                    }
                }
            )
        }
    ) { padding ->
        if (uiState.conversations.isEmpty()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text("Belum ada percakapan", style = MaterialTheme.typography.bodyLarge)
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp)
            ) {
                items(uiState.conversations, key = { it.id }) { conversation ->
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .combinedClickable(
                                onClick = { onOpenConversation(conversation) },
                                onLongClick = {
                                    renameText = conversation.title
                                    conversationToRename = conversation
                                }
                            )
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                text = conversation.title,
                                style = MaterialTheme.typography.titleMedium
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = "${conversation.provider.displayName} · ${conversation.model}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Text(
                                    text = SimpleDateFormat("dd MMM yy HH:mm", Locale.getDefault())
                                        .format(Date(conversation.updatedAt)),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            TextButton(
                                onClick = { conversationToDelete = conversation },
                                modifier = Modifier.align(Alignment.End)
                            ) {
                                Text("Hapus", color = MaterialTheme.colorScheme.error)
                            }
                        }
                    }
                }
            }
        }
    }

    // Delete confirmation
    conversationToDelete?.let { conversation ->
        AlertDialog(
            onDismissRequest = { conversationToDelete = null },
            title = { Text("Hapus percakapan?") },
            text = { Text("Percakapan \"${conversation.title}\" akan dihapus permanen.") },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.deleteConversation(conversation)
                    conversationToDelete = null
                }) {
                    Text("Hapus")
                }
            },
            dismissButton = {
                TextButton(onClick = { conversationToDelete = null }) {
                    Text("Batal")
                }
            }
        )
    }

    // Rename dialog
    conversationToRename?.let { conversation ->
        AlertDialog(
            onDismissRequest = { conversationToRename = null },
            title = { Text("Ganti nama") },
            text = {
                OutlinedTextField(
                    value = renameText,
                    onValueChange = { renameText = it },
                    label = { Text("Judul") }
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.renameConversation(conversation.id, renameText)
                    conversationToRename = null
                }) {
                    Text("Simpan")
                }
            },
            dismissButton = {
                TextButton(onClick = { conversationToRename = null }) {
                    Text("Batal")
                }
            }
        )
    }
}