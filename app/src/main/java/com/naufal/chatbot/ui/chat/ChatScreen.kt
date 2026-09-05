package com.naufal.chatbot.ui.chat

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.naufal.chatbot.Provider
import com.naufal.chatbot.data.repository.ChatRepository
import com.naufal.chatbot.model.Attachment
import com.naufal.chatbot.ui.components.MessageBubble
import com.naufal.chatbot.ui.components.ProviderModelSelector
import kotlinx.coroutines.launch
import java.util.Base64

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    repository: ChatRepository,
    onNewChat: () -> Unit,
    onOpenHistory: () -> Unit,
    onOpenSettings: () -> Unit,
    conversationId: String? = null,
    initialProvider: Provider = Provider.OPENAI,
    initialModel: String = "gpt-4o-mini",
    viewModel: ChatViewModel = viewModel(factory = ChatViewModel.Factory(repository))
) {
    val uiState by viewModel.uiState.collectAsState()
    val listState = rememberLazyListState()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        if (!uiState.isInitialized) {
            if (conversationId != null) {
                viewModel.loadConversationById(conversationId)
            } else {
                viewModel.initialize(initialProvider, initialModel)
            }
        }
    }

    LaunchedEffect(uiState.messages.size) {
        if (uiState.messages.isNotEmpty()) {
            listState.animateScrollToItem(uiState.messages.size - 1)
        }
    }

    val pickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri?.let { resolveAttachment(it, viewModel, context) }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = uiState.selection.displayName,
                            style = MaterialTheme.typography.titleMedium
                        )
                        uiState.conversation?.let {
                            Text(
                                text = it.title,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                },
                actions = {
                    IconButton(onClick = onOpenHistory) {
                        Icon(Icons.Default.History, contentDescription = "History")
                    }
                    IconButton(onClick = onNewChat) {
                        Icon(Icons.Default.Add, contentDescription = "New chat")
                    }
                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Default.Settings, contentDescription = "Settings")
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            ProviderModelSelector(
                selection = uiState.selection,
                customProviders = uiState.customProviders,
                onSelectionChange = { viewModel.setSelection(it) }
            )

            LazyColumn(
                state = listState,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(uiState.messages) { message ->
                    MessageBubble(
                        message = message,
                        onCopy = {
                            scope.launch { snackbarHostState.showSnackbar("Copied") }
                        }
                    )
                }
            }

            uiState.error?.let { error ->
                Text(
                    text = error,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                )
            }

            // Pending attachments preview
            if (uiState.pendingAttachments.isNotEmpty()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    uiState.pendingAttachments.forEachIndexed { index, att ->
                        AttachmentChip(
                            attachment = att,
                            onRemove = { viewModel.removeAttachmentAt(index) }
                        )
                    }
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                verticalAlignment = Alignment.Bottom
            ) {
                IconButton(onClick = { pickerLauncher.launch("*/*") }) {
                    Icon(Icons.Default.AttachFile, contentDescription = "Attach file")
                }

                OutlinedTextField(
                    value = uiState.inputText,
                    onValueChange = { viewModel.setInputText(it) },
                    placeholder = { Text("Type a message...") },
                    modifier = Modifier.weight(1f),
                    enabled = !uiState.isStreaming,
                    maxLines = 4
                )

                Spacer(modifier = Modifier.width(8.dp))

                if (uiState.isStreaming) {
                    IconButton(onClick = { viewModel.stopStreaming() }) {
                        Icon(Icons.Default.Stop, contentDescription = "Stop")
                    }
                } else {
                    IconButton(onClick = { viewModel.sendMessage() }) {
                        Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send")
                    }
                }
            }
        }
    }
}

private fun resolveAttachment(
    uri: Uri,
    viewModel: ChatViewModel,
    context: android.content.Context
) {
    val resolver = context.contentResolver
    val mimeType = resolver.getType(uri) ?: "application/octet-stream"
    val filename = resolver.query(uri, null, null, null, null)?.use { cursor ->
        val nameIdx = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
        if (nameIdx >= 0 && cursor.moveToFirst()) cursor.getString(nameIdx) else null
    }
    val bytes = try {
        resolver.openInputStream(uri)?.use { it.readBytes() }
    } catch (_: Exception) {
        null
    }
    val type = if (mimeType.startsWith("image")) "image" else "document"

    val attachment = Attachment(
        type = type,
        mimeType = mimeType,
        filename = filename,
        dataBase64 = bytes?.let { Base64.getEncoder().encodeToString(it) }
    )
    viewModel.addAttachment(attachment)
}

@Composable
private fun AttachmentChip(
    attachment: Attachment,
    onRemove: () -> Unit
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.padding(vertical = 4.dp)
    ) {
        Text(
            text = attachment.filename ?: attachment.type,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        IconButton(onClick = onRemove, modifier = Modifier.size(24.dp)) {
            Icon(
                Icons.Default.Close,
                contentDescription = "Remove",
                modifier = Modifier.size(16.dp)
            )
        }
    }
}