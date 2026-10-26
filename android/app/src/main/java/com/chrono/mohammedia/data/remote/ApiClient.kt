package com.chrono.mohammedia.data.remote

import com.chrono.mohammedia.data.repository.RiderRepository
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object ApiClient {

    private var currentBaseUrl = "https://projectxeuapi.shipsy.io/"
    private var service: ChronoApiService? = null

    var activeAccessToken: String = RiderRepository.DEFAULT_ACCESS_TOKEN
    var activeUserId: String = RiderRepository.DEFAULT_USER_ID
    var activeOrganisationId: String = RiderRepository.DEFAULT_ORGANISATION_ID

    fun updateActiveCredentials(token: String, userId: String, orgId: String) {
        activeAccessToken = token
        activeUserId = userId
        if (orgId.isNotBlank()) activeOrganisationId = orgId
    }

    fun getService(baseUrl: String = currentBaseUrl): ChronoApiService {
        if (service == null || currentBaseUrl != baseUrl) {
            currentBaseUrl = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"

            val logging = HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BODY
            }

            val okHttpClient = OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .addInterceptor { chain ->
                    val original = chain.request()
                    val builder = original.newBuilder()

                    val isLogin = original.url.encodedPath.contains("login", ignoreCase = true)

                    // Default hardcoded headers matching ChronoExtension
                    if (original.header("organisation-id").isNullOrBlank()) {
                        builder.header("organisation-id", activeOrganisationId.ifBlank { RiderRepository.DEFAULT_ORGANISATION_ID })
                    }
                    if (original.header("application-type").isNullOrBlank()) {
                        builder.header("application-type", RiderRepository.DEFAULT_APPLICATION_TYPE)
                    }
                    if (!isLogin) {
                        val tokenToUse = activeAccessToken.ifBlank { RiderRepository.DEFAULT_ACCESS_TOKEN }
                        if (original.header("access-token").isNullOrBlank() && tokenToUse.isNotBlank()) {
                            builder.header("access-token", tokenToUse)
                        }
                        val userToUse = activeUserId.ifBlank { RiderRepository.DEFAULT_USER_ID }
                        if (original.header("user-id").isNullOrBlank() && userToUse.isNotBlank()) {
                            builder.header("user-id", userToUse)
                        }
                    }
                    if (original.header("Accept").isNullOrBlank()) {
                        builder.header("Accept", "application/json")
                    }
                    chain.proceed(builder.build())
                }
                .addInterceptor(logging)
                .build()

            val retrofit = Retrofit.Builder()
                .baseUrl(currentBaseUrl)
                .client(okHttpClient)
                .addConverterFactory(GsonConverterFactory.create())
                .build()

            service = retrofit.create(ChronoApiService::class.java)
        }
        return service!!
    }
}
