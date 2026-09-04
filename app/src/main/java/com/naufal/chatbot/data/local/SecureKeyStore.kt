package com.naufal.chatbot.data.local

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class SecureKeyStore(context: Context) {

    private val prefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            context,
            "secure_api_keys",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    fun saveKey(provider: String, apiKey: String) {
        prefs.edit().putString("key_$provider", apiKey).apply()
    }

    fun getKey(provider: String): String? {
        return prefs.getString("key_$provider", null)
    }

    fun removeKey(provider: String) {
        prefs.edit().remove("key_$provider").apply()
    }

    fun hasKey(provider: String): Boolean {
        return prefs.contains("key_$provider")
    }
}