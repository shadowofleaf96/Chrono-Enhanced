package com.chrono.mohammedia.ui.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.chrono.mohammedia.R
import com.chrono.mohammedia.data.model.ParcelDetail
import com.chrono.mohammedia.data.model.ParcelStatus
import com.chrono.mohammedia.databinding.ItemParcelDetailBinding
import com.chrono.mohammedia.util.setupDoubleTapAmountCopy
import java.util.Locale

class ParcelAdapter(
    private val onParcelClick: ((ParcelDetail) -> Unit)? = null
) : ListAdapter<ParcelDetail, ParcelAdapter.ParcelViewHolder>(ParcelDiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ParcelViewHolder {
        val binding = ItemParcelDetailBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false
        )
        return ParcelViewHolder(binding, onParcelClick)
    }

    override fun onBindViewHolder(holder: ParcelViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    class ParcelViewHolder(
        private val binding: ItemParcelDetailBinding,
        private val onParcelClick: ((ParcelDetail) -> Unit)?
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(item: ParcelDetail) {
            val context = binding.root.context
            binding.textParcelCn.text = item.referenceNumber

            val infoText = when {
                !item.failureReason.isNullOrBlank() -> item.failureReason
                !item.recipientName.isNullOrBlank() && !item.address.isNullOrBlank() -> "${item.recipientName} • ${item.address}"
                !item.recipientName.isNullOrBlank() -> item.recipientName
                else -> item.createdAt ?: "Colis traité"
            }
            binding.textParcelReasonOrCustomer.text = infoText

            if (item.amount > 0) {
                binding.textParcelAmount.text = String.format(Locale.FRENCH, "%,.2f MAD", item.amount)
            } else {
                binding.textParcelAmount.text = "- MAD"
            }

            binding.textParcelAmount.setupDoubleTapAmountCopy({ item.amount })

            if (item.status == ParcelStatus.DELIVERED || item.status == ParcelStatus.PICKED_UP) {
                binding.textParcelStatusTag.text = "✔ Livré"
                binding.textParcelStatusTag.setTextColor(ContextCompat.getColor(context, R.color.status_finished_text))
            } else {
                binding.textParcelStatusTag.text = "✖ Non-livré"
                binding.textParcelStatusTag.setTextColor(ContextCompat.getColor(context, R.color.status_undelivered))
            }

            val copyAction = {
                val clipboard = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as? android.content.ClipboardManager
                val clip = android.content.ClipData.newPlainText("Code Colis", item.referenceNumber)
                clipboard?.setPrimaryClip(clip)
                android.widget.Toast.makeText(context, "📋 Code ${item.referenceNumber} copié !", android.widget.Toast.LENGTH_SHORT).show()
            }

            val openAction = {
                onParcelClick?.invoke(item)
            }

            binding.btnCopyParcelCn.setOnClickListener { copyAction() }
            binding.btnOpenConsignment.setOnClickListener { openAction() }
            binding.root.setOnClickListener { openAction() }
        }
    }

    private class ParcelDiffCallback : DiffUtil.ItemCallback<ParcelDetail>() {
        override fun areItemsTheSame(oldItem: ParcelDetail, newItem: ParcelDetail): Boolean {
            return oldItem.id == newItem.id
        }

        override fun areContentsTheSame(oldItem: ParcelDetail, newItem: ParcelDetail): Boolean {
            return oldItem == newItem
        }
    }
}
