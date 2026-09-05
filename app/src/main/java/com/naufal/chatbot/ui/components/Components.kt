package com.naufal.chatbot.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.naufal.chatbot.Provider
import com.naufal.chatbot.model.Attachment
import com.naufal.chatbot.model.ChatMessage
import com.naufal.chatbot.model.CustomProvider
import com.naufal.chatbot.model.ProviderSelection
import kotlinx.coroutines.launch

@Composable
fun MessageBubble(
    message: ChatMessage,
    onCopy: (String) -> Unit = {}
) {
    val isUser = message.role == "user"
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
    ) {
        Column(
            horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
            modifier = Modifier.fillMaxWidth(0.85f)
        ) {
            Box(
                modifier = Modifier
                    .background(
                        color = if (isUser)
                            MaterialTheme.colorScheme.primaryContainer
                        else
                            MaterialTheme.colorScheme.surfaceVariant,
                        shape = RoundedCornerShape(16.dp)
                    )
                    .padding(12.dp)
            ) {
                Column {
                    // Attachments (images / documents)
                    message.attachments.forEach { att ->
                        AttachmentView(att, context)
                    }

                    if (message.content.isNotBlank()) {
                        if (isUser) {
                            Text(
                                text = message.content,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        } else {
                            MarkdownText(
                                text = message.content,
                                onCopy = onCopy
                            )
                        }
                    }
                }
            }

            if (!isUser) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = {
                        clipboard.setText(AnnotatedString(message.content))
                        onCopy(message.content)
                    }) {
                        Icon(
                            Icons.Default.ContentCopy,
                            contentDescription = "Copy",
                            modifier = Modifier.size(16.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AttachmentView(att: Attachment, context: android.content.Context) {
    when {
        att.type == "image" && att.url != null -> {
            AsyncImage(
                model = ImageRequest.Builder(context)
                    .data(att.url)
                    .crossfade(true)
                    .build(),
                contentDescription = att.filename ?: "image",
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp)
            )
        }
        att.type == "image" && att.dataBase64 != null -> {
            val bytes = android.util.Base64.decode(att.dataBase64, android.util.Base64.DEFAULT)
            AsyncImage(
                model = ImageRequest.Builder(context)
                    .data(bytes)
                    .crossfade(true)
                    .build(),
                contentDescription = att.filename ?: "image",
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp)
            )
        }
        att.filename != null -> {
            Text(
                text = "Attachment: ${att.filename}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProviderModelSelector(
    selection: ProviderSelection,
    customProviders: List<CustomProvider>,
    onSelectionChange: (ProviderSelection) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        var providerExpanded by remember { mutableStateOf(false) }

        ExposedDropdownMenuBox(
            expanded = providerExpanded,
            onExpandedChange = { providerExpanded = it },
            modifier = Modifier.weight(1f)
        ) {
            OutlinedTextField(
                value = selection.displayName,
                onValueChange = {},
                readOnly = true,
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = providerExpanded) },
                modifier = Modifier.menuAnchor(),
                label = { Text("Provider") },
                singleLine = true
            )
            ExposedDropdownMenu(
                expanded = providerExpanded,
                onDismissRequest = { providerExpanded = false }
            ) {
                Provider.entries.forEach { provider ->
                    DropdownMenuItem(
                        text = { Text(provider.displayName) },
                        onClick = {
                            val model = defaultModelFor(provider)
                            onSelectionChange(ProviderSelection.BuiltIn(provider, model))
                            providerExpanded = false
                        }
                    )
                }
                customProviders.forEach { custom ->
                    DropdownMenuItem(
                        text = { Text(custom.name) },
                        onClick = {
                            onSelectionChange(ProviderSelection.Custom(custom))
                            providerExpanded = false
                        }
                    )
                }
            }
        }

        val models = when (selection) {
            is ProviderSelection.BuiltIn -> modelsFor(selection.provider)
            is ProviderSelection.Custom -> listOf(selection.provider.model)
        }

        var modelExpanded by remember { mutableStateOf(false) }

        ExposedDropdownMenuBox(
            expanded = modelExpanded,
            onExpandedChange = { modelExpanded = it },
            modifier = Modifier.weight(1f)
        ) {
            OutlinedTextField(
                value = when (selection) {
                    is ProviderSelection.BuiltIn -> selection.model
                    is ProviderSelection.Custom -> selection.provider.model
                },
                onValueChange = {},
                readOnly = true,
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = modelExpanded) },
                modifier = Modifier.menuAnchor(),
                label = { Text("Model") },
                singleLine = true
            )
            ExposedDropdownMenu(
                expanded = modelExpanded,
                onDismissRequest = { modelExpanded = false }
            ) {
                models.forEach { model ->
                    DropdownMenuItem(
                        text = { Text(model) },
                        onClick = {
                            val current = selection
                            if (current is ProviderSelection.BuiltIn) {
                                onSelectionChange(current.copy(model = model))
                            }
                            modelExpanded = false
                        }
                    )
                }
            }
        }
    }
}

private fun defaultModelFor(provider: Provider): String = when (provider) {
    Provider.OPENAI -> "gpt-4o-mini"
    Provider.ANTHROPIC -> "claude-3-5-sonnet-20241022"
    Provider.GOOGLE -> "gemini-1.5-flash"
    Provider.DEEPSEEK -> "deepseek-chat"
}

private fun modelsFor(provider: Provider): List<String> = when (provider) {
    Provider.OPENAI -> listOf("gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo")
    Provider.ANTHROPIC -> listOf("claude-3-5-sonnet-20241022", "claude-3-haiku-20240307")
    Provider.GOOGLE -> listOf("gemini-1.5-flash", "gemini-1.5-pro")
    Provider.DEEPSEEK -> listOf("deepseek-chat", "deepseek-reasoner")
}