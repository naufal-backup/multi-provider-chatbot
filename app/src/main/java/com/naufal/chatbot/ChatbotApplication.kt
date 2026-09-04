package com.naufal.chatbot

import android.app.Application

class ChatbotApplication : Application() {
    val database by lazy { data.local.AppDatabase.getInstance(this) }
    val secureKeyStore by lazy { data.local.SecureKeyStore(this) }
}