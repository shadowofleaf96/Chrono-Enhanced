package com.chrono.mohammedia.data.model

import com.google.gson.annotations.SerializedName

enum class TripStatus {
    COMPLETED,
    IN_TRANSIT,
    NOT_STARTED
}

enum class ParcelStatus {
    DELIVERED,
    UNDELIVERED,
    PICKED_UP,
    PENDING
}

data class ParcelDetail(
    val id: String,
    val referenceNumber: String,
    val amount: Double,
    val status: ParcelStatus,
    val failureReason: String? = null,
    val recipientName: String? = null,
    val recipientPhone: String? = null,
    val address: String? = null,
    val createdAt: String? = null,
    val employeeName: String? = null,
    val tripReference: String? = null,
    val riderName: String? = null,
    val attemptCount: Int = 1
) : java.io.Serializable

data class ConsignmentFullDetails(
    val referenceNumber: String,
    val destinationName: String?,
    val destinationPhone: String?,
    val destinationAddress: String?,
    val codAmount: Double? = null,
    val failureReason: String? = null,
    val status: String? = null,
    val riderName: String? = null,
    val tripRef: String? = null,
    val customerName: String? = null,
    val customerCode: String? = null,
    val hubName: String? = null,
    val lastEventDate: String? = null,
    val weight: Double? = null,
    val piecesCount: Int? = null,
    val serviceType: String? = null,
    val consignmentType: String? = null,
    val isPaymentDone: Boolean = false,
    val paymentMode: String? = null,
    val deliveryTime: String? = null,
    val creationTime: String? = null,
    val plannedSequence: Int? = null,
    val pocImageUrl: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val destinationCity: String? = null,
    val attemptCount: Int? = null
) : java.io.Serializable


data class RiderItem(
    val id: String,
    val name: String,
    val code: String,
    val phone: String = "+212 600-000000",
    val tripStatus: TripStatus = TripStatus.NOT_STARTED,
    val amountToPay: Double = 0.0,
    val deliveredCount: Int = 0,
    val undeliveredCount: Int = 0,
    val totalParcels: Int = 0,
    val reconciledBy: String? = null,
    val isReconciled: Boolean = false,
    val parcels: List<ParcelDetail> = emptyList(),
    val workerCode: String? = null
) : java.io.Serializable {
    val isTripFinished: Boolean
        get() = tripStatus == TripStatus.COMPLETED

    val successRatePercent: Int
        get() = if (totalParcels > 0) ((deliveredCount * 100) / totalParcels).coerceIn(0, 100) else 0

    val deliveredParcels: List<ParcelDetail>
        get() = parcels.filter { it.status == ParcelStatus.DELIVERED || it.status == ParcelStatus.PICKED_UP }

    val undeliveredParcels: List<ParcelDetail>
        get() = parcels.filter { it.status == ParcelStatus.UNDELIVERED || it.status == ParcelStatus.PENDING }
}

data class HubSummary(
    val totalDueAmount: Double,
    val completedTripsCount: Int,
    val totalTripsCount: Int,
    val totalDeliveredParcels: Int,
    val totalUndeliveredParcels: Int,
    val totalParcels: Int,
    val activeDateLabel: String = "Aujourd'hui"
)

enum class FilterType {
    ALL,
    FINISHED_TRIPS,
    IN_TRANSIT,
    HAS_DUE,
    HAS_UNDELIVERED
}

// DTOs for Shipsy API integration

