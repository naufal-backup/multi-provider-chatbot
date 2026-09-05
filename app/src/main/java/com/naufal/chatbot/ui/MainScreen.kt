package com.naufal.chatbot.ui

import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.naufal.chatbot.ChatbotApplication
import com.naufal.chatbot.data.remote.ChatApiService
import com.naufal.chatbot.data.repository.ChatRepository
import com.naufal.chatbot.model.Conversation
import com.naufal.chatbot.ui.chat.ChatScreen
import com.naufal.chatbot.ui.history.HistoryScreen
import com.naufal.chatbot.ui.settings.SettingsScreen
import com.naufal.chatbot.ui.theme.AppTheme
import com.naufal.chatbot.ui.theme.ThemeStore
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen() {
    val context = LocalContext.current
    val app = context.applicationContext as ChatbotApplication

    var darkMode by remember { mutableStateOf(ThemeStore.isDark(context)) }

    AppTheme(darkTheme = darkMode) {
        MainContent(
            app = app,
            context = context,
            onToggleTheme = {
                darkMode = !darkMode
                ThemeStore.setDark(context, darkMode)
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainContent(
    app: ChatbotApplication,
    context: android.content.Context,
    onToggleTheme: () -> Unit
) {
    val repository = ChatRepository(
        conversationDao = app.database.conversationDao(),
        messageDao = app.database.messageDao(),
        customProviderDao = app.database.customProviderDao(),
        secureKeyStore = app.secureKeyStore,
        apiService = ChatApiService()
    )

    val navController = rememberNavController()
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()

    fun navigate(route: String) {
        scope.launch { drawerState.close() }
        navController.navigate(route)
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet {
                TextButton(onClick = { navigate("chat"); }) {
                    Text("Chat Baru")
                }
                TextButton(onClick = { navigate("history") }) {
                    Text("Riwayat")
                }
                TextButton(onClick = { navigate("settings") }) {
                    Text("Settings")
                }
            }
        }
    ) {
        NavHost(navController = navController, startDestination = "chat") {
            composable("chat") {
                ChatScreen(
                    repository = repository,
                    onNewChat = { navController.navigate("chat") },
                    onOpenHistory = { navigate("history") },
                    onOpenSettings = { navigate("settings") }
                )
            }
            composable("history") {
                HistoryScreen(
                    repository = repository,
                    onOpenConversation = { conversation: Conversation ->
                        navController.navigate("chat/${conversation.id}")
                    },
                    onBack = { navController.popBackStack() },
                    onNewChat = { navigate("chat") }
                )
            }
            composable("chat/{id}") { backStackEntry ->
                val id = backStackEntry.arguments?.getString("id")
                ChatScreen(
                    repository = repository,
                    onNewChat = { navController.navigate("chat") },
                    onOpenHistory = { navigate("history") },
                    onOpenSettings = { navigate("settings") },
                    conversationId = id
                )
            }
            composable("settings") {
                SettingsScreen(
                    secureKeyStore = app.secureKeyStore,
                    repository = repository,
                    darkMode = ThemeStore.isDark(context),
                    onToggleTheme = onToggleTheme,
                    onBack = { navController.popBackStack() }
                )
            }
        }
    }
}