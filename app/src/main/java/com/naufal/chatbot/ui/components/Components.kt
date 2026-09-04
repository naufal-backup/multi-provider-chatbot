package com.naufal.chatbot.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.naufal.chatbot.Provider
import com.naufal.chatbot.model.ChatMessage

@Composable
fun MessageBubble(message: ChatMessage) {
    val isUser = message.role == "user"
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(0.8f)
                .background(
                    color = if (isUser)
                        MaterialTheme.colorScheme.primaryContainer
                    else
                        MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(16.dp)
                )
                .padding(12.dp)
        ) {
            Text(
                text = message.content,
                color = if (isUser)
                    MaterialTheme.colorScheme.onPrimaryContainer
                else
                    MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProviderModelSelector(
    selectedProvider: Provider,
    selectedModel: String,
    onProviderChange: (Provider) -> Unit,
    onModelChange: (String) -> Unit
) {
    val models = remember(selectedProvider) {
        when (selectedProvider) {
            Provider.OPENAI -> listOf("gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo")
            Provider.ANTHROPIC -> listOf("claude-3-5-sonnet-20241022", "claude-3-haiku-20240307")
            Provider.GOOGLE -> listOf("gemini-1.5-flash", "gemini-1.5-pro")
            Provider.DEEPSEEK -> listOf("deepseek-chat", "deepseek-reasoner")
        }
    }

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
                value = selectedProvider.displayName,
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
                            onProviderChange(provider)
                            providerExpanded = false
                        }
                    )
                }
            }
        }

        var modelExpanded by remember { mutableStateOf(false) }

        ExposedDropdownMenuBox(
            expanded = modelExpanded,
            onExpandedChange = { modelExpanded = it },
            modifier = Modifier.weight(1f)
        ) {
            OutlinedTextField(
                value = selectedModel,
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
                            onModelChange(model)
                            modelExpanded = false
                        }
                    )
                }
            }
        }
    }
}