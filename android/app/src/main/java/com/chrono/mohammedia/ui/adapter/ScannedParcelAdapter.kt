package com.chrono.mohammedia.ui.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.chrono.mohammedia.R
import com.chrono.mohammedia.data.model.ScannedItemStatus
import com.chrono.mohammedia.data.model.ScannedParcelItem
import com.chrono.mohammedia.databinding.ItemScannedParcelBinding
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class ScannedParcelAdapter(
    private val onItemClick: ((ScannedParcelItem) -> Unit)? = null,
    private val onDeleteClick: (ScannedParcelItem) -> Unit
) : ListAdapter<ScannedParcelItem, ScannedParcelAdapter.ScannedParcelViewHolder>(ScannedDiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ScannedParcelViewHolder {
        val binding = ItemScannedParcelBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false
        )
        return ScannedParcelViewHolder(binding, onItemClick, onDeleteClick)
    }

    override fun onBindViewHolder(holder: ScannedParcelViewHolder, position: Int) {
        val totalCount = itemCount
        holder.bind(getItem(position), position, totalCount)
    }

    class ScannedParcelViewHolder(
        private val binding: ItemScannedParcelBinding,
        private val onItemClick: ((ScannedParcelItem) -> Unit)?,
        private val onDeleteClick: (ScannedParcelItem) -> Unit
    ) : RecyclerView.ViewHolder(binding.root) {

        private val timeFormat = SimpleDateFormat("HH:mm:ss", Locale.getDefault())

        fun bind(item: ScannedParcelItem, position: Int, totalCount: Int) {
            val context = binding.root.context
            binding.textScannedCode.text = item.code

            // Loading indicator for background details fetch
            binding.progressItemLoading.visibility = if (item.isLoadingDetails) View.VISIBLE else View.GONE

            // 1. Latest Status & Date Badge
            val status = item.latestStatus
            val statusDate = item.latestStatusDate
            if (!status.isNullOrBlank()) {
                binding.layoutLatestStatus.visibility = View.VISIBLE
                val raw = status.uppercase(Locale.ROOT)

                val isDelivered = raw == "DELIVERED" || 
                                    raw == "LIVRÉ" || 
                                    raw == "LIVRE" || 
                                    (raw.contains("DELIVER") && !raw.contains("UNDELIVER")) || 
                                    (raw.contains("LIVR") && !raw.contains("NON"))

                val isHub = raw.contains("REACH") || raw.contains("HUB") || raw.contains("ARRIV") || raw.contains("INSCAN")

                val isUndelivered = !isDelivered && !isHub && (
                    raw.contains("UNDELIVER") || 
                    raw.contains("NON LIVR") || 
                    raw.contains("NON_LIVR") || 
                    raw.contains("FAIL") || 
                    raw.contains("ÉCHOU") || 
                    raw.contains("ECHOU") || 
                    raw.contains("ATTEMPT") || 
                    raw.contains("CANCEL") || 
                    raw.contains("REFUS")
                )

                when {
                    isDelivered -> {
                        val textToShow = if (status.startsWith("✔")) status else "✔ $status"
                        binding.badgeLatestStatus.text = textToShow
                        binding.badgeLatestStatus.setBackgroundResource(R.drawable.bg_badge_finished)
                        binding.badgeLatestStatus.backgroundTintList = null
                        binding.badgeLatestStatus.setTextColor(ContextCompat.getColor(context, R.color.status_finished_text))
                    }
                    isHub -> {
                        val textToShow = if (status.startsWith("🏢")) status else "🏢 $status"
                        binding.badgeLatestStatus.text = textToShow
                        binding.badgeLatestStatus.setBackgroundResource(R.drawable.bg_badge_transit)
                        binding.badgeLatestStatus.backgroundTintList = ContextCompat.getColorStateList(context, R.color.badge_blue_bg)
                        binding.badgeLatestStatus.setTextColor(ContextCompat.getColor(context, R.color.badge_blue_text))
                    }
                    isUndelivered -> {
                        val textToShow = if (status.startsWith("✖")) status else "✖ $status"
                        binding.badgeLatestStatus.text = textToShow
                        binding.badgeLatestStatus.setBackgroundResource(R.drawable.bg_badge_amount)
                        binding.badgeLatestStatus.backgroundTintList = ContextCompat.getColorStateList(context, R.color.status_undelivered_bg)
                        binding.badgeLatestStatus.setTextColor(ContextCompat.getColor(context, R.color.status_undelivered_text))
                    }
                    raw.contains("OFD") || raw.contains("LIVRAISON") || raw.contains("TRANSIT") || raw.contains("ACCEPT") || raw.contains("OUTSCAN") -> {
                        val textToShow = if (status.startsWith("🚚")) status else "🚚 $status"
                        binding.badgeLatestStatus.text = textToShow
                        binding.badgeLatestStatus.setBackgroundResource(R.drawable.bg_badge_transit)
                        binding.badgeLatestStatus.backgroundTintList = null
                        binding.badgeLatestStatus.setTextColor(ContextCompat.getColor(context, R.color.status_transit_text))
                    }
                    else -> {
                        val textToShow = if (status.startsWith("●")) status else "● $status"
                        binding.badgeLatestStatus.text = textToShow
                        binding.badgeLatestStatus.setBackgroundResource(R.drawable.bg_badge_transit)
                        binding.badgeLatestStatus.backgroundTintList = null
                        binding.badgeLatestStatus.setTextColor(ContextCompat.getColor(context, R.color.status_transit_text))
                    }
                }

                if (!statusDate.isNullOrBlank()) {
                    binding.textLatestStatusDate.text = "• $statusDate"
                    binding.textLatestStatusDate.visibility = View.VISIBLE
                } else {
                    binding.textLatestStatusDate.visibility = View.GONE
                }
            } else {
                binding.layoutLatestStatus.visibility = View.GONE
            }

            // 2. Scanned metadata (Index + Scanned time + Recipient)
            val timeStr = timeFormat.format(Date(item.scannedAt))
            val indexNum = totalCount - position
            val metaBuilder = StringBuilder("#$indexNum • $timeStr")
            if (!item.recipientName.isNullOrBlank()) {
                metaBuilder.append(" • ").append(item.recipientName)
            }
            binding.textScannedTimeMeta.text = metaBuilder.toString()
            
            // Attempt badge
            val attempts = item.attemptCount ?: 0
            if (attempts > 0) {
                binding.badgeAttempts.text = "$attempts tentative(s)"
                binding.badgeAttempts.visibility = View.VISIBLE
                binding.badgeAttempts.setTextColor(ContextCompat.getColor(context, R.color.status_undelivered))
            } else {
                binding.badgeAttempts.visibility = View.GONE
            }

            // 3. Batch action status icon
            when (item.status) {
                ScannedItemStatus.PENDING -> {
                    binding.imgItemStatus.setImageResource(R.drawable.ic_scan_barcode)
                    binding.imgItemStatus.setColorFilter(ContextCompat.getColor(context, R.color.chrono_primary))
                    binding.textScannedErrorMsg.visibility = View.GONE
                }
                ScannedItemStatus.SUCCESS -> {
                    binding.imgItemStatus.setImageResource(R.drawable.ic_check_circle)
                    binding.imgItemStatus.setColorFilter(ContextCompat.getColor(context, R.color.status_finished))
                    binding.textScannedErrorMsg.visibility = View.GONE
                }
                ScannedItemStatus.FAILED -> {
                    binding.imgItemStatus.setImageResource(R.drawable.ic_error_outline)
                    binding.imgItemStatus.setColorFilter(ContextCompat.getColor(context, R.color.status_undelivered))
                    if (!item.message.isNullOrBlank()) {
                        binding.textScannedErrorMsg.text = item.message
                        binding.textScannedErrorMsg.visibility = View.VISIBLE
                    } else {
                        binding.textScannedErrorMsg.visibility = View.GONE
                    }
                }
            }

            binding.root.setOnClickListener {
                onItemClick?.invoke(item)
            }

            binding.btnRemoveItem.setOnClickListener {
                onDeleteClick(item)
            }
        }
    }

    class ScannedDiffCallback : DiffUtil.ItemCallback<ScannedParcelItem>() {
        override fun areItemsTheSame(oldItem: ScannedParcelItem, newItem: ScannedParcelItem): Boolean {
            return oldItem.code == newItem.code
        }

        override fun areContentsTheSame(oldItem: ScannedParcelItem, newItem: ScannedParcelItem): Boolean {
            return oldItem == newItem
        }
    }
}