data class ShipsyRiderReconciliation(
    @SerializedName("id") val id: String? = null,
    @SerializedName("worker_code") val workerCode: String? = null,
    @SerializedName("worker_name") val workerName: String? = null,
    @SerializedName("worker_phone") val workerPhone: String? = null,
    @SerializedName("vehicle_number") val vehicleNumber: String? = null,
    @SerializedName("vehicle_make_name") val vehicleMakeName: String? = null,
    @SerializedName("hub_id") val hubId: String? = null,
    @SerializedName("hub_name") val hubName: String? = null,
    @SerializedName("hub_code") val hubCode: String? = null,
    @SerializedName("is_settled") val isSettled: Boolean? = null,
    @SerializedName("consignments_delivered") val consignmentsDelivered: Int? = null,
    @SerializedName("consignments_undelivered") val consignmentsUndelivered: Int? = null,
    @SerializedName("total") val total: Int? = null,
    @SerializedName("cash_balance") val cashBalance: Map<String, Double>? = null,
    @SerializedName("settlement_consignments") val settlementConsignments: List<ShipsyConsignment>? = null,
    @SerializedName("reconcile_consignments") val reconcileConsignments: List<ShipsyConsignment>? = null
)

data class ShipsyConsignment(
    @SerializedName("reference_number") val referenceNumber: String? = null,
    @SerializedName("cod_amount") val codAmount: Double? = null,
    @SerializedName("cod_amount_collected") val codAmountCollected: Double? = null,
    @SerializedName("consignment_status") val consignmentStatus: String? = null,
    @SerializedName("customer_name") val customerName: String? = null,
    @SerializedName("address_line_1") val addressLine1: String? = null,
    @SerializedName("city") val city: String? = null,
    @SerializedName("delivery_failure_reason") val deliveryFailureReason: String? = null,
    @SerializedName("pieces_detail") val piecesDetail: List<ShipsyPieceDetail>? = null
)

data class ShipsyPieceDetail(
    @SerializedName("description") val description: String? = null,
    @SerializedName("_internal") val internal: ShipsyInternalPieceDetail? = null
)

data class ShipsyInternalPieceDetail(
    @SerializedName("status") val status: String? = null,
    @SerializedName("failure_reason") val failureReason: String? = null,
    @SerializedName("event_reason") val eventReason: String? = null
)

fun ShipsyRiderReconciliation.toRiderItem(): RiderItem {
    val name = workerName ?: "Livreur"
    val code = workerCode ?: id?.takeLast(6) ?: "MOH"
    val phone = workerPhone ?: "+212 600-000000"
    val delivered = consignmentsDelivered ?: 0
    val undelivered = consignmentsUndelivered ?: 0
    val totalCount = total ?: (delivered + undelivered)
    val amount = cashBalance?.get("MAD") ?: cashBalance?.values?.sum() ?: 0.0
    val finished = isSettled == true

    val deliveredParcels = settlementConsignments?.mapIndexed { index, sc ->
        ParcelDetail(
            id = sc.referenceNumber ?: "P_DEL_$index",
            referenceNumber = sc.referenceNumber ?: "CN_DEL_$index",
            amount = sc.codAmountCollected ?: sc.codAmount ?: 0.0,
            status = ParcelStatus.DELIVERED,
            recipientName = sc.customerName,
            address = sc.addressLine1 ?: sc.city
        )
    } ?: emptyList()

    val undeliveredParcels = reconcileConsignments?.mapIndexed { index, rc ->
        val reason = rc.deliveryFailureReason
            ?: rc.piecesDetail?.firstOrNull()?.internal?.failureReason
            ?: rc.piecesDetail?.firstOrNull()?.internal?.eventReason
            ?: "Non livré"

        ParcelDetail(
            id = rc.referenceNumber ?: "P_UNDEL_$index",
            referenceNumber = rc.referenceNumber ?: "CN_UNDEL_$index",
            amount = 0.0,
            status = ParcelStatus.UNDELIVERED,
            failureReason = reason,
            recipientName = rc.customerName,
            address = rc.addressLine1 ?: rc.city
        )
    } ?: emptyList()

    return RiderItem(
        id = id ?: code,
        name = name,
        code = code,
        phone = phone,
        tripStatus = if (finished) TripStatus.COMPLETED else TripStatus.IN_TRANSIT,
        amountToPay = amount,
        deliveredCount = delivered,
        undeliveredCount = undelivered,
        totalParcels = totalCount,
        reconciledBy = if (finished) "Réconcilié" else "Non réglé",
        parcels = deliveredParcels + undeliveredParcels
    )
}

