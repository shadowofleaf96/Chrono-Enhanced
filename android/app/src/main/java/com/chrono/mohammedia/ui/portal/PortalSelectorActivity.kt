package com.chrono.mohammedia.ui.portal

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.chrono.mohammedia.databinding.ActivityPortalSelectorBinding
import com.chrono.mohammedia.ui.chrono.ChronoWebActivity
import com.chrono.mohammedia.ui.marjane.MarjaneMallActivity

class PortalSelectorActivity : AppCompatActivity() {

    private lateinit var binding: ActivityPortalSelectorBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val forceSelector = intent.getBooleanExtra(EXTRA_FORCE_SELECTOR, false)
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val defaultPortal = prefs.getString(KEY_DEFAULT_PORTAL, null)

        // Auto-launch saved portal unless forced to show selector
        if (!forceSelector && !defaultPortal.isNullOrBlank()) {
            when (defaultPortal) {
                PORTAL_CHRONO  -> { launchChrono(clearTask = true); return }
                PORTAL_MARJANE -> { launchMarjane(clearTask = true); return }
            }
        }

        binding = ActivityPortalSelectorBinding.inflate(layoutInflater)
        setContentView(binding.root)
        binding.cbRememberChoice.isChecked = !defaultPortal.isNullOrBlank()
        setupListeners()
    }

    private fun setupListeners() {
        binding.cardChrono.setOnClickListener       { handleChoice(PORTAL_CHRONO) }
        binding.btnLaunchChrono.setOnClickListener  { handleChoice(PORTAL_CHRONO) }
        binding.cardMarjane.setOnClickListener      { handleChoice(PORTAL_MARJANE) }
        binding.btnLaunchMarjane.setOnClickListener { handleChoice(PORTAL_MARJANE) }
    }

    private fun handleChoice(portal: String) {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (binding.cbRememberChoice.isChecked) {
            prefs.edit().putString(KEY_DEFAULT_PORTAL, portal).apply()
        } else {
            prefs.edit().remove(KEY_DEFAULT_PORTAL).apply()
        }
        when (portal) {
            PORTAL_CHRONO  -> launchChrono(clearTask = false)
            PORTAL_MARJANE -> launchMarjane(clearTask = false)
        }
    }

    private fun launchChrono(clearTask: Boolean) {
        val intent = Intent(this, ChronoWebActivity::class.java)
        intent.flags = if (clearTask)
            Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        else
            Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        startActivity(intent)
        finish()
    }

    private fun launchMarjane(clearTask: Boolean) {
        val intent = Intent(this, MarjaneMallActivity::class.java)
        intent.flags = if (clearTask)
            Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        else
            Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        startActivity(intent)
        finish()
    }

    companion object {
        const val PREFS_NAME          = "hub_portal_prefs"
        const val KEY_DEFAULT_PORTAL  = "key_default_portal"
        const val PORTAL_CHRONO       = "chrono"
        const val PORTAL_MARJANE      = "marjane"
        const val EXTRA_FORCE_SELECTOR = "extra_force_selector"

        fun createIntent(context: Context, forceSelector: Boolean = true): Intent =
            Intent(context, PortalSelectorActivity::class.java).apply {
                putExtra(EXTRA_FORCE_SELECTOR, forceSelector)
            }
    }
}
