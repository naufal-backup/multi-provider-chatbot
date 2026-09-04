package com.naufal.chatbot

import android.app.Application
import com.naufal.chatbot.data.local.AppDatabase
import com.naufal.chatbot.data.local.SecureKeyStore

class ChatbotApplication : Application() {
    val database: AppDatabase by lazy { AppDatabase.getInstance(this) }
    val secureKeyStore: SecureKeyStore by lazy { SecureKeyStore(this) }
}