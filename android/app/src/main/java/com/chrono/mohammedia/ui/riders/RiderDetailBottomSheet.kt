package com.chrono.mohammedia.ui.riders

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import com.chrono.mohammedia.R
import com.chrono.mohammedia.data.model.RiderItem
import com.chrono.mohammedia.data.model.TripStatus
import com.chrono.mohammedia.databinding.BottomSheetRiderDetailBinding
import com.chrono.mohammedia.ui.adapter.ParcelAdapter
import com.chrono.mohammedia.util.setupDoubleTapAmountCopy
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import java.util.Locale

class RiderDetailBottomSheet(
    private val rider: RiderItem
) : BottomSheetDialogFragment() {

    private var _binding: BottomSheetRiderDetailBinding? = null
    private val binding get() = _binding!!
    private lateinit var parcelAdapter: ParcelAdapter
    private var showingDelivered = true

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = BottomSheetRiderDetailBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        setupHeader()
        setupParcelRecycler()
        setupListeners()
        updateParcelList()
    }

    private fun setupHeader() {
        val context = requireContext()

        binding.sheetRiderName.text = rider.name
        binding.sheetRiderCode.text = rider.code

        if (rider.isTripFinished) {
            binding.sheetTripStatus.background = ContextCompat.getDrawable(context, R.drawable.bg_badge_finished)
            binding.sheetTripStatus.text = getString(R.string.status_trip_finished)
            binding.sheetTripStatus.setTextColor(ContextCompat.getColor(context, R.color.status_finished_text))
        } else if (rider.tripStatus == TripStatus.IN_TRANSIT) {
            binding.sheetTripStatus.background = ContextCompat.getDrawable(context, R.drawable.bg_badge_transit)
            binding.sheetTripStatus.text = getString(R.string.status_in_transit)
            binding.sheetTripStatus.setTextColor(ContextCompat.getColor(context, R.color.status_transit_text))
        } else {
            binding.sheetTripStatus.background = ContextCompat.getDrawable(context, R.drawable.bg_badge_code)
            binding.sheetTripStatus.text = getString(R.string.status_not_started)
            binding.sheetTripStatus.setTextColor(ContextCompat.getColor(context, R.color.text_secondary))
        }

        binding.sheetAmountDue.text = String.format(Locale.FRENCH, "%,.2f MAD", rider.amountToPay)
        binding.sheetAmountDue.setupDoubleTapAmountCopy({ rider.amountToPay })

        val reconciledText = if (rider.isReconciled) {
            val by = if (!rider.reconciledBy.isNullOrBlank()) "par : ${rider.reconciledBy}" else "validé"
            "✔ Réconcilié $by • ${rider.totalParcels} colis au total"
        } else {
            "⏳ En attente de réconciliation • ${rider.totalParcels} colis au total"
        }
        binding.sheetReconciledInfo.text = reconciledText


        binding.btnFilterDelivered.text = "Colis Livrés (${rider.deliveredCount})"
        binding.btnFilterUndelivered.text = "Non Livrés (${rider.undeliveredCount})"
    }

    private fun setupParcelRecycler() {
        parcelAdapter = ParcelAdapter { parcel ->
            val sheet = ConsignmentDetailBottomSheet.newInstance(
                parcel = parcel,
                riderName = rider.name,
                tripRef = rider.code
            )
            sheet.show(parentFragmentManager, ConsignmentDetailBottomSheet.TAG)
        }
        binding.recyclerParcels.apply {
            layoutManager = LinearLayoutManager(requireContext())
            adapter = parcelAdapter
        }
    }

    private fun setupListeners() {
        binding.toggleParcelFilter.addOnButtonCheckedListener { _, checkedId, isChecked ->
            if (isChecked) {
                showingDelivered = (checkedId == R.id.btn_filter_delivered)
                updateParcelList()
            }
        }

        val copyTripAction = {
            val clipboard = requireContext().getSystemService(android.content.Context.CLIPBOARD_SERVICE) as? android.content.ClipboardManager
            val clip = android.content.ClipData.newPlainText("N° Trip", rider.code)
            clipboard?.setPrimaryClip(clip)
            android.widget.Toast.makeText(requireContext(), "📋 N° Trip ${rider.code} copié !", android.widget.Toast.LENGTH_SHORT).show()
        }
        binding.btnCopyRiderCode.setOnClickListener { copyTripAction() }
        binding.sheetRiderCode.setOnClickListener { copyTripAction() }

        binding.btnCallRider.setOnClickListener {
            val phone = rider.phone.replace(" ", "")
            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
            startActivity(intent)
        }

        if (rider.isReconciled) {
            binding.btnReconcileRider.isEnabled = false
            binding.btnReconcileRider.alpha = 0.45f
            binding.btnReconcileRider.text = "Circuit Déjà Réconcilié"
            binding.btnReconcileRider.setIconResource(R.drawable.ic_done_all)
        } else {
            binding.btnReconcileRider.isEnabled = true
            binding.btnReconcileRider.alpha = 1.0f
            binding.btnReconcileRider.text = "Réconcilier le livreur"
            binding.btnReconcileRider.setIconResource(R.drawable.ic_scan_barcode)
            binding.btnReconcileRider.setOnClickListener {
                dismiss()
                val intent = RiderReconciliationActivity.createIntent(requireContext(), rider)
                startActivity(intent)
            }
        }

        binding.btnCloseSheet.setOnClickListener {
            dismiss()
        }
    }

    private fun updateParcelList() {
        val list = if (showingDelivered) rider.deliveredParcels else rider.undeliveredParcels
        parcelAdapter.submitList(list)

        if (list.isEmpty()) {
            binding.recyclerParcels.visibility = View.GONE
            binding.textEmptyParcels.visibility = View.VISIBLE
            binding.textEmptyParcels.text = if (showingDelivered) {
                "Aucun colis livré pour ce livreur"
            } else {
                "Tous les colis ont été livrés avec succès ! (0 non-livré)"
            }
        } else {
            binding.recyclerParcels.visibility = View.VISIBLE
            binding.textEmptyParcels.visibility = View.GONE
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    companion object {
        const val TAG = "RiderDetailBottomSheet"
    }
}