data class ShipsyTripRequest(
    @SerializedName("last_trip_id") val lastTripId: String? = null,
    @SerializedName("last_sort_field_value") val lastSortFieldValue: String? = null,
    @SerializedName("result_per_page") val resultPerPage: Int = 200,
    @SerializedName("next_or_prev") val nextOrPrev: String = "first",
    @SerializedName("sort_by") val sortBy: String = "last_main_event_time",
    @SerializedName("descending_order") val descendingOrder: Boolean = true,
    @SerializedName("from_date") val fromDate: String,
    @SerializedName("to_date") val toDate: String,
    @SerializedName("date_field") val dateField: String = "last_main_event_time",
    @SerializedName("organisation_reference_number") val organisationReferenceNumber: String = "",
    @SerializedName("hub_id") val hubId: String,
    @SerializedName("bucket") val bucket: String? = "retail_all",
    @SerializedName("timezone") val timezone: String = "Africa/Casablanca"
)

data class ShipsyTripResponse(
    @SerializedName("data") val data: ShipsyTripData?
)

data class ShipsyTripData(
    @SerializedName("page_data") val pageData: List<ShipsyTripItem>?
)

data class ShipsyTripItem(
    @SerializedName("id") val id: String?,
    @SerializedName("trip_id") val tripId: String?,
    @SerializedName("status") val status: String?,
    @SerializedName("total_task_count") val totalTaskCount: Int?,
    @SerializedName("delivered_task_count") val deliveredTaskCount: Int?,
    @SerializedName("attempted_task_count") val attemptedTaskCount: Int?,
    @SerializedName("pending_task_count") val pendingTaskCount: Int?,
    @SerializedName("is_reconciliation_complete") val isReconciliationComplete: Boolean? = false,
    @SerializedName("worker_name") val workerName: String?,
    @SerializedName("worker_id") val workerId: String?,
    @SerializedName("worker_phone") val workerPhone: String?,
    @SerializedName("trip_reference_number") val tripReferenceNumber: String?,
    @SerializedName("organisation_reference_number") val organisationReferenceNumber: String?,
    @SerializedName("vehicle_registration_number") val vehicleRegistrationNumber: String?,
    @SerializedName("credits") val credits: Double?,
    @SerializedName("worker_credits") val workerCredits: Double?,
    @SerializedName("extra_details") val extraDetails: ShipsyExtraDetails?
)

data class ShipsyExtraDetails(
    @SerializedName("driver_name") val driverName: String?
)

data class ReconciliationRequest(
    @SerializedName("startDate") val startDate: String?,
    @SerializedName("endDate") val endDate: String?,
    @SerializedName("hubList") val hubList: List<String>,
    @SerializedName("riderList") val riderList: List<String> = emptyList(),
    @SerializedName("transactionTypeList") val transactionTypeList: List<String> = emptyList(),
    @SerializedName("employeeDetails") val employeeDetails: List<String> = emptyList(),
    @SerializedName("consignmentNumbers") val consignmentNumbers: List<String> = emptyList(),
    @SerializedName("firstId") val firstId: String? = null,
    @SerializedName("lastId") val lastId: String? = null,
    @SerializedName("statusType") val statusType: String? = null,
    @SerializedName("nextOrPrev") val nextOrPrev: String = "next",
    @SerializedName("pageNo") val pageNo: Int = 1,
    @SerializedName("resultsPerPage") val resultsPerPage: Int = 100,
    @SerializedName("cashSource") val cashSource: String = "ALL"
)

data class ReconciliationResponse(
    @SerializedName("data") val data: ReconciliationData?
)

data class ReconciliationData(
    @SerializedName("reconciliationData") val reconciliationData: List<ReconciliationItem>?
)

