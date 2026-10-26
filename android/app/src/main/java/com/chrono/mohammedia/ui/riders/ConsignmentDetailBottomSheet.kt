package com.chrono.mohammedia.ui.riders

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import com.chrono.mohammedia.R
import com.chrono.mohammedia.data.model.ConsignmentFullDetails
import com.chrono.mohammedia.data.model.ParcelDetail
import com.chrono.mohammedia.data.model.ParcelStatus
import com.chrono.mohammedia.data.repository.RiderRepository
import com.chrono.mohammedia.databinding.BottomSheetConsignmentDetailBinding
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.chrono.mohammedia.util.setupDoubleTapAmountCopy
import kotlinx.coroutines.launch
import java.util.Locale

class ConsignmentDetailBottomSheet : BottomSheetDialogFragment() {

    private var _binding: BottomSheetConsignmentDetailBinding? = null
    private val binding get() = _binding!!

    private var parcel: ParcelDetail? = null
    private var riderName: String? = null
    private var tripRef: String? = null
    private var referenceNumberArg: String? = null
    private var currentDetails: ConsignmentFullDetails? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        @Suppress("DEPRECATION")
        parcel = arguments?.getSerializable(ARG_PARCEL) as? ParcelDetail
        riderName = arguments?.getString(ARG_RIDER_NAME)
        tripRef = arguments?.getString(ARG_TRIP_REF)
        referenceNumberArg = arguments?.getString(ARG_REF_NUMBER)
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = BottomSheetConsignmentDetailBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        val repo = RiderRepository.getInstance(requireContext())

        var p = parcel
        if (p == null && !referenceNumberArg.isNullOrBlank()) {
            val ref = referenceNumberArg!!.trim()
            val cached = repo.findParcelInCache(ref)
            if (cached != null) {
                p = cached.second
                if (riderName.isNullOrBlank()) riderName = cached.first.name
                if (tripRef.isNullOrBlank()) tripRef = cached.first.code
            } else {
                p = ParcelDetail(
                    id = ref,
                    referenceNumber = ref,
                    amount = 0.0,
                    status = ParcelStatus.PENDING
                )
            }
            parcel = p
        }

        if (p == null) {
            dismiss()
            return
        }

        // 1. Reference & Copy
        binding.sheetConsignmentCn.text = p.referenceNumber
        binding.btnCopyConsignmentCn.setOnClickListener {
            copyToClipboard(p.referenceNumber, "Code colis copié")
        }

        // 2. Status Badge
        updateStatusBadge(p.status)

        // 3. Financial Amount
        if (p.amount > 0.0) {
            binding.sheetConsignmentCod.text = String.format(Locale.FRENCH, "%,.2f MAD", p.amount)
        } else {
            binding.sheetConsignmentCod.text = "- MAD"
        }

        binding.sheetConsignmentCod.setupDoubleTapAmountCopy({
            currentDetails?.codAmount ?: p.amount
        })
        binding.sheetCardCod.setupDoubleTapAmountCopy({
            currentDetails?.codAmount ?: p.amount
        })

        // 4. Recipient details
        binding.sheetRecipientName.text = p.recipientName ?: "Client standard"
        binding.sheetRecipientAddress.text = p.address ?: "Adresse non communiquée"

        val phone = p.recipientPhone?.trim().orEmpty()
        if (phone.isNotBlank() && phone != "null") {
            binding.sheetRecipientPhone.text = phone
            binding.btnCallRecipient.visibility = View.VISIBLE
            binding.btnCallRecipient.setOnClickListener {
                val dialIntent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${phone.replace(" ", "")}"))
                startActivity(dialIntent)
            }
        } else {
            binding.sheetRecipientPhone.text = "Numéro de téléphone non renseigné"
            binding.btnCallRecipient.visibility = View.GONE
        }

        // 5. Trip & Assignment details
        val assignedRider = p.riderName ?: riderName ?: "Livreur assigné"
        val assignedTrip = p.tripReference ?: tripRef ?: "Non renseigné"
        binding.sheetRiderAssigned.text = assignedRider
        binding.sheetTripRef.text = assignedTrip

