package com.chrono.mohammedia.data.repository

import android.content.Context
import com.chrono.mohammedia.data.model.*
import com.chrono.mohammedia.data.remote.ApiClient
import com.chrono.mohammedia.util.ShipsyCrypto
import com.google.gson.Gson
import com.google.gson.JsonElement
import com.google.gson.JsonParser
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import java.io.File
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.ConcurrentHashMap

class RiderRepository {

    companion object {
        const val DEFAULT_HUB_ID = "2477050730750414061"
        const val DEFAULT_ORGANISATION_ID = "chronodiali"
        const val DEFAULT_APPLICATION_TYPE = "ops"
        const val DEFAULT_BASE_URL = "https://projectxeuapi.shipsy.io/"
        const val DEFAULT_ACCESS_TOKEN = ""
        const val DEFAULT_USER_ID = ""
        const val DEFAULT_USERNAME = ""
        const val DEFAULT_ENCRYPTED_PWD = ""

        private const val PREFS_NAME = "chrono_prefs"
        private const val KEY_LIVE_API = "key_live_api"
        private const val KEY_HUB_ID = "key_hub_id"
        private const val KEY_ORG_ID = "key_org_id"
        private const val KEY_USER_ID = "key_user_id"
        private const val KEY_AUTH_TOKEN = "key_auth_token"
        private const val KEY_BASE_URL = "key_base_url"
        private const val KEY_USERNAME = "key_username"
        private const val KEY_PWD = "key_pwd"
        private const val KEY_ACTIVE_DATE_LABEL = "key_active_date_label"
        private const val KEY_LOCALLY_SETTLED_RIDERS = "key_locally_settled_riders"

        @Volatile
        private var INSTANCE: RiderRepository? = null

        fun getInstance(context: Context? = null): RiderRepository {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: RiderRepository().also { repo ->
                    if (context != null) {
                        repo.loadPreferences(context.applicationContext)
                    }
                    INSTANCE = repo
                }
            }
        }
    }

    private var appContext: Context? = null
    private val cachedRiders = Collections.synchronizedList(mutableListOf<RiderItem>())
    private val locallySettledRiders = ConcurrentHashMap.newKeySet<String>()
    private val consignmentDetailsCache = ConcurrentHashMap<String, ConsignmentFullDetails>()
    private val tripParcelsCache = ConcurrentHashMap<String, List<ParcelDetail>>()
    var activeDateLabel: String = "Aujourd'hui"
    var isLiveApiEnabled: Boolean = true
    var shipsyHubId: String = DEFAULT_HUB_ID
    var shipsyOrganisationId: String = DEFAULT_ORGANISATION_ID
    var shipsyUserId: String = DEFAULT_USER_ID
    var applicationType: String = DEFAULT_APPLICATION_TYPE
    var apiBaseUrl: String = DEFAULT_BASE_URL
    var apiAuthToken: String = DEFAULT_ACCESS_TOKEN
    var shipsyUsername: String = DEFAULT_USERNAME
    var shipsyEncryptedPwd: String = DEFAULT_ENCRYPTED_PWD

    private val apiService get() = ApiClient.getService(apiBaseUrl)
    private val apiMutex = Mutex()

    fun loadPreferences(context: Context) {
        appContext = context.applicationContext
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        isLiveApiEnabled = prefs.getBoolean(KEY_LIVE_API, true)
        shipsyHubId = prefs.getString(KEY_HUB_ID, DEFAULT_HUB_ID)?.ifBlank { DEFAULT_HUB_ID } ?: DEFAULT_HUB_ID
        shipsyOrganisationId = prefs.getString(KEY_ORG_ID, DEFAULT_ORGANISATION_ID)?.ifBlank { DEFAULT_ORGANISATION_ID } ?: DEFAULT_ORGANISATION_ID
        shipsyUserId = prefs.getString(KEY_USER_ID, "") ?: ""
        apiBaseUrl = prefs.getString(KEY_BASE_URL, DEFAULT_BASE_URL)?.ifBlank { DEFAULT_BASE_URL } ?: DEFAULT_BASE_URL
        apiAuthToken = prefs.getString(KEY_AUTH_TOKEN, "") ?: ""
        shipsyUsername = prefs.getString(KEY_USERNAME, "") ?: ""
        shipsyEncryptedPwd = prefs.getString(KEY_PWD, "") ?: ""

        val savedSettled = prefs.getStringSet(KEY_LOCALLY_SETTLED_RIDERS, emptySet()) ?: emptySet()
        locallySettledRiders.clear()
        locallySettledRiders.addAll(savedSettled)

        ApiClient.updateActiveCredentials(apiAuthToken, shipsyUserId, shipsyOrganisationId)
        loadCacheFromDisk(context)
    }

    fun savePreferences(context: Context) {
        appContext = context.applicationContext
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putBoolean(KEY_LIVE_API, isLiveApiEnabled)
            .putString(KEY_HUB_ID, shipsyHubId)
            .putString(KEY_ORG_ID, shipsyOrganisationId)
            .putString(KEY_USER_ID, shipsyUserId)
            .putString(KEY_BASE_URL, apiBaseUrl)
            .putString(KEY_AUTH_TOKEN, apiAuthToken)
            .putString(KEY_USERNAME, shipsyUsername)
            .putString(KEY_PWD, shipsyEncryptedPwd)
            .apply()

        ApiClient.updateActiveCredentials(apiAuthToken, shipsyUserId, shipsyOrganisationId)
    }

    fun hasCachedData(): Boolean {
        return synchronized(cachedRiders) { cachedRiders.isNotEmpty() }
    }

    private fun saveCacheToDisk() {
        val ctx = appContext ?: return
        try {
            val listCopy = synchronized(cachedRiders) { cachedRiders.toList() }
            val json = Gson().toJson(listCopy)
            val file = File(ctx.filesDir, "chrono_riders_cache.json")
            file.writeText(json)
            val prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putString(KEY_ACTIVE_DATE_LABEL, activeDateLabel).apply()
        } catch (e: Exception) {
            android.util.Log.e("ChronoApp", "Failed to save riders cache: ${e.message}")
        }
    }

    private fun loadCacheFromDisk(context: Context) {
        try {
            val file = File(context.filesDir, "chrono_riders_cache.json")
            if (file.exists() && file.length() > 0) {
                val json = file.readText()
                val type = object : TypeToken<List<RiderItem>>() {}.type
                val list: List<RiderItem>? = Gson().fromJson(json, type)
                if (!list.isNullOrEmpty()) {
                    val normalizedList = list.map { r ->
                        if (r.tripStatus == TripStatus.COMPLETED && r.amountToPay <= 0.01) {
                            r.copy(isReconciled = true)
                        } else {
                            r
                        }
                    }
                    synchronized(cachedRiders) {
                        cachedRiders.clear()
                        cachedRiders.addAll(normalizedList)
                    }
                    for (rider in normalizedList) {
                        for (p in rider.parcels) {
                            if (p.referenceNumber.isNotBlank() && !consignmentDetailsCache.containsKey(p.referenceNumber)) {
                                consignmentDetailsCache[p.referenceNumber] = ConsignmentFullDetails(
                                    referenceNumber = p.referenceNumber,
                                    destinationName = p.recipientName,
                                    destinationPhone = p.recipientPhone,
                                    destinationAddress = p.address,
                                    codAmount = p.amount,
                                    failureReason = p.failureReason,
                                    status = p.status.name,
                                    riderName = p.riderName ?: rider.name,
                                    tripRef = p.tripReference ?: rider.code,
                                    customerName = p.recipientName,
                                    hubName = "Mohammedia Hub",
                                    lastEventDate = p.createdAt
                                )
                            }
                        }
                    }
                }
            }
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            activeDateLabel = prefs.getString(KEY_ACTIVE_DATE_LABEL, "Aujourd'hui") ?: "Aujourd'hui"
        } catch (e: Exception) {
            android.util.Log.e("ChronoApp", "Failed to load riders cache: ${e.message}")
        }
    }

    fun hasValidSavedSession(): Boolean {
        return apiAuthToken.isNotBlank()
    }

    fun logout(context: Context) {
        apiAuthToken = ""
        shipsyUsername = ""
        shipsyUserId = ""
        shipsyEncryptedPwd = ""
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(KEY_AUTH_TOKEN, "")
            .putString(KEY_USERNAME, "")
            .putString(KEY_USER_ID, "")
            .putString(KEY_PWD, "")
            .apply()
        ApiClient.updateActiveCredentials("", "", shipsyOrganisationId)
        synchronized(cachedRiders) {
            cachedRiders.clear()
        }
        consignmentDetailsCache.clear()
        tripParcelsCache.clear()
        try {
            val file = File(context.filesDir, "chrono_riders_cache.json")
            if (file.exists()) file.delete()
        } catch (_: Exception) {}
    }

    /**
     * Primary Login method accepting plaintext password (e.g. "Pass123-**").
     * Automatically encrypts via RSA-OAEP SHA-256 matching Shipsy CRM client cryptography.
     */
    suspend fun loginWithPlaintext(
        username: String,
        plaintextPassword: String,
        orgId: String = DEFAULT_ORGANISATION_ID,
        hubId: String = DEFAULT_HUB_ID,
        rememberMe: Boolean = true,
        context: Context
    ): Result<ShipsyLoginData> = withContext(Dispatchers.IO) {
        try {
            val user = username.trim()
            val org = orgId.ifBlank { DEFAULT_ORGANISATION_ID }.trim()
            val hub = hubId.ifBlank { DEFAULT_HUB_ID }.trim()

            // 1. Encrypt plaintext password using Shipsy RSA-OAEP SHA-256
            val encryptedPwd = ShipsyCrypto.encryptPassword(plaintextPassword)

            // 2. Call Shipsy login API
            val loginHeaders = mapOf(
                "Content-Type" to "application/json",
                "Accept" to "application/json",
                "organisation-id" to org
            )
            val req = ShipsyLoginRequest(username = user, pwd = encryptedPwd)
            val res = apiService.login(loginHeaders, req)

            if (res.isSuccessful && res.body() != null) {
                val body = res.body()!!
                val token = body.data?.accessToken?.id
                if (!token.isNullOrBlank()) {
                    apiAuthToken = token
                    shipsyUsername = if (rememberMe) user else ""
                    shipsyEncryptedPwd = if (rememberMe) encryptedPwd else ""
                    shipsyOrganisationId = org
                    shipsyHubId = hub
                    body.data.employee?.id?.let { if (it.isNotBlank()) shipsyUserId = it }

                    ApiClient.updateActiveCredentials(
                        token = apiAuthToken,
                        userId = shipsyUserId,
                        orgId = shipsyOrganisationId
                    )

                    savePreferences(context)
                    cachedRiders.clear()

                    Result.success(body.data)
                } else {
                    Result.failure(Exception("Token d'accès absent dans la réponse Shipsy"))
                }
            } else {
                val err = res.errorBody()?.string() ?: ""
                Result.failure(Exception("Identifiants incorrects (${res.code()}): $err"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun performAutoLogin(context: Context? = null): Result<String> = withContext(Dispatchers.IO) {
        try {
            val user = shipsyUsername.ifBlank { DEFAULT_USERNAME }.trim()
            val pwd = shipsyEncryptedPwd.trim()
            val org = shipsyOrganisationId.ifBlank { DEFAULT_ORGANISATION_ID }.trim()

            if (pwd.isBlank()) {
                return@withContext Result.failure(Exception("Mot de passe non configuré"))
            }

            val loginHeaders = mapOf(
                "Content-Type" to "application/json",
                "Accept" to "application/json",
                "organisation-id" to org
            )
            val req = ShipsyLoginRequest(username = user, pwd = pwd)
            val res = apiService.login(loginHeaders, req)

            if (res.isSuccessful && res.body() != null) {
                val body = res.body()!!
                val token = body.data?.accessToken?.id
                if (!token.isNullOrBlank()) {
                    apiAuthToken = token
                    body.data.employee?.id?.let { if (it.isNotBlank()) shipsyUserId = it }
                    body.data.organisationId?.let { if (it.isNotBlank()) shipsyOrganisationId = it }

                    ApiClient.updateActiveCredentials(
                        token = apiAuthToken,
                        userId = shipsyUserId,
                        orgId = shipsyOrganisationId
                    )

                    if (context != null) {
                        savePreferences(context)
                    }

                    Result.success(token)
                } else {
                    Result.failure(Exception("Token absent dans la réponse Shipsy"))
                }
            } else {
                val err = res.errorBody()?.string() ?: ""
                Result.failure(Exception("Échec de connexion (${res.code()}): $err"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun getCachedRidersSync(
        query: String = "",
        filter: FilterType = FilterType.ALL
    ): List<RiderItem> {
        var list = synchronized(cachedRiders) { cachedRiders.toList() }

        // 1. Apply category filter
        list = when (filter) {
            FilterType.ALL -> list
            FilterType.FINISHED_TRIPS -> list.filter { it.isTripFinished }
            FilterType.IN_TRANSIT -> list.filter { it.tripStatus == TripStatus.IN_TRANSIT }
            FilterType.HAS_DUE -> list.filter { it.amountToPay > 0 }
            FilterType.HAS_UNDELIVERED -> list.filter { it.undeliveredCount > 0 }
        }

        // 2. Apply search text query (supports rider name, trip code, and parcel tracking numbers)
        if (query.isNotBlank()) {
            val q = query.trim().lowercase(Locale.ROOT)
            list = list.filter { rider ->
                rider.name.lowercase(Locale.ROOT).contains(q) ||
                rider.code.lowercase(Locale.ROOT).contains(q) ||
                rider.parcels.any { it.referenceNumber.lowercase(Locale.ROOT).contains(q) }
            }
        }

        // Sort: completed first, then by amount to pay descending
        return list.sortedWith(
            compareByDescending<RiderItem> { it.isTripFinished }
                .thenByDescending { it.amountToPay }
        )
    }

    fun getCachedHubSummarySync(): HubSummary {
        val list = synchronized(cachedRiders) { cachedRiders.toList() }
        val totalDue = list.sumOf { it.amountToPay }
        val completed = list.count { it.isTripFinished }
        val totalTrips = list.size
        val totalDelivered = list.sumOf { it.deliveredCount }
        val totalUndelivered = list.sumOf { it.undeliveredCount }
        val totalParcels = list.sumOf { it.totalParcels }

        return HubSummary(
            totalDueAmount = totalDue,
            completedTripsCount = completed,
            totalTripsCount = totalTrips,
            totalDeliveredParcels = totalDelivered,
            totalUndeliveredParcels = totalUndelivered,
            totalParcels = totalParcels,
            activeDateLabel = activeDateLabel
        )
    }

    suspend fun getRiders(
        query: String = "",
        filter: FilterType = FilterType.ALL
    ): List<RiderItem> = withContext(Dispatchers.IO) {
        if (!hasCachedData()) {
            loadRidersData()
        }
        getCachedRidersSync(query, filter)
    }

    suspend fun getHubSummary(): HubSummary = withContext(Dispatchers.IO) {
        getCachedHubSummarySync()
    }

    suspend fun refreshData(onProgress: (suspend () -> Unit)? = null): Result<List<RiderItem>> = withContext(Dispatchers.IO) {
        apiMutex.withLock {
            try {
                if (isLiveApiEnabled) {
                    fetchRealDataFromApi(onProgress = onProgress)
                }
                Result.success(synchronized(cachedRiders) { cachedRiders.toList() })
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
    }

    fun getRiderById(riderId: String): RiderItem? {
        return synchronized(cachedRiders) {
            cachedRiders.find { it.id == riderId || it.code == riderId || it.workerCode == riderId }
        }
    }

    suspend fun settleRider(riderId: String, cashierName: String? = null): Boolean = withContext(Dispatchers.IO) {
        var found = false
        locallySettledRiders.add(riderId)
        synchronized(cachedRiders) {
            for (i in 0 until cachedRiders.size) {
                val r = cachedRiders[i]
                if (r.id == riderId || r.code == riderId || r.workerCode == riderId) {
                    locallySettledRiders.add(r.id)
                    locallySettledRiders.add(r.code)
                    r.workerCode?.let { locallySettledRiders.add(it) }
                    cachedRiders[i] = r.copy(
                        isReconciled = true,
                        reconciledBy = cashierName ?: "Réglé"
                    )
                    found = true
                    break
                }
            }
        }
        appContext?.let { ctx ->
            val prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putStringSet(KEY_LOCALLY_SETTLED_RIDERS, locallySettledRiders.toSet()).apply()
        }
        if (found) {
            saveCacheToDisk()
        }
        found
    }

    suspend fun getParcelsForTrip(tripRef: String): List<ParcelDetail> = withContext(Dispatchers.IO) {
        val cached = tripParcelsCache[tripRef]
        if (!cached.isNullOrEmpty()) return@withContext cached

        val token = apiAuthToken.ifBlank { DEFAULT_ACCESS_TOKEN }.trim()
        val userId = shipsyUserId.ifBlank { DEFAULT_USER_ID }.trim()
        val orgId = shipsyOrganisationId.ifBlank { DEFAULT_ORGANISATION_ID }.trim()

        val headers = mapOf(
            "Accept" to "application/json",
            "Content-Type" to "application/json",
            "organisation-id" to orgId,
            "application-type" to applicationType.ifBlank { DEFAULT_APPLICATION_TYPE },
            "access-token" to token,
            "user-id" to userId
        )
        val parcels = fetchParcelsForTrip(headers, tripRef)
        if (parcels.isNotEmpty()) {
            tripParcelsCache[tripRef] = parcels
        }
        parcels
    }

    private suspend fun loadRidersData() {
        if (!isLiveApiEnabled) return
        apiMutex.withLock {
            if (hasCachedData()) return@withLock
            fetchRealDataFromApi()
        }
    }

    private fun getCanonicalRiderName(rawName: String?): String {
        if (rawName.isNullOrBlank()) return ""
        val lower = rawName.trim().lowercase(Locale.ROOT).replace(Regex("\\s+"), " ")
        return when {
            lower.contains("walid aichi") || lower == "omar" -> "walid aichi"
            lower.contains("abd assamad krim") || lower == "sami" -> "abd assamad krim"
            lower.contains("badr hachimi") || lower.contains("bader hachimi") -> "bader hachimi"
            lower.contains("anas hachimi") -> "anas hachimi"
            lower.contains("redouane nait hammou") -> "redouane nait hammou"
            lower.contains("ahmed hazli") -> "ahmed hazli"
            lower.contains("abdelhadi mouhoub") -> "abdelhadi mouhoub"
            lower.contains("mouhcine") || lower.contains("yourja") -> "mouhcine yourja"
            lower.contains("bahadi") || lower.contains("abderrahmane") || lower.contains("abderrahman") -> "abderrahmane bahadi"
            else -> lower
        }
    }

    private fun com.google.gson.JsonObject.getStringOrNull(key: String): String? {
        val el = get(key) ?: return null
        if (el.isJsonNull) return null
        return runCatching { el.asString }.getOrNull()?.takeIf { it.isNotBlank() }
    }

    private fun com.google.gson.JsonObject.getDoubleOrZero(key: String): Double {
        val el = get(key) ?: return 0.0
        if (el.isJsonNull) return 0.0
        return runCatching { el.asDouble }.getOrElse {
            runCatching { el.asString.toDoubleOrNull() ?: 0.0 }.getOrDefault(0.0)
        }
    }

    private fun com.google.gson.JsonObject.getDoubleOrNull(key: String): Double? {
        val el = get(key) ?: return null
        if (el.isJsonNull) return null
        return runCatching { el.asDouble }.getOrNull()
            ?: runCatching { el.asString.toDoubleOrNull() }.getOrNull()
    }

    private fun com.google.gson.JsonObject.getIntOrNull(key: String): Int? {
        val el = get(key) ?: return null
        if (el.isJsonNull) return null
        return runCatching { el.asInt }.getOrNull()
            ?: runCatching { el.asString.toIntOrNull() }.getOrNull()
    }

    private fun com.google.gson.JsonObject.getLongOrNull(key: String): Long? {
        val el = get(key) ?: return null
        if (el.isJsonNull) return null
        return runCatching { el.asLong }.getOrNull()
            ?: runCatching { el.asString.toLongOrNull() }.getOrNull()
    }

    private suspend fun fetchParcelsForTrip(
        headers: Map<String, String>,
        tripRef: String
    ): List<ParcelDetail> {
        try {
            var res = apiService.getTripDetails(headers, searchBy = "organisation_reference_number", searchKey = tripRef)
            if (!res.isSuccessful || res.body()?.has("data") != true) {
                res = apiService.getTripDetails(headers, searchBy = "trip_reference_number", searchKey = tripRef)
            }
            val body = if (res.isSuccessful) res.body() else null
            val rawData = body?.get("data")
            val dataObj = when {
                rawData == null || !rawData.isJsonObject -> null
                rawData.asJsonObject.has("consignmentDetails") -> rawData.asJsonObject
                rawData.asJsonObject.has("data") && rawData.asJsonObject.get("data").isJsonObject -> rawData.asJsonObject.getAsJsonObject("data")
                else -> rawData.asJsonObject
            }

            val list = mutableListOf<ParcelDetail>()

            val cnDetails = if (dataObj?.has("consignmentDetails") == true && dataObj.get("consignmentDetails").isJsonObject) {
                dataObj.getAsJsonObject("consignmentDetails")
            } else null
            val completeCns = if (cnDetails?.has("complete") == true && cnDetails.get("complete").isJsonArray) {
                cnDetails.getAsJsonArray("complete")
            } else null
            val incompleteCns = if (cnDetails?.has("incomplete") == true && cnDetails.get("incomplete").isJsonArray) {
                cnDetails.getAsJsonArray("incomplete")
            } else null

            completeCns?.forEach { elem ->
                if (elem.isJsonObject) {
                    val o = elem.asJsonObject
                    val ref = o.getStringOrNull("reference_number")
                        ?: o.getStringOrNull("consignment_reference_number")
                        ?: o.getStringOrNull("hu_number")
                        ?: o.getStringOrNull("id").orEmpty()
                    if (ref.isNotBlank()) {
                        val cached = consignmentDetailsCache[ref]
                        val customer = cached?.destinationName ?: o.getStringOrNull("customer_name") ?: o.getStringOrNull("customer")
                        val phone = cached?.destinationPhone
                            ?: o.getStringOrNull("destination_phone")
                            ?: o.getStringOrNull("customer_phone")
                            ?: o.getStringOrNull("phone_number")
                            ?: o.getStringOrNull("phone")
                            ?: o.getStringOrNull("contact_number")
                            ?: o.getStringOrNull("receiver_phone")
                        val address = cached?.destinationAddress
                            ?: o.getStringOrNull("receiver_address")
                            ?: o.getStringOrNull("customer_address_string")
                            ?: o.getStringOrNull("address")
                        val cod = o.getDoubleOrZero("cod_amount").takeIf { it > 0.0 }
                            ?: o.getDoubleOrZero("amount").takeIf { it > 0.0 }
                            ?: o.getDoubleOrZero("cod_value")

                        val inTripStatus = o.getStringOrNull("consignment_in_trip_status")
                        val taskStatus = o.getStringOrNull("task_status")
                        val st = o.getStringOrNull("consignment_status")
                            ?: o.getStringOrNull("status")
                            ?: ""
                        val isDelivered = inTripStatus.equals("Delivered", ignoreCase = true)
                            || taskStatus.equals("success", ignoreCase = true)
                            || st.equals("delivered", ignoreCase = true)
                            || st.equals("rto_delivered", ignoreCase = true)
                            || st.equals("success", ignoreCase = true)

                        val failureReason = o.getStringOrNull("delivery_failure_reason")
                            ?: o.getStringOrNull("task_failure_reason")
                            ?: o.getStringOrNull("event_reason")
                            ?: o.getStringOrNull("failure_reason")
                            ?: o.getStringOrNull("reason")
                            ?: o.getStringOrNull("ndr_reason_ondemand")

                        val attempts = o.getIntOrNull("attempt_count")
                            ?: o.getIntOrNull("delivery_attempt_count")
                            ?: o.getIntOrNull("total_delivery_attempts")
                            ?: o.getIntOrNull("task_attempt_count")
                            ?: if (isDelivered) 1 else 0

                        list.add(
                            ParcelDetail(
                                id = ref,
                                referenceNumber = ref,
                                amount = cod,
                                status = if (isDelivered) ParcelStatus.DELIVERED else ParcelStatus.UNDELIVERED,
                                failureReason = if (!isDelivered) failureReason?.takeIf { !it.equals("Non livré", ignoreCase = true) } else null,
                                recipientName = customer,
                                recipientPhone = phone,
                                address = address,
                                tripReference = tripRef,
                                attemptCount = attempts
                            )
                        )
                    }
                }
            }

            incompleteCns?.forEach { elem ->
                if (elem.isJsonObject) {
                    val o = elem.asJsonObject
                    val ref = o.getStringOrNull("reference_number")
                        ?: o.getStringOrNull("consignment_reference_number")
                        ?: o.getStringOrNull("hu_number")
                        ?: o.getStringOrNull("id").orEmpty()
                    if (ref.isNotBlank()) {
                        val cached = consignmentDetailsCache[ref]
                        val customer = cached?.destinationName ?: o.getStringOrNull("customer_name") ?: o.getStringOrNull("customer")
                        val phone = cached?.destinationPhone
                            ?: o.getStringOrNull("destination_phone")
                            ?: o.getStringOrNull("customer_phone")
                            ?: o.getStringOrNull("phone_number")
                            ?: o.getStringOrNull("phone")
                            ?: o.getStringOrNull("contact_number")
                            ?: o.getStringOrNull("receiver_phone")
                        val address = cached?.destinationAddress
                            ?: o.getStringOrNull("receiver_address")
                            ?: o.getStringOrNull("customer_address_string")
                            ?: o.getStringOrNull("address")
                        val failureReason = o.getStringOrNull("delivery_failure_reason")
                            ?: o.getStringOrNull("task_failure_reason")
                            ?: o.getStringOrNull("event_reason")
                            ?: o.getStringOrNull("failure_reason")
                            ?: o.getStringOrNull("reason")
                            ?: o.getStringOrNull("ndr_reason_ondemand")
                            ?: o.getStringOrNull("rescheduled_reason")
                        val cod = o.getDoubleOrZero("cod_amount").takeIf { it > 0.0 }
                            ?: o.getDoubleOrZero("amount").takeIf { it > 0.0 }
                            ?: o.getDoubleOrZero("cod_value")

                        val attempts = cached?.attemptCount
                            ?: o.getIntOrNull("attempt_count")
                            ?: o.getIntOrNull("delivery_attempt_count")
                            ?: o.getIntOrNull("total_delivery_attempts")
                            ?: o.getIntOrNull("task_attempt_count")
                            ?: if (!failureReason.isNullOrBlank()) 1 else 0

                        list.add(
                            ParcelDetail(
                                id = ref,
                                referenceNumber = ref,
                                amount = cod,
                                status = ParcelStatus.UNDELIVERED,
                                failureReason = failureReason,
                                recipientName = customer,
                                recipientPhone = phone,
                                address = address,
                                tripReference = tripRef,
                                attemptCount = attempts
                            )
                        )
                    }
                }
            }

            if (list.isNotEmpty()) return list

            // Fallback to taskDetails if consignmentDetails was empty
            val taskDetails = if (dataObj?.has("taskDetails") == true && dataObj.get("taskDetails").isJsonObject) {
                dataObj.getAsJsonObject("taskDetails")
            } else null
            val completeTasks = if (taskDetails?.has("complete") == true && taskDetails.get("complete").isJsonArray) {
                taskDetails.getAsJsonArray("complete")
            } else null
            val incompleteTasks = if (taskDetails?.has("incomplete") == true && taskDetails.get("incomplete").isJsonArray) {
                taskDetails.getAsJsonArray("incomplete")
            } else null

            completeTasks?.forEach { elem ->
                if (elem.isJsonObject) {
                    val o = elem.asJsonObject
                    val ref = o.getStringOrNull("reference_number")
                        ?: o.getStringOrNull("task_reference_number")
                        ?: o.getStringOrNull("task_id").orEmpty()
                    if (ref.isNotBlank()) {
                        val customer = o.getStringOrNull("customer_name") ?: o.getStringOrNull("customer")
                        val phone = o.getStringOrNull("customer_phone")
                            ?: o.getStringOrNull("phone_number")
                            ?: o.getStringOrNull("phone")
                            ?: o.getStringOrNull("contact_number")
                            ?: o.getStringOrNull("receiver_phone")
                        val address = o.getStringOrNull("address")
                        val cod = o.getDoubleOrZero("cod_amount").takeIf { it > 0.0 }
                            ?: o.getDoubleOrZero("amount").takeIf { it > 0.0 }
                            ?: o.getDoubleOrZero("cod_value")
                        val inTripStatus = o.getStringOrNull("consignment_in_trip_status")
                        val taskStatus = o.getStringOrNull("task_status")
                        val st = o.getStringOrNull("status").orEmpty()
                        val isDelivered = inTripStatus.equals("Delivered", ignoreCase = true)
                            || taskStatus.equals("success", ignoreCase = true)
                            || st.equals("delivered", ignoreCase = true)
                            || st.equals("rto_delivered", ignoreCase = true)
                            || st.equals("success", ignoreCase = true)
                        val failureReason = o.getStringOrNull("delivery_failure_reason")
                            ?: o.getStringOrNull("task_failure_reason")
                            ?: o.getStringOrNull("event_reason")
                            ?: o.getStringOrNull("failure_reason")
                            ?: o.getStringOrNull("reason")
                            ?: o.getStringOrNull("ndr_reason_ondemand")

                        val attempts = o.getIntOrNull("attempt_count")
                            ?: o.getIntOrNull("delivery_attempt_count")
                            ?: o.getIntOrNull("total_delivery_attempts")
                            ?: o.getIntOrNull("task_attempt_count")
                            ?: if (isDelivered) 1 else 0

                        list.add(
                            ParcelDetail(
                                id = ref,
                                referenceNumber = ref,
                                amount = cod,
                                status = if (isDelivered) ParcelStatus.DELIVERED else ParcelStatus.UNDELIVERED,
                                failureReason = if (!isDelivered) failureReason?.takeIf { !it.equals("Non livré", ignoreCase = true) } else null,
                                recipientName = customer,
                                recipientPhone = phone,
                                address = address,
                                tripReference = tripRef,
                                attemptCount = attempts
                            )
                        )
                    }
                }
            }

            incompleteTasks?.forEach { elem ->
                if (elem.isJsonObject) {
                    val o = elem.asJsonObject
                    val ref = o.getStringOrNull("reference_number")
                        ?: o.getStringOrNull("task_reference_number")
                        ?: o.getStringOrNull("task_id").orEmpty()
                    if (ref.isNotBlank()) {
                        val customer = o.getStringOrNull("customer_name") ?: o.getStringOrNull("customer")
                        val phone = o.getStringOrNull("customer_phone")
                            ?: o.getStringOrNull("phone_number")
                            ?: o.getStringOrNull("phone")
                            ?: o.getStringOrNull("contact_number")
                            ?: o.getStringOrNull("receiver_phone")
                        val address = o.getStringOrNull("address")
                        val reason = o.getStringOrNull("delivery_failure_reason")
                            ?: o.getStringOrNull("task_failure_reason")
                            ?: o.getStringOrNull("event_reason")
                            ?: o.getStringOrNull("failure_reason")
                            ?: o.getStringOrNull("reason")
                            ?: o.getStringOrNull("ndr_reason_ondemand")
                        val cod = o.getDoubleOrZero("cod_amount").takeIf { it > 0.0 }
                            ?: o.getDoubleOrZero("amount").takeIf { it > 0.0 }
                            ?: o.getDoubleOrZero("cod_value")

                        val attempts = o.getIntOrNull("attempt_count")
                            ?: o.getIntOrNull("delivery_attempt_count")
                            ?: o.getIntOrNull("total_delivery_attempts")
                            ?: o.getIntOrNull("task_attempt_count")
                            ?: if (!reason.isNullOrBlank()) 1 else 0

                        list.add(
                            ParcelDetail(
                                id = ref,
                                referenceNumber = ref,
                                amount = cod,
                                status = ParcelStatus.UNDELIVERED,
                                failureReason = reason,
                                recipientName = customer,
                                recipientPhone = phone,
                                address = address,
                                tripReference = tripRef,
                                attemptCount = attempts
                            )
                        )
                    }
                }
            }

            return list
        } catch (e: Exception) {
            android.util.Log.e("ChronoApp", "fetchParcelsForTrip failed for " + tripRef + ": " + e.message, e)
            return emptyList()
        }
    }

    fun getCachedConsignmentDetails(referenceNumber: String): ConsignmentFullDetails? =
        consignmentDetailsCache[referenceNumber.trim()]

    suspend fun fetchConsignmentFullDetails(
        referenceNumber: String,
        isRetryAfterLogin: Boolean = false
    ): Result<ConsignmentFullDetails> = withContext(Dispatchers.IO) {
        val ref = referenceNumber.trim()
        if (ref.isBlank()) return@withContext Result.failure(IllegalArgumentException("Reference number is empty"))

        consignmentDetailsCache[ref]?.let { return@withContext Result.success(it) }

        // If no token in memory, try auto-login first
        if (apiAuthToken.isBlank()) {
            val autoLoginRes = performAutoLogin(appContext)
            if (autoLoginRes.isFailure && !isRetryAfterLogin) {
                return@withContext Result.failure(
                    Exception("SESSION_EXPIRED: Session Shipsy non connectée ou expirée (401).")
                )
            }
        }

        try {
            val headers = mapOf(
                "access-token" to apiAuthToken,
                "user-id" to shipsyUserId.ifBlank { "2540768522926034221" },
                "organisation-id" to shipsyOrganisationId.ifBlank { DEFAULT_ORGANISATION_ID },
                "application-type" to applicationType.ifBlank { DEFAULT_APPLICATION_TYPE },
                "Accept" to "application/json"
            )

            val res = apiService.getConsignmentFetchOne(headers, ref, sendUnmaskedData = false)

            // If 401 Unauthorized, automatically re-authenticate and retry once seamlessly!
            if (res.code() == 401 && !isRetryAfterLogin) {
                val autoLoginRes = performAutoLogin(appContext)
                if (autoLoginRes.isSuccess) {
                    return@withContext fetchConsignmentFullDetails(ref, isRetryAfterLogin = true)
                } else {
                    return@withContext Result.failure(
                        Exception("SESSION_EXPIRED: Session Shipsy expirée (401). Veuillez vous reconnecter.")
                    )
                }
            }

            if (res.isSuccessful && res.body() != null) {
                val elem = res.body()!!
                val obj = when {
                    elem.isJsonArray && elem.asJsonArray.size() > 0 && elem.asJsonArray[0].isJsonObject -> elem.asJsonArray[0].asJsonObject
                    elem.isJsonObject && elem.asJsonObject.has("data") -> {
                        val d = elem.asJsonObject.get("data")
                        if (d.isJsonArray && d.asJsonArray.size() > 0 && d.asJsonArray[0].isJsonObject) d.asJsonArray[0].asJsonObject
                        else if (d.isJsonObject) d.asJsonObject
                        else elem.asJsonObject
                    }
                    elem.isJsonObject -> elem.asJsonObject
                    else -> null
                }

                if (obj != null) {
                    val name = obj.getStringOrNull("destination_name")
                        ?: obj.getStringOrNull("destination_name_ondemand")
                        ?: obj.getStringOrNull("receiver_name")
                        ?: obj.getStringOrNull("customer_name")

                    val phone = obj.getStringOrNull("destination_phone")
                        ?: obj.getStringOrNull("destination_phone_ondemand")
                        ?: obj.getStringOrNull("receiver_phone")
                        ?: obj.getStringOrNull("destination_alternate_phone")
                        ?: obj.getStringOrNull("destination_alternate_phone_2")
                        ?: obj.getStringOrNull("current_delivery_phone")
                        ?: obj.getStringOrNull("customer_phone")
                        ?: obj.getStringOrNull("phone_number")
                        ?: obj.getStringOrNull("phone")

                    val line1 = obj.getStringOrNull("destination_address_line_1")
                    val line2 = obj.getStringOrNull("destination_address_line_2")
                    val city = obj.getStringOrNull("destination_city")
                    val country = obj.getStringOrNull("destination_country")
                    val addressParts = listOfNotNull(line1, line2, city, country).filter { it.isNotBlank() }
                    val address = if (addressParts.isNotEmpty()) {
                        addressParts.joinToString(", ")
                    } else {
                        obj.getStringOrNull("receiver_address") ?: obj.getStringOrNull("address")
                    }

                    val cod = obj.getDoubleOrZero("cod_amount").takeIf { it > 0.0 }
                        ?: obj.getDoubleOrZero("amount").takeIf { it > 0.0 }
                        ?: obj.getDoubleOrZero("cod_value")

                    // Extra details object from Shipsy
                    val extra = if (obj.has("extra_details") && obj.get("extra_details").isJsonObject) {
                        obj.getAsJsonObject("extra_details")
                    } else null

                    val piecesFailureReason = if (obj.has("pieces_detail") && obj.get("pieces_detail").isJsonArray) {
                        val arr = obj.getAsJsonArray("pieces_detail")
                        if (arr.size() > 0 && arr.get(0).isJsonObject) {
                            arr.get(0).asJsonObject.getStringOrNull("delivery_failure_reason")
                                ?: arr.get(0).asJsonObject.getStringOrNull("failure_reason")
                        } else null
                    } else null

                    val piecesAttemptCount = if (obj.has("pieces_detail") && obj.get("pieces_detail").isJsonArray) {
                        val arr = obj.getAsJsonArray("pieces_detail")
                        if (arr.size() > 0 && arr.get(0).isJsonObject) {
                            arr.get(0).asJsonObject.getIntOrNull("attempt_count")
                        } else null
                    } else null

                    val failureReason = obj.getStringOrNull("delivery_failure_reason")
                        ?: obj.getStringOrNull("task_failure_reason")
                        ?: obj.getStringOrNull("ndr_reason_ondemand")
                        ?: obj.getStringOrNull("first_ndr_reason")
                        ?: obj.getStringOrNull("rescheduled_reason")
                        ?: extra?.getStringOrNull("event_reason")
                        ?: extra?.getStringOrNull("delivery_failure_reason")
                        ?: extra?.getStringOrNull("failure_reason")
                        ?: extra?.getStringOrNull("rescheduled_reason")
                        ?: piecesFailureReason
                        ?: obj.getStringOrNull("event_reason")
                        ?: obj.getStringOrNull("failure_reason")
                        ?: obj.getStringOrNull("reason")

                    val status = obj.getStringOrNull("status") ?: obj.getStringOrNull("consignment_status")
                    val customerName = obj.getStringOrNull("customer_name")
                    val hubName = obj.getStringOrNull("hub_name") ?: obj.getStringOrNull("current_hub_name")

                    // Extract all tracking and rider events
                    val allEventObjects = mutableListOf<com.google.gson.JsonObject>()
                    if (obj.has("events") && obj.get("events").isJsonArray) {
                        obj.getAsJsonArray("events").forEach { if (it.isJsonObject) allEventObjects.add(it.asJsonObject) }
                    }
                    if (obj.has("rider_events") && obj.get("rider_events").isJsonArray) {
                        obj.getAsJsonArray("rider_events").forEach { if (it.isJsonObject) allEventObjects.add(it.asJsonObject) }
                    }
                    if (obj.has("tracking_history") && obj.get("tracking_history").isJsonArray) {
                        obj.getAsJsonArray("tracking_history").forEach { if (it.isJsonObject) allEventObjects.add(it.asJsonObject) }
                    }

                    var eventRiderName: String? = null
                    var eventTripId: String? = null
                    var eventFailureReason: String? = null
                    var lastEventDate: String? = null

                    var latestEventObj: com.google.gson.JsonObject? = null
                    var latestEventTs: Long = -1L

                    for (ev in allEventObjects) {
                        val ts = ev.getLongOrNull("event_time") ?: ev.getLongOrNull("timestamp")
                        if (ts != null && ts > latestEventTs) {
                            latestEventTs = ts
                            latestEventObj = ev
                        }

                        val rName = ev.getStringOrNull("rider_name") ?: ev.getStringOrNull("worker_name")
                        if (!rName.isNullOrBlank() && eventRiderName == null) {
                            eventRiderName = rName
                        }
                        val tId = ev.getStringOrNull("trip_id") ?: ev.getStringOrNull("trip_reference")
                        if (!tId.isNullOrBlank() && eventTripId == null) {
                            eventTripId = tId
                        }
                        val fail = ev.getStringOrNull("task_failure_reason")
                            ?: ev.getStringOrNull("delivery_failure_reason")
                            ?: ev.getStringOrNull("event_reason")
                            ?: ev.getStringOrNull("failure_reason")
                            ?: ev.getStringOrNull("reason")
                            ?: ev.getStringOrNull("event_description")
                        if (!fail.isNullOrBlank() && eventFailureReason == null) {
                            eventFailureReason = fail
                        }
                    }

                    if (latestEventTs > 0) {
                        lastEventDate = runCatching { SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.FRENCH).format(Date(latestEventTs)) }.getOrNull()
                    } else if (allEventObjects.isNotEmpty()) {
                        val first = allEventObjects[0]
                        lastEventDate = first.getStringOrNull("event_time") ?: first.getStringOrNull("timestamp")
                    }

                    // Check cached riders for extra hub data
                    val cachedPair = findParcelInCache(ref)
                    val cachedRider = cachedPair?.first
                    val cachedParcel = cachedPair?.second

                    val finalRiderName = eventRiderName ?: cachedRider?.name
                    val finalTripRef = eventTripId ?: cachedRider?.code
                    val cachedReasonClean = cachedParcel?.failureReason?.takeIf { !it.equals("Non livré", ignoreCase = true) }
                    val finalFailureReason = (failureReason ?: eventFailureReason ?: cachedReasonClean)
                        ?.takeIf { !it.equals("Non livré", ignoreCase = true) && !it.equals("null", ignoreCase = true) }

                    val latestEventStatus = latestEventObj?.getStringOrNull("event_type")
                        ?: latestEventObj?.getStringOrNull("action")
                        ?: latestEventObj?.getStringOrNull("status")

                    val finalStatus = status ?: latestEventStatus ?: when (cachedParcel?.status) {
                        ParcelStatus.DELIVERED, ParcelStatus.PICKED_UP -> "DELIVERED"
                        ParcelStatus.UNDELIVERED -> "UNDELIVERED"
                        else -> "IN_TRANSIT"
                    }
                    val finalCod = if (cod != null && cod > 0.0) cod else (cachedParcel?.amount ?: 0.0)

                    val weight = obj.getDoubleOrNull("weight")
                        ?: extra?.getDoubleOrNull("given_weight")
                        ?: extra?.getDoubleOrNull("chargeable_weight")

                    val piecesCount = obj.getIntOrNull("quantity")
                        ?: extra?.getIntOrNull("quantity")
                        ?: (if (obj.has("pieces_detail") && obj.get("pieces_detail").isJsonArray) obj.getAsJsonArray("pieces_detail").size() else null)

                    val serviceType = obj.getStringOrNull("service_type_id") ?: "NORMAL"
                    val consignmentType = obj.getStringOrNull("consignment_type")
                        ?: obj.getStringOrNull("task_type")
                        ?: "Livraison"

                    val customerCode = obj.getStringOrNull("customer_code_name")
                        ?: obj.getStringOrNull("customer_code")

                    val destinationCity = obj.getStringOrNull("destination_pincode")
                        ?: obj.getStringOrNull("destination_city")
                        ?: obj.getStringOrNull("city")

                    val plannedSeq = obj.getIntOrNull("planned_sequence_number")

                    val lat = obj.getDoubleOrNull("task_lat") ?: obj.getDoubleOrNull("location_lat")
                    val lng = obj.getDoubleOrNull("task_lng") ?: obj.getDoubleOrNull("location_lng")

                    var finalCustomerName = customerName
                    var finalCustomerCode = customerCode
                    var isPaymentDone = extra?.get("is_payment_done")?.runCatching { asBoolean }?.getOrDefault(false) ?: false
                    var paymentMode = if (extra?.has("delivery_payment_reference_ids") == true && extra.get("delivery_payment_reference_ids").isJsonArray) {
                        extra.getAsJsonArray("delivery_payment_reference_ids")
                            .mapNotNull { runCatching { it.asString }.getOrNull() }
                            .joinToString(" / ")
                    } else null

                    // Shipsy sometimes puts reconciliation notes in customer_name or customer_code
                    val hasEncaissInName = customerName?.contains("encaiss", ignoreCase = true) == true
                    val hasEncaissInCode = customerCode?.contains("encaiss", ignoreCase = true) == true
                    
                    if (hasEncaissInName || hasEncaissInCode) {
                        isPaymentDone = true
                        if (paymentMode.isNullOrBlank()) {
                            paymentMode = "Réconcilié"
                        }
                        // Hide it from merchant fields if it's just a payment note
                        if (hasEncaissInName && customerName!!.lowercase().startsWith("encaiss")) {
                            finalCustomerName = null
                        }
                        if (hasEncaissInCode && customerCode!!.lowercase().startsWith("encaiss")) {
                            finalCustomerCode = null
                        }
                    }

                    val dateFmt = SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.FRENCH)
                    val deliveryTs = obj.getLongOrNull("task_completion_time")
                        ?: extra?.getLongOrNull("delivered_time")
                        ?: obj.getLongOrNull("last_main_event_time")
                    val deliveryTimeFormatted = deliveryTs?.takeIf { it > 0 }?.let {
                        runCatching { dateFmt.format(Date(it)) }.getOrNull()
                    }

                    val lastEventTs = obj.getLongOrNull("last_event_time")
                        ?: obj.getLongOrNull("updated_at")
                        ?: obj.getLongOrNull("last_main_event_time")
                    val lastEventTsFormatted = lastEventTs?.takeIf { it > 0 }?.let {
                        runCatching { dateFmt.format(Date(it)) }.getOrNull()
                    }

                    // Extract attempt count from all available signals in Shipsy JSON
                    val candidateCounts = mutableListOf<Int>()

                    // 1. Direct integer fields on root obj
                    obj.getIntOrNull("attempt_count")?.takeIf { it > 0 }?.let { candidateCounts.add(it) }
                    obj.getIntOrNull("delivery_attempt_count")?.takeIf { it > 0 }?.let { candidateCounts.add(it) }
                    obj.getIntOrNull("total_delivery_attempts")?.takeIf { it > 0 }?.let { candidateCounts.add(it) }
                    obj.getIntOrNull("delivery_attempts")?.takeIf { it > 0 }?.let { candidateCounts.add(it) }
                    obj.getIntOrNull("total_attempts")?.takeIf { it > 0 }?.let { candidateCounts.add(it) }
                    obj.getIntOrNull("attempted_task_count")?.takeIf { it > 0 }?.let { candidateCounts.add(it) }
                    obj.getIntOrNull("task_attempt_count")?.takeIf { it > 0 }?.let { candidateCounts.add(it) }
                    obj.getIntOrNull("no_of_attempts")?.takeIf { it > 0 }?.let { candidateCounts.add(it) }
                    obj.getIntOrNull("attempts")?.takeIf { it > 0 }?.let { candidateCounts.add(it) }

                    // 2. Direct integer fields on extra_details
                    extra?.getIntOrNull("attempt_count")?.takeIf { it > 0 }?.let { candidateCounts.add(it) }
                    extra?.getIntOrNull("delivery_attempt_count")?.takeIf { it > 0 }?.let { candidateCounts.add(it) }
                    extra?.getIntOrNull("total_delivery_attempts")?.takeIf { it > 0 }?.let { candidateCounts.add(it) }
                    extra?.getIntOrNull("delivery_attempts")?.takeIf { it > 0 }?.let { candidateCounts.add(it) }
                    extra?.getIntOrNull("attempted_task_count")?.takeIf { it > 0 }?.let { candidateCounts.add(it) }

                    // 3. Pieces detail attempt counts
                    if (obj.has("pieces_detail") && obj.get("pieces_detail").isJsonArray) {
                        obj.getAsJsonArray("pieces_detail").forEach { piece ->
                            if (piece.isJsonObject) {
                                piece.asJsonObject.getIntOrNull("attempt_count")?.takeIf { it > 0 }?.let { candidateCounts.add(it) }
                                piece.asJsonObject.getIntOrNull("delivery_attempt_count")?.takeIf { it > 0 }?.let { candidateCounts.add(it) }
                            }
                        }
                    }

                    // 4. Count from NDR attempt fields (first_attempt_ndr, second_attempt_ndr, third_attempt_ndr, etc.)
                    val ndrFields = listOfNotNull(
                        obj.getStringOrNull("first_attempt_ndr"),
                        obj.getStringOrNull("second_attempt_ndr"),
                        obj.getStringOrNull("third_attempt_ndr"),
                        extra?.getStringOrNull("first_attempt_ndr"),
                        extra?.getStringOrNull("second_attempt_ndr"),
                        extra?.getStringOrNull("third_attempt_ndr")
                    ).filter { it.isNotBlank() }
                    if (ndrFields.isNotEmpty()) {
                        candidateCounts.add(ndrFields.size)
                    }

                    // 5. Count from explicit attempt timestamps
                    val attemptTimestamps = listOfNotNull(
                        obj.getLongOrNull("first_attempt_time")?.takeIf { it > 0 }
                            ?: obj.getLongOrNull("self_first_attempt_time")?.takeIf { it > 0 },
                        obj.getLongOrNull("second_attempt_time")?.takeIf { it > 0 },
                        obj.getLongOrNull("third_attempt_time")?.takeIf { it > 0 }
                    )
                    if (attemptTimestamps.isNotEmpty()) {
                        candidateCounts.add(attemptTimestamps.size)
                    }

                    // 6. Count from attempt POC images (proof of delivery attempt photos)
                    val rawPocList = when {
                        obj.has("poc_image_list") && obj.get("poc_image_list").isJsonArray -> obj.getAsJsonArray("poc_image_list")
                        extra?.has("poc_image_list") == true && extra.get("poc_image_list").isJsonArray -> extra.getAsJsonArray("poc_image_list")
                        else -> null
                    }
                    val attemptImagesCount = rawPocList?.count { pElem ->
                        val u = if (pElem.isJsonObject) pElem.asJsonObject.getStringOrNull("url") else null
                        u?.contains("attempt", ignoreCase = true) == true
                    } ?: 0
                    if (attemptImagesCount > 0) {
                        candidateCounts.add(attemptImagesCount)
                    }

                    // 7. Count from events / rider_events / tracking_history
                    val attemptEventsCount = allEventObjects.count { ev ->
                        val evType = ev.getStringOrNull("type")?.lowercase(Locale.ROOT) ?: ""
                        val eventStr = ev.getStringOrNull("event_string")?.lowercase(Locale.ROOT) ?: ""
                        val evStatus = ev.getStringOrNull("status")?.lowercase(Locale.ROOT) ?: ""
                        val evAction = ev.getStringOrNull("action")?.lowercase(Locale.ROOT) ?: ""
                        val evDesc = ev.getStringOrNull("description")?.lowercase(Locale.ROOT) ?: ""
                        val evReason = ev.getStringOrNull("reason")?.lowercase(Locale.ROOT) ?: ""

                        evType.contains("attempt") ||
                                eventStr.contains("attempt") ||
                                evStatus.contains("attempt") ||
                                evAction.contains("attempt") ||
                                evDesc.contains("tentative") ||
                                evReason.contains("tentative")
                    }
                    if (attemptEventsCount > 0) {
                        candidateCounts.add(attemptEventsCount)
                    }

                    // Take maximum across all signals
                    var attemptCount = candidateCounts.maxOrNull() ?: 0

                    // 8. If status or failureReason indicates an attempt but count is still 0, default to at least 1
                    val hasAttemptIndicator = (finalStatus?.contains("ATTEMPT", ignoreCase = true) == true) ||
                            (finalStatus?.contains("UNDELIVERED", ignoreCase = true) == true) ||
                            (!finalFailureReason.isNullOrBlank() && !finalFailureReason.equals("Non livré", ignoreCase = true))

                    if (attemptCount == 0 && hasAttemptIndicator) {
                        attemptCount = 1
                    }

                    val creationTs = obj.getLongOrNull("creation_time")
                    val creationTimeFormatted = creationTs?.takeIf { it > 0 }?.let {
                        runCatching { dateFmt.format(Date(it)) }.getOrNull()
                    }

                    val pocList = if (extra?.has("poc_image_list") == true && extra.get("poc_image_list").isJsonArray) {
                        extra.getAsJsonArray("poc_image_list")
                    } else null
                    val pocUrl = if (pocList != null && pocList.size() > 0 && pocList.get(0).isJsonObject) {
                        pocList.get(0).asJsonObject.getStringOrNull("url")
                    } else null

                    val details = ConsignmentFullDetails(
                        referenceNumber = ref,
                        destinationName = name,
                        destinationPhone = phone,
                        destinationAddress = address,
                        codAmount = finalCod,
                        failureReason = finalFailureReason,
                        status = finalStatus,
                        riderName = finalRiderName,
                        tripRef = finalTripRef,
                        customerName = finalCustomerName,
                        customerCode = finalCustomerCode,
                        hubName = hubName,
                        lastEventDate = lastEventDate ?: deliveryTimeFormatted ?: lastEventTsFormatted ?: creationTimeFormatted,
                        weight = weight,
                        piecesCount = piecesCount,
                        serviceType = serviceType,
                        consignmentType = consignmentType,
                        isPaymentDone = isPaymentDone,
                        paymentMode = paymentMode,
                        deliveryTime = deliveryTimeFormatted,
                        creationTime = creationTimeFormatted,
                        plannedSequence = plannedSeq,
                        pocImageUrl = pocUrl,
                        latitude = lat,
                        longitude = lng,
                        destinationCity = destinationCity,
                        attemptCount = attemptCount
                    )

                    consignmentDetailsCache[ref] = details
                    updateParcelInCache(details)

                    return@withContext Result.success(details)
                }
            }
            val errCode = res.code()
            if (errCode == 401) {
                Result.failure(Exception("SESSION_EXPIRED: Session Shipsy expirée (401). Reconnexion requise."))
            } else if (errCode == 404) {
                Result.failure(Exception("Colis introuvable ($ref)"))
            } else {
                Result.failure(Exception("Détails colis indisponibles ($errCode)"))
            }
        } catch (e: Exception) {
            android.util.Log.e("ChronoApp", "fetchConsignmentFullDetails error for $ref: ${e.message}", e)
            Result.failure(e)
        }
    }

    fun findParcelInCache(referenceNumber: String): Pair<RiderItem, ParcelDetail>? {
        val q = referenceNumber.trim()
        if (q.isBlank()) return null
        for (rider in cachedRiders) {
            val p = rider.parcels.firstOrNull { it.referenceNumber.equals(q, ignoreCase = true) }
            if (p != null) return Pair(rider, p)
        }
        return null
    }

    suspend fun lookupParcel(referenceNumber: String): Result<ConsignmentFullDetails> = withContext(Dispatchers.IO) {
        val q = referenceNumber.trim()
        if (q.isBlank()) return@withContext Result.failure(IllegalArgumentException("Code colis vide"))

        val liveRes = fetchConsignmentFullDetails(q)
        if (liveRes.isSuccess) {
            return@withContext liveRes
        }

        // Offline / cached fallback: if live API fails, check if the parcel is already known in cache
        val cachedPair = findParcelInCache(q)
        if (cachedPair != null) {
            val (rider, parcel) = cachedPair
            val cachedDetails = ConsignmentFullDetails(
                referenceNumber = parcel.referenceNumber,
                destinationName = parcel.recipientName,
                destinationPhone = parcel.recipientPhone,
                destinationAddress = parcel.address,
                codAmount = parcel.amount,
                failureReason = parcel.failureReason,
                status = parcel.status.name,
                riderName = parcel.riderName ?: rider.name,
                tripRef = parcel.tripReference ?: rider.code,
                customerName = parcel.recipientName,
                hubName = "Mohammedia Hub",
                lastEventDate = parcel.createdAt,
                attemptCount = parcel.attemptCount
            )
            return@withContext Result.success(cachedDetails)
        }

        liveRes
    }

    private fun updateParcelInCache(details: ConsignmentFullDetails) {
        for (i in 0 until cachedRiders.size) {
            val rider = cachedRiders[i]
            var changed = false
            val updatedParcels = rider.parcels.map { p ->
                if (p.referenceNumber == details.referenceNumber) {
                    changed = true
                    p.copy(
                        recipientName = details.destinationName ?: p.recipientName,
                        recipientPhone = details.destinationPhone ?: p.recipientPhone,
                        address = details.destinationAddress ?: p.address,
                        failureReason = details.failureReason ?: p.failureReason,
                        attemptCount = details.attemptCount ?: p.attemptCount
                    )
                } else p
            }
            if (changed) {
                cachedRiders[i] = rider.copy(parcels = updatedParcels)
            }
        }
    }

    private suspend fun fetchRealDataFromApi(
        isRetryAfterLogin: Boolean = false,
        onProgress: (suspend () -> Unit)? = null
    ) {
        if (apiAuthToken.isBlank()) {
            val loginInit = performAutoLogin()
            if (loginInit.isFailure && !isRetryAfterLogin) {
                throw IllegalStateException("Impossible de se connecter automatiquement à Shipsy: ${loginInit.exceptionOrNull()?.localizedMessage}")
            }
        }

        val casablancaTz = TimeZone.getTimeZone("Africa/Casablanca")
        val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = casablancaTz }
        val sdfDmy = SimpleDateFormat("dd/MM/yyyy", Locale.US).apply { timeZone = casablancaTz }

        val cal = Calendar.getInstance(casablancaTz)
        val todayStr = sdf.format(cal.time)
        val todayDmy = sdfDmy.format(cal.time)

        var queryDateStr = todayStr
        var queryDmy = todayDmy
        activeDateLabel = "Aujourd'hui"

        val token = apiAuthToken.ifBlank { DEFAULT_ACCESS_TOKEN }.trim()
        val userId = shipsyUserId.ifBlank { DEFAULT_USER_ID }.trim()
        val orgId = shipsyOrganisationId.ifBlank { DEFAULT_ORGANISATION_ID }.trim()
        val hubId = shipsyHubId.ifBlank { DEFAULT_HUB_ID }.trim()

        val headers = mutableMapOf(
            "Accept" to "application/json",
            "Content-Type" to "application/json",
            "organisation-id" to orgId,
            "application-type" to applicationType.ifBlank { DEFAULT_APPLICATION_TYPE },
            "access-token" to token,
            "user-id" to userId
        )

        var needAutoLogin = false
        val allFetchedTrips = mutableListOf<ShipsyTripItem>()
        val reconList = mutableListOf<ReconciliationItem>()
        var authError: String? = null

        val reqTrips = ShipsyTripRequest(
            fromDate = todayStr,
            toDate = todayStr,
            hubId = hubId,
            bucket = "retail_all"
        )
        val reconReqPage1 = ReconciliationRequest(
            startDate = null,
            endDate = null,
            hubList = listOf(hubId),
            pageNo = 1,
            resultsPerPage = 100,
            cashSource = "ALL"
        )

        // 1. Parallel fetch all trips (retail_all) and reconciliation page 1
        val (resTrips, resRecon1) = coroutineScope {
            val dTrips = async { runCatching { apiService.getTrips(headers, reqTrips) }.getOrNull() }
            val dRecon1 = async { runCatching { apiService.getReconciliationData(headers, reconReqPage1) }.getOrNull() }
            Pair(dTrips.await(), dRecon1.await())
        }

        if (resTrips?.code() == 401 || resRecon1?.code() == 401) {
            needAutoLogin = true
        }

        if (resTrips != null && resTrips.isSuccessful && resTrips.body()?.data?.pageData != null) {
            allFetchedTrips.addAll(resTrips.body()!!.data!!.pageData!!)
        } else if (resTrips != null && !resTrips.isSuccessful && resTrips.code() != 401) {
            authError = "Erreur ${resTrips.code()}: ${resTrips.message()}"
        }

        var shouldPaginateRecon = false
        if (resRecon1 != null && resRecon1.isSuccessful && resRecon1.body()?.data?.reconciliationData != null) {
            val pageData = resRecon1.body()!!.data!!.reconciliationData!!
            for (item in pageData) {
                val createdAt = item.createdAt.orEmpty()
                if (createdAt.contains(queryDmy) || createdAt.contains(queryDateStr) || createdAt.isBlank()) {
                    reconList.add(item)
                }
            }
            if (pageData.size >= 100 && !pageData.any { it.createdAt != null && !it.createdAt.contains(queryDmy) && !it.createdAt.contains(queryDateStr) }) {
                shouldPaginateRecon = true
            }
        }

        // 2. Fallback to yesterday if today has zero trips (e.g. early morning or past midnight)
        if (allFetchedTrips.isEmpty() && !needAutoLogin) {
            val calYesterday = Calendar.getInstance(casablancaTz).apply {
                add(Calendar.DAY_OF_YEAR, -1)
            }
            val yesterdayStr = sdf.format(calYesterday.time)
            val yesterdayDmy = sdfDmy.format(calYesterday.time)

            val reqTripsYest = ShipsyTripRequest(
                fromDate = yesterdayStr,
                toDate = yesterdayStr,
                hubId = hubId,
                bucket = "retail_all"
            )

            try {
                val resYest = apiService.getTrips(headers, reqTripsYest)
                if (resYest.code() == 401) {
                    needAutoLogin = true
                } else if (resYest.isSuccessful && !resYest.body()?.data?.pageData.isNullOrEmpty()) {
                    allFetchedTrips.addAll(resYest.body()!!.data!!.pageData!!)
                    queryDateStr = yesterdayStr
                    queryDmy = yesterdayDmy
                    activeDateLabel = "Hier ($yesterdayDmy)"
                }
            } catch (_: Exception) {}
        }

        // 3. Paginate reconciliation pages 2..5 only if needed
        if (shouldPaginateRecon && !needAutoLogin) {
            try {
                for (page in 2..5) {
                    val reconReq = ReconciliationRequest(
                        startDate = null,
                        endDate = null,
                        hubList = listOf(hubId),
                        pageNo = page,
                        resultsPerPage = 100,
                        cashSource = "ALL"
                    )
                    val reconRes = apiService.getReconciliationData(headers, reconReq)
                    if (reconRes.code() == 401) {
                        needAutoLogin = true
                        break
                    }
                    val pageData = reconRes.body()?.data?.reconciliationData
                    if (!reconRes.isSuccessful || pageData.isNullOrEmpty()) {
                        break
                    }

                    for (item in pageData) {
                        val createdAt = item.createdAt.orEmpty()
                        if (createdAt.contains(queryDmy) || createdAt.contains(queryDateStr) || createdAt.isBlank()) {
                            reconList.add(item)
                        }
                    }

                    if (pageData.size < 100 || pageData.any { it.createdAt != null && !it.createdAt.contains(queryDmy) && !it.createdAt.contains(queryDateStr) }) {
                        break
                    }
                }
            } catch (_: Exception) {}
        }

        // If session expired (401), trigger automatic background login and retry seamlessly
        if (needAutoLogin && !isRetryAfterLogin) {
            val loginResult = performAutoLogin()
            if (loginResult.isSuccess) {
                return fetchRealDataFromApi(isRetryAfterLogin = true, onProgress = onProgress)
            } else {
                val loginErr = loginResult.exceptionOrNull()?.localizedMessage
                throw IllegalStateException("Session expirée (401) et reconnexion automatique échouée: $loginErr")
            }
        }

        if (authError != null && allFetchedTrips.isEmpty() && reconList.isEmpty()) {
            throw IllegalStateException(authError)
        }

        val allTrips = allFetchedTrips.distinctBy {
            it.id ?: it.tripReferenceNumber ?: it.organisationReferenceNumber
        }

        // Group reconciliation items by canonical rider name and worker code
        val reconByRider = reconList.groupBy { item ->
            val rawName = item.workerName ?: item.name ?: ""
            getCanonicalRiderName(rawName).ifBlank {
                item.workerCode?.lowercase(Locale.ROOT) ?: "recon_rider"
            }
        }

        // Group trips by unique rider
        val tripsByRider = allTrips.groupBy { trip ->
            val driverName = trip.extraDetails?.driverName ?: trip.workerName ?: "Livreur"
            getCanonicalRiderName(driverName).ifBlank {
                trip.workerId?.ifBlank { null } ?: (trip.tripReferenceNumber ?: "rider").lowercase(Locale.ROOT)
            }
        }

        val ridersMap = mutableMapOf<String, RiderItem>()
        val tripRefsByRider = mutableMapOf<String, MutableList<String>>()

        tripsByRider.forEach { (canonicalKey, trips) ->
            val mainTrip = trips.first()
            val driverName = mainTrip.extraDetails?.driverName ?: mainTrip.workerName ?: "Livreur"
            val tripRef = mainTrip.tripReferenceNumber ?: mainTrip.organisationReferenceNumber ?: "MOH"
            val phone = trips.mapNotNull { it.workerPhone }.firstOrNull { it.isNotBlank() } ?: "+212 600-000000"

            val totalCredits = trips.sumOf { it.credits ?: it.workerCredits ?: 0.0 }
            val totalDelivered = trips.sumOf { it.deliveredTaskCount ?: 0 }
            val totalAttempted = trips.sumOf { it.attemptedTaskCount ?: 0 }
            val totalTasks = trips.sumOf { it.totalTaskCount ?: ((it.deliveredTaskCount ?: 0) + (it.attemptedTaskCount ?: 0)) }
            
            // Rider is in transit if ANY trip is not completed yet (e.g. started, assigned, in_transit)
            val anyInTransit = trips.any { !it.status.equals("completed", ignoreCase = true) }
            val allReconciled = trips.all { it.isReconciliationComplete == true }

            // Hub Settlement aggregation matching ChronoExtension logic
            val matchingRecon = reconByRider[canonicalKey] ?: emptyList()
            val settledTotal = matchingRecon
                .filter { it.creditType?.equals("settlement", ignoreCase = true) == true }
                .sumOf { Math.abs(it.amount ?: 0.0) }
            val codTotal = matchingRecon
                .filter { it.creditType?.equals("cod", ignoreCase = true) == true }
                .sumOf { Math.abs(it.amount ?: 0.0) }

            val finalAmount = when {
                totalCredits > 0.0 -> totalCredits
                settledTotal > 0.0 -> settledTotal
                codTotal > 0.0 -> codTotal
                else -> 0.0
            }

            val cashier = matchingRecon.mapNotNull { it.employeeName }
                .firstOrNull { it.isNotBlank() && !it.equals("N. A.", ignoreCase = true) }

            val tripWorkerCode = matchingRecon.firstOrNull { !it.workerCode.isNullOrBlank() }?.workerCode
                ?: mainTrip.workerId
                ?: trips.mapNotNull { it.workerId }.firstOrNull { it.isNotBlank() }

            val isLocallySettled = trips.any { t ->
                locallySettledRiders.contains(t.id) ||
                locallySettledRiders.contains(t.tripReferenceNumber) ||
                locallySettledRiders.contains(t.organisationReferenceNumber)
            } || locallySettledRiders.contains(canonicalKey) || (tripWorkerCode != null && locallySettledRiders.contains(tripWorkerCode))

            // Completed circuit with 0 MAD due and no parcel in consignment balance requires no settlement
            val isZeroDueCompleted = !anyInTransit && finalAmount <= 0.01

            val isRiderReconciled = allReconciled || settledTotal > 0.0 || cashier != null || isLocallySettled || isZeroDueCompleted

            // Construct parcel details from reconciliation ledger
            val reconParcels = matchingRecon.mapNotNull { rec ->
                val ref = rec.referenceNumber ?: rec.id
                if (ref.isNullOrBlank()) null
                else {
                    ParcelDetail(
                        id = rec.id ?: ref,
                        referenceNumber = ref,
                        amount = Math.abs(rec.amount ?: 0.0),
                        status = ParcelStatus.DELIVERED,
                        recipientName = cashier?.let { "Encaissé par $it" },
                        address = rec.createdAt,
                        createdAt = rec.createdAt,
                        employeeName = rec.employeeName
                    )
                }
            }

            ridersMap[canonicalKey] = RiderItem(
                id = mainTrip.id ?: tripRef,
                name = driverName,
                code = tripRef,
                phone = phone,
                tripStatus = if (anyInTransit) TripStatus.IN_TRANSIT else TripStatus.COMPLETED,
                amountToPay = finalAmount,
                deliveredCount = if (totalDelivered > 0) totalDelivered else reconParcels.size,
                undeliveredCount = totalAttempted,
                totalParcels = if (totalTasks > 0) totalTasks else reconParcels.size,
                reconciledBy = cashier,
                isReconciled = isRiderReconciled,
                parcels = reconParcels,
                workerCode = tripWorkerCode
            )

            val refs = trips.mapNotNull { it.tripReferenceNumber ?: it.organisationReferenceNumber }
                .filter { it.isNotBlank() }
                .distinct()
            tripRefsByRider[canonicalKey] = refs.toMutableList()
        }

        // Merge any rider present solely in reconciliation ledger
        reconByRider.forEach { (canonicalKey, items) ->
            if (!ridersMap.containsKey(canonicalKey)) {
                val sample = items.first()
                val rawName = sample.workerName ?: sample.name ?: "Livreur"
                val code = sample.workerCode ?: sample.code ?: sample.id?.takeLast(6) ?: "MOH"
                val settledTotal = items
                    .filter { it.creditType?.equals("settlement", ignoreCase = true) == true }
                    .sumOf { Math.abs(it.amount ?: 0.0) }
                val codTotal = items
                    .filter { it.creditType?.equals("cod", ignoreCase = true) == true }
                    .sumOf { Math.abs(it.amount ?: 0.0) }
                val finalAmt = if (settledTotal > 0.0) settledTotal else codTotal
                val cashier = items.mapNotNull { it.employeeName }.firstOrNull { it.isNotBlank() && !it.equals("N. A.", ignoreCase = true) }

                val reconParcels = items.mapNotNull { rec ->
                    val ref = rec.referenceNumber ?: rec.id
                    if (ref.isNullOrBlank()) null
                    else {
                        ParcelDetail(
                            id = rec.id ?: ref,
                            referenceNumber = ref,
                            amount = Math.abs(rec.amount ?: 0.0),
                            status = ParcelStatus.DELIVERED,
                            recipientName = cashier?.let { "Encaissé par $it" },
                            address = rec.createdAt,
                            createdAt = rec.createdAt,
                            employeeName = rec.employeeName
                        )
                    }
                }

                val reconWorkerCode = sample.workerCode ?: sample.code ?: code

                ridersMap[canonicalKey] = RiderItem(
                    id = sample.id ?: code,
                    name = rawName,
                    code = code,
                    tripStatus = TripStatus.COMPLETED,
                    amountToPay = finalAmt,
                    deliveredCount = reconParcels.size,
                    undeliveredCount = 0,
                    totalParcels = reconParcels.size,
                    reconciledBy = cashier,
                    isReconciled = true,
                    parcels = reconParcels,
                    workerCode = reconWorkerCode
                )
            }
        }

        // --- STAGE 1: Immediate Progressive Publish ---
        // Every rider's card, status, counts, cashier, and settlement amounts are now ready!
        val stage1Riders = ridersMap.values.toList()
        synchronized(cachedRiders) {
            cachedRiders.clear()
            cachedRiders.addAll(stage1Riders)
        }
        saveCacheToDisk()
        onProgress?.invoke()

        // --- STAGE 2: Concurrent Parcel Enrichment ---
        val inTransitTripRefs = allTrips.filter { !it.status.equals("completed", ignoreCase = true) }
            .mapNotNull { it.tripReferenceNumber ?: it.organisationReferenceNumber }
            .toSet()
        val allDistinctRefs = tripRefsByRider.values.flatten()
            .filter { it.isNotBlank() }
            .distinct()

        val semaphore = Semaphore(4)
        val parcelsByRef = ConcurrentHashMap<String, List<ParcelDetail>>()

        coroutineScope {
            allDistinctRefs.map { ref ->
                async {
                    val cached = tripParcelsCache[ref]
                    if (!cached.isNullOrEmpty() && ref !in inTransitTripRefs) {
                        parcelsByRef[ref] = cached
                    } else {
                        semaphore.withPermit {
                            val parcels = fetchParcelsForTrip(headers, ref)
                            if (parcels.isNotEmpty()) {
                                parcelsByRef[ref] = parcels
                                tripParcelsCache[ref] = parcels
                            }
                        }
                    }
                }
            }.awaitAll()
        }

        // Merge parcels from tripdetails with parcels from reconciliation ledger
        val updatedRiders = mutableListOf<RiderItem>()
        for ((key, rider) in ridersMap) {
            val refs = tripRefsByRider[key] ?: listOf(rider.code)
            val allParcels = mutableListOf<ParcelDetail>()

            for (ref in refs) {
                parcelsByRef[ref]?.let { allParcels.addAll(it) }
            }

            allParcels.addAll(rider.parcels)

            val distinctParcels = allParcels.distinctBy { it.referenceNumber }
            if (distinctParcels.isNotEmpty()) {
                val del = distinctParcels.count { it.status == ParcelStatus.DELIVERED || it.status == ParcelStatus.PICKED_UP }
                val undel = distinctParcels.count { it.status == ParcelStatus.UNDELIVERED || it.status == ParcelStatus.PENDING }

                val deliveredCodSum = distinctParcels
                    .filter { it.status == ParcelStatus.DELIVERED || it.status == ParcelStatus.PICKED_UP }
                    .sumOf { it.amount }

                val computedAmount = when {
                    rider.amountToPay > 0.0 && rider.tripStatus == TripStatus.IN_TRANSIT -> rider.amountToPay
                    deliveredCodSum > 0.0 -> deliveredCodSum
                    rider.amountToPay > 0.0 -> rider.amountToPay
                    else -> 0.0
                }

                val isZeroDueAfterEnrichment = rider.tripStatus == TripStatus.COMPLETED && computedAmount <= 0.01
                val isRiderReconciled = rider.isReconciled || isZeroDueAfterEnrichment

                updatedRiders.add(
                    rider.copy(
                        amountToPay = computedAmount,
                        isReconciled = isRiderReconciled,
                        parcels = distinctParcels,
                        deliveredCount = maxOf(rider.deliveredCount, del),
                        undeliveredCount = maxOf(rider.undeliveredCount, undel),
                        totalParcels = maxOf(rider.totalParcels, distinctParcels.size)
                    )
                )
            } else {
                updatedRiders.add(rider)
            }
        }

        synchronized(cachedRiders) {
            cachedRiders.clear()
            cachedRiders.addAll(updatedRiders)
        }
        saveCacheToDisk()
    }

    // ─────────────────────────────────────────────────────────────
    // Hub Operations: Inscan, Outscan & Arrival Scanning
    // ─────────────────────────────────────────────────────────────

    suspend fun executeHubScan(
        mode: HubScanMode,
        consignments: List<String>,
        targetHubId: String? = null,
        destinationHubId: String? = null,
        isRetryAfterLogin: Boolean = false
    ): Result<HubScanExecutionResult> = withContext(Dispatchers.IO) {
        if (consignments.isEmpty()) {
            return@withContext Result.failure(IllegalArgumentException("Aucun numéro de colis fourni."))
        }

        // Ensure session is active
        if (apiAuthToken.isBlank()) {
            val autoLoginRes = performAutoLogin(appContext)
            if (autoLoginRes.isFailure && !isRetryAfterLogin) {
                return@withContext Result.failure(Exception("Session expirée (401). Veuillez vous reconnecter."))
            }
        }

        val hub = targetHubId?.ifBlank { shipsyHubId } ?: shipsyHubId
        val service = apiService
        val cleanCodes = consignments.map { it.trim().uppercase() }.filter { it.isNotBlank() }.distinct()

        try {
            val response = when (mode) {
                HubScanMode.INSCAN -> {
                    val req = ConsignmentBatchActionRequest(consignments = cleanCodes, hubId = hub)
                    var res = service.markInscanAtHubFallback(request = req)
                    if (!res.isSuccessful && (res.code() == 404 || res.code() == 400)) {
                        res = service.markInscanAtHub(request = req)
                    }
                    res
                }
                HubScanMode.OUTSCAN -> {
                    val req = ConsignmentOutscanRequest(consignments = cleanCodes, hubId = hub, destinationHubId = destinationHubId)
                    var res = service.markOutscanAtHubFallback(request = req)
                    if (!res.isSuccessful && (res.code() == 404 || res.code() == 400)) {
                        res = service.markOutscanAtHub(request = req)
                    }
                    res
                }
                HubScanMode.ARRIVAL -> {
                    val req = ConsignmentBatchActionRequest(consignments = cleanCodes, hubId = hub)
                    var res = service.markArrivalAtHubFallback(request = req)
                    if (!res.isSuccessful && (res.code() == 404 || res.code() == 400)) {
                        res = service.markArrivalAtHub(request = req)
                    }
                    res
                }
                HubScanMode.RTO -> {
                    val rtoItems = cleanCodes.map { ConsignmentRtoItem(referenceNumber = it) }
                    val req = ConsignmentRtoRequest(consignments = rtoItems, hubId = hub)
                    service.markConsignmentAsRto(request = req)
                }
            }

            if (response.code() == 401 && !isRetryAfterLogin) {
                val autoLoginRes = performAutoLogin(appContext)
                if (autoLoginRes.isSuccess) {
                    return@withContext executeHubScan(mode, consignments, targetHubId, destinationHubId, isRetryAfterLogin = true)
                }
            }

            if (response.isSuccessful) {
                val element = response.body()
                val parsedResult = parseHubScanResult(element, cleanCodes, mode)
                Result.success(parsedResult)
            } else {
                val errBody = response.errorBody()?.string() ?: ""
                val errorMsg = parseHubErrorString(errBody, response.code())
                Result.failure(Exception(errorMsg))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun validateInscanConsignments(
        consignments: List<String>,
        targetHubId: String? = null
    ): Result<JsonElement> = withContext(Dispatchers.IO) {
        val hub = targetHubId?.ifBlank { shipsyHubId } ?: shipsyHubId
        val req = ConsignmentValidateRequest(
            consignments = consignments.map { it.trim().uppercase() },
            hubId = hub,
            actionType = "inscan_at_hub"
        )
        try {
            val res = apiService.validateInscanConsignments(request = req)
            if (res.isSuccessful && res.body() != null) {
                Result.success(res.body()!!)
            } else {
                Result.failure(Exception(parseHubErrorString(res.errorBody()?.string() ?: "", res.code())))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun parseHubScanResult(
        element: JsonElement?,
        requestedCodes: List<String>,
        mode: HubScanMode
    ): HubScanExecutionResult {
        if (element == null) {
            return HubScanExecutionResult(
                mode = mode,
                totalCount = requestedCodes.size,
                successCount = requestedCodes.size,
                failureCount = 0,
                failures = emptyList(),
                isSuccess = true,
                rawMessage = "Opération réussie"
            )
        }

        val failures = mutableListOf<String>()
        var successCount = 0
        var failureCount = 0
        var rawMsg = "Succès"

        if (element.isJsonObject) {
            val obj = element.asJsonObject
            rawMsg = obj.get("message")?.runCatching { if (isJsonPrimitive) asString else toString() }?.getOrNull() ?: "Succès"

            val statusStr = obj.get("status")?.runCatching { if (isJsonPrimitive) asString else toString() }?.getOrNull().orEmpty()

            val dataElem = obj.get("data")
            if (dataElem != null && dataElem.isJsonObject) {
                val dataObj = dataElem.asJsonObject

                fun getSafeArray(o: com.google.gson.JsonObject, vararg keys: String): com.google.gson.JsonArray? {
                    for (k in keys) {
                        val e = o.get(k)
                        if (e != null && e.isJsonArray) return e.asJsonArray
                    }
                    return null
                }

                val successfulArray = getSafeArray(dataObj, "successful", "success", "success_consignments", "consignments")
                val failedArray = getSafeArray(dataObj, "failed", "failed_consignments", "unsuccessful", "errors")

                val hasBooleanSuccess = (dataObj.get("success")?.runCatching { asBoolean }?.getOrNull() == true) ||
                        statusStr.equals("success", ignoreCase = true) ||
                        (dataObj.get("status")?.runCatching { asString }?.getOrNull()?.equals("success", ignoreCase = true) == true)

                if (successfulArray != null || failedArray != null) {
                    successCount = successfulArray?.size() ?: (if (hasBooleanSuccess) (requestedCodes.size - (failedArray?.size() ?: 0)).coerceAtLeast(0) else 0)
                    if (failedArray != null) {
                        for (item in failedArray) {
                            if (item.isJsonObject) {
                                val itemObj = item.asJsonObject
                                val cn = itemObj.get("reference_number")?.runCatching { asString }?.getOrNull()
                                    ?: itemObj.get("consignment_number")?.runCatching { asString }?.getOrNull()
                                    ?: itemObj.get("id")?.runCatching { asString }?.getOrNull() ?: "Colis"
                                val reason = itemObj.get("message")?.runCatching { asString }?.getOrNull()
                                    ?: itemObj.get("reason")?.runCatching { asString }?.getOrNull() ?: "Non traité"
                                failures.add("$cn: $reason")
                            } else {
                                failures.add(item.runCatching { asString }.getOrDefault("Erreur inconnue"))
                            }
                        }
                    }
                    failureCount = failures.size
                } else if (hasBooleanSuccess) {
                    successCount = requestedCodes.size
                    failureCount = 0
                } else {
                    if (statusStr.equals("error", ignoreCase = true)) {
                        failureCount = requestedCodes.size
                        failures.add(rawMsg)
                    } else {
                        successCount = requestedCodes.size
                    }
                }
            } else if (dataElem != null && dataElem.isJsonArray) {
                successCount = dataElem.asJsonArray.size()
            } else if (dataElem != null && dataElem.isJsonPrimitive && dataElem.asJsonPrimitive.isBoolean && dataElem.asBoolean) {
                successCount = requestedCodes.size
                failureCount = 0
            } else {
                if (statusStr.equals("error", ignoreCase = true)) {
                    failureCount = requestedCodes.size
                    failures.add(rawMsg)
                } else {
                    successCount = requestedCodes.size
                }
            }
        } else if (element.isJsonArray) {
            successCount = element.asJsonArray.size()
        } else {
            successCount = requestedCodes.size
        }

        return HubScanExecutionResult(
            mode = mode,
            totalCount = requestedCodes.size,
            successCount = successCount,
            failureCount = failureCount,
            failures = failures,
            isSuccess = failureCount == 0,
            rawMessage = rawMsg
        )
    }

    suspend fun searchHubs(query: String): List<HubSearchResponse> {
        return withContext(Dispatchers.IO) {
            try {
                val res = apiService.searchHubs(query = query)
                if (res.isSuccessful) {
                    val json = res.body()
                    if (json != null && json.isJsonArray) {
                        val arr = json.asJsonArray
                        val list = mutableListOf<HubSearchResponse>()
                        for (item in arr) {
                            if (item.isJsonObject) {
                                val obj = item.asJsonObject
                                val id = obj.get("id")?.asString ?: ""
                                val name = obj.get("name")?.asString ?: ""
                                val code = obj.get("code")?.asString ?: ""
                                if (id.isNotEmpty()) {
                                    list.add(HubSearchResponse(id, name, code))
                                }
                            }
                        }
                        return@withContext list
                    }
                }
                emptyList()
            } catch (e: Exception) {
                emptyList()
            }
        }
    }

    private fun parseHubErrorString(errBody: String, code: Int): String {
        if (errBody.isBlank()) return "Erreur serveur ($code)"
        try {
            val json = JsonParser.parseString(errBody)
            if (json.isJsonObject) {
                val obj = json.asJsonObject
                val msg = obj.get("message")?.runCatching { if (isJsonPrimitive) asString else toString() }?.getOrNull()
                    ?: obj.get("error")?.runCatching { if (isJsonPrimitive) asString else toString() }?.getOrNull()
                    ?: obj.get("msg")?.runCatching { if (isJsonPrimitive) asString else toString() }?.getOrNull()
                if (!msg.isNullOrBlank()) return msg
            }
        } catch (_: Exception) { }
        return "Erreur ($code): ${errBody.take(150)}"
    }
}
