package com.naufal.chatbot.ui

import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
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
import kotlinx.coroutines.launch

private const val WORKER_URL = "https://your-worker.your-subdomain.workers.dev/chat"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen() {
    val context = LocalContext.current
    val app = context.applicationContext as ChatbotApplication

    val repository = ChatRepository(
        conversationDao = app.database.conversationDao(),
        messageDao = app.database.messageDao(),
        secureKeyStore = app.secureKeyStore,
        apiService = ChatApiService(WORKER_URL)
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
                    onNewChat = { navigate("chat") },
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
                // Load existing conversation; for MVP a simple placeholder.
                // The ChatScreen will need to be enhanced to load by id.
                ChatScreen(
                    repository = repository,
                    onNewChat = { navigate("chat") },
                    onOpenSettings = { navigate("settings") }
                )
            }
            composable("settings") {
                SettingsScreen(
                    secureKeyStore = app.secureKeyStore,
                    onBack = { navController.popBackStack() }
                )
            }
        }
    }
}