data class ReconciliationItem(
    @SerializedName("id") val id: String?,
    @SerializedName("reference_number") val referenceNumber: String?,
    @SerializedName("worker_name") val workerName: String?,
    @SerializedName("name") val name: String?,
    @SerializedName("worker_code") val workerCode: String?,
    @SerializedName("code") val code: String?,
    @SerializedName("amount") val amount: Double?,
    @SerializedName("employee_name") val employeeName: String?,
    @SerializedName("is_reconciled") val isReconciled: Boolean? = false,
    @SerializedName("created_at") val createdAt: String?,
    @SerializedName("currency") val currency: String?,
    @SerializedName("credit_type") val creditType: String?,
    @SerializedName("cod_status") val codStatus: String? = null
)

data class ShipsyLoginRequest(
    @SerializedName("username") val username: String,
    @SerializedName("pwd") val pwd: String
)

data class ShipsyLoginResponse(
    @SerializedName("status") val status: String? = null,
    @SerializedName("data") val data: ShipsyLoginData? = null
)

data class ShipsyLoginData(
    @SerializedName("organisation_id") val organisationId: String? = null,
    @SerializedName("access_token") val accessToken: ShipsyAccessToken? = null,
    @SerializedName("employee") val employee: ShipsyEmployeeSummary? = null
)

data class ShipsyAccessToken(
    @SerializedName("id") val id: String? = null,
    @SerializedName("expiry_at") val expiryAt: String? = null
)

data class ShipsyEmployeeSummary(
    @SerializedName("id") val id: String? = null,
    @SerializedName("employee_code") val employeeCode: String? = null,
    @SerializedName("full_name") val fullName: String? = null,
    @SerializedName("phone") val phone: String? = null
)

// ── Hub Scanning & Consignment Operations ──

enum class HubScanMode(val title: String, val actionType: String) {
    INSCAN("Inscan at Hub", "inscan_at_hub"),
    OUTSCAN("Outscan at Hub", "outscan_at_hub"),
    ARRIVAL("Arrival at Hub", "hub_arrival"),
    RTO("Set RTO", "set_rto")
}

data class ConsignmentRtoItem(
    @SerializedName("reference_number") val referenceNumber: String,
    @SerializedName("notes") val notes: String = "",
    @SerializedName("reasonCode") val reasonCode: String = "",
    @SerializedName("reasonName") val reasonName: String = ""
)

data class ConsignmentRtoRequest(
    @SerializedName("consignments") val consignments: List<ConsignmentRtoItem>,
    @SerializedName("hub_id") val hubId: String,
    @SerializedName("request_type") val requestType: String = "bulk_upload_via_excel"
)

data class ConsignmentBatchActionRequest(
    @SerializedName("consignments") val consignments: List<String>,
    @SerializedName("hub_id") val hubId: String
)

data class ConsignmentOutscanRequest(
    @SerializedName("consignments") val consignments: List<String>,
    @SerializedName("hub_id") val hubId: String,
    @SerializedName("destination_hub_id") val destinationHubId: String? = null
)

data class ConsignmentValidateRequest(
    @SerializedName("consignments") val consignments: List<String>,
    @SerializedName("hub_id") val hubId: String,
    @SerializedName("action_type") val actionType: String
)

enum class ScannedItemStatus {
    PENDING,
    SUCCESS,
    FAILED
}

data class ScannedParcelItem(
    val code: String,
    val scannedAt: Long = System.currentTimeMillis(),
    var status: ScannedItemStatus = ScannedItemStatus.PENDING,
    var message: String? = null,
    var latestStatus: String? = null,
    var latestStatusDate: String? = null,
    var recipientName: String? = null,
    var attemptCount: Int? = null,
    var isLoadingDetails: Boolean = false
)

data class HubScanExecutionResult(
    val mode: HubScanMode,
    val totalCount: Int,
    val successCount: Int,
    val failureCount: Int,
    val failures: List<String> = emptyList(),
    val isSuccess: Boolean,
    val rawMessage: String? = null
)





data class HubSearchResponse(
    val id: String,
    val name: String,
    val code: String
)
