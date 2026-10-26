package com.chrono.mohammedia.ui.riders

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.chrono.mohammedia.R
import com.chrono.mohammedia.data.model.ParcelDetail
import com.chrono.mohammedia.databinding.ItemReconcileParcelBinding
import java.util.Locale

data class ReconcileParcelUiModel(
    val parcel: ParcelDetail,
    val isScanned: Boolean
)

class ReconcileParcelAdapter(
    private val onToggleScan: (ParcelDetail, Boolean) -> Unit,
    private val onOpenDetails: (ParcelDetail) -> Unit
) : ListAdapter<ReconcileParcelUiModel, ReconcileParcelAdapter.ParcelViewHolder>(DiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ParcelViewHolder {
        val binding = ItemReconcileParcelBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false
        )
        return ParcelViewHolder(binding, onToggleScan, onOpenDetails)
    }

    override fun onBindViewHolder(holder: ParcelViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    class ParcelViewHolder(
        private val binding: ItemReconcileParcelBinding,
        private val onToggleScan: (ParcelDetail, Boolean) -> Unit,
        private val onOpenDetails: (ParcelDetail) -> Unit
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(model: ReconcileParcelUiModel) {
            val item = model.parcel
            val isScanned = model.isScanned
            val context = binding.root.context

            // 1. Reference Number & Copy
            binding.textParcelRef.text = item.referenceNumber
            binding.btnCopyRef.setOnClickListener {
                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                val clip = ClipData.newPlainText("consignment_code", item.referenceNumber)
                clipboard?.setPrimaryClip(clip)
                Toast.makeText(context, "Code ${item.referenceNumber} copié", Toast.LENGTH_SHORT).show()
            }

            // 2. Attempts Badge
            val attempts = when {
                item.attemptCount > 0 -> item.attemptCount
                !item.failureReason.isNullOrBlank() && !item.failureReason.equals("Non livré", ignoreCase = true) -> 1
                else -> 0
            }
            if (attempts > 0) {
                binding.badgeAttempts.visibility = View.VISIBLE
                val suffix = if (attempts > 1) "s" else ""
                binding.badgeAttempts.text = "$attempts tentative$suffix"
            } else {
                binding.badgeAttempts.visibility = View.GONE
            }

            // 3. Status Badge & Card Style based on scanned state
            if (isScanned) {
                // Scanned State
                binding.cardParcel.setCardBackgroundColor(ContextCompat.getColor(context, R.color.settlement_bg))
                binding.cardParcel.strokeColor = ContextCompat.getColor(context, R.color.settlement_border)
                binding.cardParcel.strokeWidth = 2

                binding.textStatusBadge.text = "✔ Scanné"
                binding.textStatusBadge.setBackgroundResource(R.drawable.bg_badge_finished)
                binding.textStatusBadge.backgroundTintList = null
                binding.textStatusBadge.setTextColor(ContextCompat.getColor(context, R.color.status_finished_text))

                binding.btnActionScan.visibility = View.GONE
                binding.btnActionUnscan.visibility = View.VISIBLE
                binding.btnActionUnscan.setOnClickListener {
                    onToggleScan(item, false)
                }
            } else {
                // Pending State
                binding.cardParcel.setCardBackgroundColor(ContextCompat.getColor(context, R.color.bg_card))
                binding.cardParcel.strokeColor = ContextCompat.getColor(context, R.color.divider_color)
                binding.cardParcel.strokeWidth = 1

                binding.textStatusBadge.text = "⏳ À scanner"
                binding.textStatusBadge.setBackgroundResource(R.drawable.bg_badge_amount)
                binding.textStatusBadge.backgroundTintList = ContextCompat.getColorStateList(context, R.color.status_undelivered_bg)
                binding.textStatusBadge.setTextColor(ContextCompat.getColor(context, R.color.status_undelivered_text))

                binding.btnActionScan.visibility = View.VISIBLE
                binding.btnActionUnscan.visibility = View.GONE
                binding.btnActionScan.setOnClickListener {
                    onToggleScan(item, true)
                }
            }

            // 4. Failure Reason
            val cleanReason = item.failureReason?.takeIf { !it.equals("Non livré", ignoreCase = true) && !it.equals("null", ignoreCase = true) }
            if (!cleanReason.isNullOrBlank()) {
                binding.layoutReason.visibility = View.VISIBLE
                binding.textFailureReason.text = cleanReason
            } else {
                binding.layoutReason.visibility = View.GONE
            }

            // 5. Recipient Name & Address
            binding.textRecipientName.text = item.recipientName?.takeIf { it.isNotBlank() } ?: "Destinataire standard"
            binding.textRecipientAddress.text = item.address?.takeIf { it.isNotBlank() } ?: "Adresse non renseignée"

            // 6. COD Amount
            if (item.amount > 0.0) {
                binding.textCodAmount.text = String.format(Locale.FRENCH, "%,.2f MAD", item.amount)
            } else {
                binding.textCodAmount.text = "0,00 MAD"
            }

            // 7. Open Details
            binding.btnOpenDetails.setOnClickListener {
                onOpenDetails(item)
            }
            binding.root.setOnClickListener {
                onOpenDetails(item)
            }
        }
    }

    private class DiffCallback : DiffUtil.ItemCallback<ReconcileParcelUiModel>() {
        override fun areItemsTheSame(oldItem: ReconcileParcelUiModel, newItem: ReconcileParcelUiModel): Boolean {
            return oldItem.parcel.referenceNumber == newItem.parcel.referenceNumber
        }

        override fun areContentsTheSame(oldItem: ReconcileParcelUiModel, newItem: ReconcileParcelUiModel): Boolean {
            return oldItem == newItem
        }
    }
}
