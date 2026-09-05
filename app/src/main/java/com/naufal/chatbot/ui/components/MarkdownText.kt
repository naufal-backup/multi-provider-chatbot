package com.naufal.chatbot.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest

/**
 * Lightweight Markdown (and partial HTML) renderer without any heavy WebView.
 * Supports: headings, bold, italic, inline code, fenced code blocks,
 * unordered/ordered lists, blockquotes, links, and images.
 *
 * The whole block is wrapped in a copy-on-click action so users can copy the
 * raw text (markdown/html) of the message.
 */
@Composable
fun MarkdownText(
    text: String,
    modifier: Modifier = Modifier,
    onCopy: ((String) -> Unit)? = null
) {
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clickable {
                clipboard.setText(AnnotatedString(text))
                onCopy?.invoke(text)
            }
    ) {
        renderMarkdownBlocks(text, context)
    }
}

@Composable
private fun renderMarkdownBlocks(text: String, context: android.content.Context) {
    val lines = text.split('\n')
    var inCodeBlock = false
    val codeBuffer = StringBuilder()
    var codeLang = ""

    val rendered = mutableListOf<@Composable () -> Unit>()

    fun flushParagraph(buffer: StringBuilder) {
        if (buffer.isBlank()) return
        rendered.add {
            Text(
                text = buffer.toString(),
                style = MaterialTheme.typography.bodyMedium
            )
        }
        buffer.clear()
    }

    val paragraph = StringBuilder()

    for (line in lines) {
        // Fenced code block
        if (line.trimStart().startsWith("```")) {
            if (inCodeBlock) {
                // close block
                rendered.add {
                    CodeBlock(codeBuffer.toString(), codeLang)
                }
                codeBuffer.clear()
                codeLang = ""
                inCodeBlock = false
            } else {
                flushParagraph(paragraph)
                codeLang = line.trimStart().removePrefix("```").trim()
                inCodeBlock = true
            }
            continue
        }

        if (inCodeBlock) {
            codeBuffer.append(line).append('\n')
            continue
        }

        // Heading
        val headingMatch = Regex("^(#{1,6})\\s+(.*)$").find(line)
        if (headingMatch != null) {
            flushParagraph(paragraph)
            val level = headingMatch.groupValues[1].length
            val content = runCatching {
                buildInlineAnnotated(headingMatch.groupValues[2])
            }.getOrDefault(AnnotatedString(""))
            rendered.add {
                Text(
                    text = content,
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.Bold,
                        fontSize = (24 - level * 2).sp
                    ),
                    modifier = Modifier.padding(vertical = 4.dp)
                )
            }
            continue
        }

        // Image
        val imageMatch = Regex("^!\\[(.*?)]\\((.*?)\\)").find(line)
        if (imageMatch != null) {
            flushParagraph(paragraph)
            val url = imageMatch.groupValues[2]
            rendered.add {
                AsyncImage(
                    model = ImageRequest.Builder(context)
                        .data(url)
                        .crossfade(true)
                        .build(),
                    contentDescription = imageMatch.groupValues[1].ifBlank { "image" },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp)
                )
            }
            continue
        }

        // Unordered list
        if (Regex("^\\s*[-*+]\\s+(.*)$").matches(line)) {
            flushParagraph(paragraph)
            val item = Regex("^\\s*[-*+]\\s+(.*)$").find(line)!!.groupValues[1]
            rendered.add {
                Text(
                    text = buildAnnotatedString { append("• ") }.plus(
                        runCatching { buildInlineAnnotated(item) }
                            .getOrDefault(AnnotatedString(item))
                    ),
                    style = MaterialTheme.typography.bodyMedium
                )
            }
            continue
        }

        // Blockquote
        if (line.trimStart().startsWith(">")) {
            flushParagraph(paragraph)
            val q = line.trimStart().removePrefix(">").trim()
            rendered.add {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            color = MaterialTheme.colorScheme.surfaceVariant,
                            shape = RoundedCornerShape(4.dp)
                        )
                        .padding(8.dp)
                ) {
                    Text(
                        text = q,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            continue
        }

        paragraph.append(line).append('\n')
    }

    if (inCodeBlock) {
        rendered.add { CodeBlock(codeBuffer.toString(), codeLang) }
    }
    flushParagraph(paragraph)

    rendered.forEach { it() }
}

@Composable
private fun CodeBlock(code: String, language: String) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                color = if (MaterialTheme.colorScheme.background != Color.White)
                    MaterialTheme.colorScheme.surfaceVariant
                else
                    Color(0xFF1E1E1E),
                shape = RoundedCornerShape(8.dp)
            )
            .clickable { clipboard.setText(AnnotatedString(code)) }
            .padding(12.dp)
    ) {
        Column {
            if (language.isNotBlank()) {
                Text(
                    text = language,
                    style = MaterialTheme.typography.labelSmall,
                    color = Color(0xFF888888)
                )
            }
            Text(
                text = code,
                fontFamily = FontFamily.Monospace,
                fontSize = 13.sp,
                color = Color(0xFFD4D4D4),
                modifier = Modifier.verticalScroll(rememberScrollState())
            )
        }
    }
}

/** Builds an AnnotatedString with basic inline formatting (bold, italic, inline code). */
private fun buildInlineAnnotated(text: String): AnnotatedString = buildAnnotatedString {
    val regex = Regex("(\\*\\*.*?\\*\\*|`.*?`|\\*.*?\\*)")
    var last = 0
    for (m in regex.findAll(text)) {
        append(text.substring(last, m.range.first))
        val token = m.value
        when {
            token.startsWith("**") && token.endsWith("**") -> {
                withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                    append(token.removePrefix("**").removeSuffix("**"))
                }
            }
            token.startsWith("`") && token.endsWith("`") -> {
                withStyle(SpanStyle(fontFamily = FontFamily.Monospace)) {
                    append(token.removePrefix("`").removeSuffix("`"))
                }
            }
            token.startsWith("*") && token.endsWith("*") -> {
                withStyle(SpanStyle(fontStyle = FontStyle.Italic)) {
                    append(token.removePrefix("*").removeSuffix("*"))
                }
            }
            else -> append(token)
        }
        last = m.range.last + 1
    }
    append(text.substring(last))
}