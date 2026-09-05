package com.naufal.chatbot.data.local

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface CustomProviderDao {

    @Query("SELECT * FROM custom_providers ORDER BY createdAt ASC")
    fun getAll(): Flow<List<CustomProviderEntity>>

    @Query("SELECT * FROM custom_providers WHERE id = :id")
    suspend fun getById(id: String): CustomProviderEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(provider: CustomProviderEntity)

    @Delete
    suspend fun delete(provider: CustomProviderEntity)
}