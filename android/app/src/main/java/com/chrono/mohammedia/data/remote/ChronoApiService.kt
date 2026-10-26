package com.chrono.mohammedia.data.remote

import com.chrono.mohammedia.data.model.*
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HeaderMap
import retrofit2.http.POST
import retrofit2.http.Query

interface ChronoApiService {

    @GET("api/retaildashboard/reconciliation/rider")
    suspend fun getRiderReconciliation(
        @HeaderMap headers: Map<String, String>,
        @Query("hub_id") hubId: String,
        @Query("task_from_date") taskFromDate: String,
        @Query("task_to_date") taskToDate: String,
        @Query("worker_id") workerId: String? = null,
        @Query("use_depreciate_flow") useDepreciateFlow: Boolean = false
    ): Response<JsonElement>

    @GET("api/retaildashboard/reconciliation/riders")
    suspend fun getRidersReconciliationList(
        @HeaderMap headers: Map<String, String>,
        @Query("hub_id") hubId: String,
        @Query("task_from_date") taskFromDate: String,
        @Query("task_to_date") taskToDate: String,
        @Query("use_depreciate_flow") useDepreciateFlow: Boolean = false
    ): Response<JsonElement>

    @POST("api/retaildashboard/tripmanager/get")
    suspend fun getTrips(
        @HeaderMap headers: Map<String, String>,
        @Body request: ShipsyTripRequest
    ): Response<ShipsyTripResponse>

    @POST("api/Dashboard/riderReconciliation/getReconciliationData")
    suspend fun getReconciliationData(
        @HeaderMap headers: Map<String, String>,
        @Body request: ReconciliationRequest
    ): Response<ReconciliationResponse>

    @GET("api/RetailDashboard/trip/getTaskSummary")
    suspend fun getTripTaskSummary(
        @HeaderMap headers: Map<String, String>,
        @Query("trip_id") tripId: String
    ): Response<JsonObject>

    @GET("api/retaildashboard/tripdetails/get")
    suspend fun getTripDetails(
        @HeaderMap headers: Map<String, String>,
        @Query("searchBy") searchBy: String = "organisation_reference_number",
        @Query("searchKey") searchKey: String,
        @Query("timezone") timezone: String = "Africa/Casablanca"
    ): Response<JsonObject>

    @GET("api/CRMDashboard/consignments/fetchOne")
    suspend fun getConsignmentFetchOne(
        @HeaderMap headers: Map<String, String>,
        @Query("referenceNumber") referenceNumber: String,
        @Query("send_unmasked_data") sendUnmaskedData: Boolean = false
    ): Response<JsonElement>

    @POST("api/dashboard/login")
    suspend fun login(
        @HeaderMap headers: Map<String, String> = emptyMap(),
        @Body request: ShipsyLoginRequest
    ): Response<ShipsyLoginResponse>

    // ── Hub Operations: Inscan, Outscan & Arrival ──

    @POST("api/CRMDashboard/consignments/markConsignmentAsInscanAtHub")
    suspend fun markInscanAtHub(
        @HeaderMap headers: Map<String, String> = emptyMap(),
        @Body request: ConsignmentBatchActionRequest
    ): Response<JsonElement>

    @POST("api/Dashboard/Tasks/markConsignmentAsInscanAtHub")
    suspend fun markInscanAtHubFallback(
        @HeaderMap headers: Map<String, String> = emptyMap(),
        @Body request: ConsignmentBatchActionRequest
    ): Response<JsonElement>

    @POST("api/RetailDashboard/consignments/validateInScannedConsignments")
    suspend fun validateInscanConsignments(
        @HeaderMap headers: Map<String, String> = emptyMap(),
        @Body request: ConsignmentValidateRequest
    ): Response<JsonElement>

    @POST("api/Dashboard/Tasks/outscanAtHub")
    suspend fun markOutscanAtHub(
        @HeaderMap headers: Map<String, String> = emptyMap(),
        @Body request: ConsignmentOutscanRequest
    ): Response<JsonElement>

    @POST("api/Dashboard/Tasks/markConsignmentAsOutscanAtHub")
    suspend fun markOutscanAtHubFallback(
        @HeaderMap headers: Map<String, String> = emptyMap(),
        @Body request: ConsignmentOutscanRequest
    ): Response<JsonElement>

    @POST("api/CRMDashboard/consignments/markConsignmentAsArrivedAtHub")
    suspend fun markArrivalAtHub(
        @HeaderMap headers: Map<String, String> = emptyMap(),
        @Body request: ConsignmentBatchActionRequest
    ): Response<JsonElement>

    @POST("api/Dashboard/Tasks/markConsignmentAsArrivedAtHub")
    suspend fun markArrivalAtHubFallback(
        @HeaderMap headers: Map<String, String> = emptyMap(),
        @Body request: ConsignmentBatchActionRequest
    ): Response<JsonElement>

    @GET("api/CRMDashboard/search/hubs")
    suspend fun searchHubs(
        @HeaderMap headers: Map<String, String> = emptyMap(),
        @Query("searchQuery") query: String
    ): Response<JsonElement>

    @POST("api/Dashboard/markConsignmentAsRto")
    suspend fun markConsignmentAsRto(
        @HeaderMap headers: Map<String, String> = emptyMap(),
        @Body request: ConsignmentRtoRequest
    ): Response<JsonElement>
}