        // 6. Failure reason
        val isDelivered = p.status == ParcelStatus.DELIVERED || p.status == ParcelStatus.PICKED_UP
        val cleanInitialReason = p.failureReason?.takeIf { !it.equals("Non livré", ignoreCase = true) && !it.equals("null", ignoreCase = true) }
        if (!isDelivered && !cleanInitialReason.isNullOrBlank()) {
            binding.layoutFailureReason.visibility = View.VISIBLE
            binding.sheetFailureReason.text = cleanInitialReason
        } else {
            binding.layoutFailureReason.visibility = View.GONE
        }

        // 7. Close button
        binding.btnCloseConsignmentSheet.setOnClickListener {
            dismiss()
        }

        // 8. Fetch live full consignment details (Destination Name, Phone, Address, Rider, Status)
        fetchLiveConsignmentDetails(p)
    }

    private fun updateStatusBadge(status: ParcelStatus) {
        val isDelivered = status == ParcelStatus.DELIVERED || status == ParcelStatus.PICKED_UP
        if (isDelivered) {
            binding.sheetConsignmentStatus.text = "✔ Livré"
            binding.sheetConsignmentStatus.setBackgroundResource(R.drawable.bg_badge_finished)
            binding.sheetConsignmentStatus.backgroundTintList = null
            binding.sheetConsignmentStatus.setTextColor(ContextCompat.getColor(requireContext(), R.color.status_finished_text))
        } else if (status == ParcelStatus.UNDELIVERED) {
            binding.sheetConsignmentStatus.text = "✖ Non livré"
            binding.sheetConsignmentStatus.setBackgroundResource(R.drawable.bg_badge_amount)
            binding.sheetConsignmentStatus.backgroundTintList = ContextCompat.getColorStateList(
                requireContext(), R.color.status_undelivered_bg
            )
            binding.sheetConsignmentStatus.setTextColor(ContextCompat.getColor(requireContext(), R.color.status_undelivered_text))
        } else {
            binding.sheetConsignmentStatus.text = "⏳ En cours"
            binding.sheetConsignmentStatus.setBackgroundResource(R.drawable.bg_badge_transit)
            binding.sheetConsignmentStatus.backgroundTintList = null
            binding.sheetConsignmentStatus.setTextColor(ContextCompat.getColor(requireContext(), R.color.status_transit_text))
        }
    }

    private fun updateStatusBadgeFromDetails(details: ConsignmentFullDetails) {
        val rawStatus = details.status?.uppercase(Locale.ROOT) ?: ""
        val cleanReason = details.failureReason?.takeIf { !it.equals("Non livré", ignoreCase = true) && !it.equals("null", ignoreCase = true) }

        val isDelivered = rawStatus == "DELIVERED" || 
                          rawStatus == "LIVRÉ" || 
                          rawStatus == "LIVRE" || 
                          (rawStatus.contains("DELIVER") && !rawStatus.contains("UNDELIVER")) || 
                          (rawStatus.contains("LIVR") && !rawStatus.contains("NON"))

        val isFailed = !isDelivered && (
            rawStatus.contains("FAIL") || 
            rawStatus.contains("UNDELIVER") || 
            rawStatus.contains("NON LIVR") || 
            rawStatus.contains("NON_LIVR") || 
            rawStatus.contains("ATTEMPT") || 
            rawStatus.contains("ÉCHOU") || 
            rawStatus.contains("CANCEL") || 
            rawStatus.contains("REFUS")
        )

        when {
            isDelivered -> {
                binding.sheetConsignmentStatus.text = "✔ Livré"
                binding.sheetConsignmentStatus.setBackgroundResource(R.drawable.bg_badge_finished)
                binding.sheetConsignmentStatus.backgroundTintList = null
                binding.sheetConsignmentStatus.setTextColor(ContextCompat.getColor(requireContext(), R.color.status_finished_text))
            }
            isFailed -> {
                binding.sheetConsignmentStatus.text = "✖ Non livré"
                binding.sheetConsignmentStatus.setBackgroundResource(R.drawable.bg_badge_amount)
                binding.sheetConsignmentStatus.backgroundTintList = ContextCompat.getColorStateList(requireContext(), R.color.status_undelivered_bg)
                binding.sheetConsignmentStatus.setTextColor(ContextCompat.getColor(requireContext(), R.color.status_undelivered_text))
            }
            rawStatus.contains("REACH") || rawStatus.contains("ARRIV") -> {
                binding.sheetConsignmentStatus.text = "🏢 Arrivé au Hub"
                binding.sheetConsignmentStatus.setBackgroundResource(R.drawable.bg_badge_transit)
                binding.sheetConsignmentStatus.backgroundTintList = ContextCompat.getColorStateList(requireContext(), R.color.badge_blue_bg)
                binding.sheetConsignmentStatus.setTextColor(ContextCompat.getColor(requireContext(), R.color.badge_blue_text))
            }
            rawStatus.contains("INSCAN") -> {
                binding.sheetConsignmentStatus.text = "🏢 Inscan au Hub"
                binding.sheetConsignmentStatus.setBackgroundResource(R.drawable.bg_badge_transit)
                binding.sheetConsignmentStatus.backgroundTintList = ContextCompat.getColorStateList(requireContext(), R.color.badge_blue_bg)
                binding.sheetConsignmentStatus.setTextColor(ContextCompat.getColor(requireContext(), R.color.badge_blue_text))
            }
            rawStatus.contains("OUTSCAN") -> {
                binding.sheetConsignmentStatus.text = "🚚 Outscan du Hub"
                binding.sheetConsignmentStatus.setBackgroundResource(R.drawable.bg_badge_transit)
                binding.sheetConsignmentStatus.backgroundTintList = null
                binding.sheetConsignmentStatus.setTextColor(ContextCompat.getColor(requireContext(), R.color.status_transit_text))
            }
            rawStatus.contains("OFD") || rawStatus.contains("DISPATCH") || rawStatus.contains("OUT_FOR") -> {
                binding.sheetConsignmentStatus.text = "🚚 En livraison (OFD)"
                binding.sheetConsignmentStatus.setBackgroundResource(R.drawable.bg_badge_transit)
                binding.sheetConsignmentStatus.backgroundTintList = null
                binding.sheetConsignmentStatus.setTextColor(ContextCompat.getColor(requireContext(), R.color.status_transit_text))
            }
            rawStatus.isNotBlank() -> {
                binding.sheetConsignmentStatus.text = "⏳ En cours"
                binding.sheetConsignmentStatus.setBackgroundResource(R.drawable.bg_badge_transit)
                binding.sheetConsignmentStatus.backgroundTintList = null
                binding.sheetConsignmentStatus.setTextColor(ContextCompat.getColor(requireContext(), R.color.status_transit_text))
            }
        }

        // Show failure reason only if parcel is NOT delivered and clean reason is available
        val isDeliveredNow = isDelivered || binding.sheetConsignmentStatus.text.toString().contains("Livré")
        if (!isDeliveredNow && !cleanReason.isNullOrBlank()) {
            binding.layoutFailureReason.visibility = View.VISIBLE
            binding.sheetFailureReason.text = cleanReason
        } else {
            binding.layoutFailureReason.visibility = View.GONE
        }
    }

    private fun fetchLiveConsignmentDetails(p: ParcelDetail) {
        viewLifecycleOwner.lifecycleScope.launch {
            binding.progressLoadingRecipient.visibility = View.VISIBLE
            val repo = RiderRepository.getInstance(requireContext())
            val res = repo.fetchConsignmentFullDetails(p.referenceNumber)
            if (_binding != null && isAdded) {
                binding.progressLoadingRecipient.visibility = View.GONE
                if (res.isSuccess) {
                    val details = res.getOrNull() ?: return@launch
                    currentDetails = details
                    details.destinationName?.takeIf { it.isNotBlank() }?.let { name ->
                        binding.sheetRecipientName.text = name
                    }
                    val livePhone = details.destinationPhone?.trim().orEmpty()
                    if (livePhone.isNotBlank() && livePhone != "null") {
                        binding.sheetRecipientPhone.text = livePhone
                        binding.btnCallRecipient.visibility = View.VISIBLE
                        binding.btnCallRecipient.setOnClickListener {
                            val dialIntent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${livePhone.replace(" ", "")}"))
                            startActivity(dialIntent)
                        }
                    }
                    details.destinationAddress?.takeIf { it.isNotBlank() }?.let { addr ->
                        binding.sheetRecipientAddress.text = addr
                    }
                    if (details.codAmount != null && details.codAmount > 0.0) {
                        binding.sheetConsignmentCod.text = String.format(Locale.FRENCH, "%,.2f MAD", details.codAmount)
                    }

                    // Update live status and failure reason using detailed helper
                    updateStatusBadgeFromDetails(details)

                    // Update assigned rider / trip if available
                    details.riderName?.takeIf { it.isNotBlank() }?.let { rName ->
                        binding.sheetRiderAssigned.text = rName
                    }
                    details.tripRef?.takeIf { it.isNotBlank() }?.let { tRef ->
                        binding.sheetTripRef.text = tRef
                    }

                    // Merchant / Customer
                    val merchantParts = listOfNotNull(details.customerName, details.customerCode?.let { "($it)" }).filter { it.isNotBlank() }
                    if (merchantParts.isNotEmpty()) {
                        binding.sheetMerchantCustomer.text = merchantParts.joinToString(" ")
                        binding.layoutMerchantRow.visibility = View.VISIBLE
                    } else {
                        binding.layoutMerchantRow.visibility = View.GONE
                    }

                    // Weight & Pieces
                    val wStr = if (details.weight != null && details.weight > 0) "${String.format(Locale.FRENCH, "%.2f", details.weight)} kg" else "Poids standard"
                    val pStr = if (details.piecesCount != null && details.piecesCount > 0) "${details.piecesCount} pièce${if (details.piecesCount > 1) "s" else ""}" else "1 pièce"
                    binding.sheetSpecsWeightPieces.text = "$wStr • $pStr"

                    // Service Type & Consignment Type
                    val sType = details.serviceType ?: "NORMAL"
                    val cType = details.consignmentType ?: "Livraison"
                    binding.sheetServiceType.text = "$sType • $cType"

                    // Trip stop sequence
                    if (details.plannedSequence != null && details.plannedSequence > 0) {
                        binding.layoutTripStopSeq.visibility = View.VISIBLE
                        binding.sheetTripSequence.text = "Arrêt #${details.plannedSequence}"
                    } else {
                        binding.layoutTripStopSeq.visibility = View.GONE
                    }

                    // Delivery Attempts (Top Badge & Details Row)
                    val attempts = when {
                        (details.attemptCount ?: 0) > 0 -> details.attemptCount!!
                        !details.failureReason.isNullOrBlank() && !details.failureReason.equals("Non livré", ignoreCase = true) -> 1
                        else -> 0
                    }
                    if (attempts > 0) {
                        val attemptsSuffix = if (attempts > 1) "s" else ""
                        binding.sheetBadgeAttemptsTop.visibility = View.VISIBLE
                        binding.sheetBadgeAttemptsTop.text = "$attempts tentative$attemptsSuffix"
                        binding.layoutDeliveryAttempts.visibility = View.VISIBLE
                        binding.sheetDeliveryAttempts.text = "$attempts tentative$attemptsSuffix"
                    } else {
                        binding.sheetBadgeAttemptsTop.visibility = View.GONE
                        binding.layoutDeliveryAttempts.visibility = View.GONE
                    }

                    try {
                        parentFragmentManager.setFragmentResult(TAG, Bundle().apply {
                            putString("ref", details.referenceNumber)
                            putInt("attempts", attempts)
                        })
                    } catch (_: Exception) {}

                    // Event / Delivery Date
                    val dateToShow = details.deliveryTime ?: details.lastEventDate ?: details.creationTime
                    if (!dateToShow.isNullOrBlank()) {
                        binding.layoutDatesRow.visibility = View.VISIBLE
                        binding.sheetEventDate.text = dateToShow
                    } else {
                        binding.layoutDatesRow.visibility = View.GONE
                    }

                    // Payment status
                    if (details.isPaymentDone) {
                        val mode = details.paymentMode ?: "Espèces / Carte"
                        binding.sheetPaymentStatus.text = "✔ Encaissé ($mode)"
                        binding.sheetPaymentStatus.setTextColor(requireContext().getColor(R.color.status_finished_text))
                    } else {
                        binding.sheetPaymentStatus.text = "En attente d'encaissement"
                        binding.sheetPaymentStatus.setTextColor(requireContext().getColor(R.color.status_transit_text))
                    }

                    // Google Maps location action
                    if (details.latitude != null && details.longitude != null && details.latitude != 0.0 && details.longitude != 0.0) {
                        binding.btnOpenGoogleMaps.visibility = View.VISIBLE
                        binding.btnOpenGoogleMaps.setOnClickListener {
                            val uri = Uri.parse("geo:${details.latitude},${details.longitude}?q=${details.latitude},${details.longitude}(Colis ${details.referenceNumber})")
                            val mapIntent = Intent(Intent.ACTION_VIEW, uri).apply {
                                setPackage("com.google.android.apps.maps")
                            }
                            try {
                                startActivity(mapIntent)
                            } catch (_: Exception) {
                                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/maps/search/?api=1&query=${details.latitude},${details.longitude}")))
                            }
                        }
                    } else {
                        binding.btnOpenGoogleMaps.visibility = View.GONE
                    }

                    // POC Photo action
                    if (!details.pocImageUrl.isNullOrBlank()) {
                        binding.btnOpenPocPhoto.visibility = View.VISIBLE
                        binding.btnOpenPocPhoto.setOnClickListener {
                            val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse(details.pocImageUrl))
                            startActivity(browserIntent)
                        }
                    } else {
                        binding.btnOpenPocPhoto.visibility = View.GONE
                    }
                }
            }
        }
    }

    private fun copyToClipboard(text: String, label: String) {
        val clipboard = requireContext().getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText("consignment_code", text)
        clipboard.setPrimaryClip(clip)
        Toast.makeText(requireContext(), "$label : $text", Toast.LENGTH_SHORT).show()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    companion object {
        const val TAG = "ConsignmentDetailBottomSheet"
        private const val ARG_PARCEL = "arg_parcel"
        private const val ARG_REF_NUMBER = "arg_ref_number"
        private const val ARG_RIDER_NAME = "arg_rider_name"
        private const val ARG_TRIP_REF = "arg_trip_ref"

        fun newInstance(
            parcel: ParcelDetail,
            riderName: String? = null,
            tripRef: String? = null
        ): ConsignmentDetailBottomSheet {
            return ConsignmentDetailBottomSheet().apply {
                arguments = Bundle().apply {
                    putSerializable(ARG_PARCEL, parcel)
                    putString(ARG_RIDER_NAME, riderName)
                    putString(ARG_TRIP_REF, tripRef)
                }
            }
        }

        fun newInstance(
            referenceNumber: String,
            riderName: String? = null,
            tripRef: String? = null
        ): ConsignmentDetailBottomSheet {
            return ConsignmentDetailBottomSheet().apply {
                arguments = Bundle().apply {
                    putString(ARG_REF_NUMBER, referenceNumber)
                    putString(ARG_RIDER_NAME, riderName)
                    putString(ARG_TRIP_REF, tripRef)
                }
            }
        }
    }
}
