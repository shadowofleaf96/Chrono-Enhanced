package com.chrono.mohammedia.ui.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.chrono.mohammedia.R
import com.chrono.mohammedia.data.model.RiderItem
import com.chrono.mohammedia.data.model.TripStatus
import com.chrono.mohammedia.databinding.ItemRiderCardBinding
import com.chrono.mohammedia.util.setupDoubleTapAmountCopy
import java.util.Locale

class RiderAdapter(
    private val onRiderClick: (RiderItem) -> Unit,
    private val onReconcileClick: ((RiderItem) -> Unit)? = null
) : ListAdapter<RiderItem, RiderAdapter.RiderViewHolder>(RiderDiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RiderViewHolder {
        val binding = ItemRiderCardBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false
        )
        return RiderViewHolder(binding, onRiderClick, onReconcileClick)
    }

    override fun onBindViewHolder(holder: RiderViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    class RiderViewHolder(
        private val binding: ItemRiderCardBinding,
        private val onRiderClick: (RiderItem) -> Unit,
        private val onReconcileClick: ((RiderItem) -> Unit)? = null
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(item: RiderItem) {
            val context = binding.root.context

            // Initials avatar
            val initials = item.name.split(" ")
                .filter { it.isNotBlank() }
                .take(2)
                .map { it.first().uppercaseChar() }
                .joinToString("")
            binding.textRiderAvatar.text = if (initials.isNotEmpty()) initials else "R"

            // Rider Name & Code
            binding.textRiderName.text = item.name
            binding.textRiderCode.text = item.code

            // Reconciled by info
            binding.textReconciledTag.visibility = View.VISIBLE
            if (item.isReconciled) {
                val by = if (!item.reconciledBy.isNullOrBlank()) "par: ${item.reconciledBy}" else "validé"
                binding.textReconciledTag.text = "• Réglé ($by)"
                binding.textReconciledTag.setTextColor(ContextCompat.getColor(context, R.color.status_finished_text))
            } else {
                binding.textReconciledTag.text = "• Non réglé"
                binding.textReconciledTag.setTextColor(ContextCompat.getColor(context, R.color.text_muted))
            }

            // Trip Completion Status Badge (Finished vs Ongoing)
            if (item.isTripFinished) {
                binding.layoutTripStatus.background = ContextCompat.getDrawable(context, R.drawable.bg_badge_finished)
                binding.imgTripStatusIcon.setImageResource(R.drawable.ic_done_all)
                binding.textTripStatus.text = context.getString(R.string.status_trip_finished)
                binding.textTripStatus.setTextColor(ContextCompat.getColor(context, R.color.status_finished_text))
            } else if (item.tripStatus == TripStatus.IN_TRANSIT) {
                binding.layoutTripStatus.background = ContextCompat.getDrawable(context, R.drawable.bg_badge_transit)
                binding.imgTripStatusIcon.setImageResource(R.drawable.ic_in_transit)
                binding.textTripStatus.text = context.getString(R.string.status_in_transit)
                binding.textTripStatus.setTextColor(ContextCompat.getColor(context, R.color.status_transit_text))
            } else {
                binding.layoutTripStatus.background = ContextCompat.getDrawable(context, R.drawable.bg_badge_code)
                binding.imgTripStatusIcon.setImageResource(R.drawable.ic_rider)
                binding.textTripStatus.text = context.getString(R.string.status_not_started)
                binding.textTripStatus.setTextColor(ContextCompat.getColor(context, R.color.text_secondary))
            }

            // Amount to Pay / Settle (MAD)
            binding.textAmountDue.text = String.format(Locale.FRENCH, "%,.2f MAD", item.amountToPay)
            binding.textAmountDue.setupDoubleTapAmountCopy({ item.amountToPay })

            // Parcels Delivered
            binding.textDeliveredCount.text = "✔ ${item.deliveredCount} Livrés"

            // Parcels Undelivered
            if (item.undeliveredCount > 0) {
                binding.pillUndelivered.visibility = View.VISIBLE
                binding.pillUndelivered.background = ContextCompat.getDrawable(context, R.drawable.bg_badge_code)
                binding.textUndeliveredCount.text = "✖ ${item.undeliveredCount} Non-livrés"
                binding.textUndeliveredCount.setTextColor(ContextCompat.getColor(context, R.color.status_undelivered))
            } else {
                binding.pillUndelivered.visibility = View.VISIBLE
                binding.pillUndelivered.background = ContextCompat.getDrawable(context, R.drawable.bg_badge_code)
                binding.textUndeliveredCount.text = "0 Non-livré"
                binding.textUndeliveredCount.setTextColor(ContextCompat.getColor(context, R.color.text_muted))
            }

            // Progress Bar & Total Caption
            binding.progressDeliveryRate.progress = item.successRatePercent
            binding.textTotalParcelsCaption.text = "${item.totalParcels} colis au total • Succès: ${item.successRatePercent}%"

            // Item Click
            val clickListener = View.OnClickListener {
                onRiderClick(item)
            }
            binding.cardRider.setOnClickListener(clickListener)
            binding.root.setOnClickListener(clickListener)
            binding.btnViewDetails.setOnClickListener(clickListener)

            // Reconcile Button state (grey out and disable if already reconciled)
            if (item.isReconciled) {
                binding.btnReconcileRiderCard.isEnabled = false
                binding.btnReconcileRiderCard.alpha = 0.45f
                binding.btnReconcileRiderCard.text = "Réconcilié"
                binding.btnReconcileRiderCard.setIconResource(R.drawable.ic_done_all)
                binding.btnReconcileRiderCard.setOnClickListener(null)
            } else {
                binding.btnReconcileRiderCard.isEnabled = true
                binding.btnReconcileRiderCard.alpha = 1.0f
                binding.btnReconcileRiderCard.text = "Réconcilier"
                binding.btnReconcileRiderCard.setIconResource(R.drawable.ic_scan_barcode)
                binding.btnReconcileRiderCard.setOnClickListener {
                    if (onReconcileClick != null) {
                        onReconcileClick.invoke(item)
                    } else {
                        onRiderClick(item)
                    }
                }
            }
        }
    }

    private class RiderDiffCallback : DiffUtil.ItemCallback<RiderItem>() {
        override fun areItemsTheSame(oldItem: RiderItem, newItem: RiderItem): Boolean {
            return oldItem.id == newItem.id
        }

        override fun areContentsTheSame(oldItem: RiderItem, newItem: RiderItem): Boolean {
            return oldItem == newItem
        }
    }
}
