package com.chrono.mohammedia.util

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.View
import android.widget.Toast
import java.util.Locale

/**
 * Attaches a double-click (two taps within [intervalMs]) listener to any View.
 */
fun View.setOnDoubleClickListener(intervalMs: Long = 400L, onDoubleClick: (View) -> Unit) {
    var lastClickTime = 0L
    setOnClickListener { v ->
        val now = System.currentTimeMillis()
        if (now - lastClickTime <= intervalMs) {
            lastClickTime = 0L
            onDoubleClick(v)
        } else {
            lastClickTime = now
        }
    }
}

/**
 * Copies an amount to the clipboard and gives subtle tactile and visual feedback.
 */
fun Context.copyAmountToClipboard(amount: Double?, fallbackText: String? = null) {
    val cleanText = when {
        amount != null && amount > 0.0 -> {
            if (amount % 1.0 == 0.0) {
                String.format(Locale.US, "%.0f", amount)
            } else {
                String.format(Locale.US, "%.2f", amount)
            }
        }
        !fallbackText.isNullOrBlank() -> {
            fallbackText.replace("MAD", "", ignoreCase = true)
                .replace("DH", "", ignoreCase = true)
                .replace(" ", "")
                .replace("\u00A0", "")
                .trim()
        }
        else -> "0"
    }

    val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
    val clip = ClipData.newPlainText("Montant", cleanText)
    clipboard?.setPrimaryClip(clip)

    // Gentle haptic feedback
    try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            vibratorManager?.defaultVibrator?.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK))
        } else {
            @Suppress("DEPRECATION")
            val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createOneShot(35, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(35)
            }
        }
    } catch (_: Exception) {}

    Toast.makeText(this, "📋 Montant copié : $cleanText MAD", Toast.LENGTH_SHORT).show()
}

/**
 * Convenience helper to attach double-click-to-copy on amount views.
 */
fun View.setupDoubleTapAmountCopy(getAmount: () -> Double?, fallbackText: (() -> String?)? = null) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        tooltipText = "Double-cliquez pour copier le montant"
    }
    setOnDoubleClickListener {
        context.copyAmountToClipboard(getAmount(), fallbackText?.invoke())
    }
}
