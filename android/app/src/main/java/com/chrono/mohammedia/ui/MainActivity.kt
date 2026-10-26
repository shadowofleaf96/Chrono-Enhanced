package com.chrono.mohammedia.ui

import android.content.Intent
import android.os.Bundle
import android.view.MenuItem
import android.widget.Toast
import androidx.activity.viewModels
import androidx.appcompat.app.ActionBarDrawerToggle
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.GravityCompat
import com.chrono.mohammedia.R
import com.chrono.mohammedia.data.model.FilterType
import com.chrono.mohammedia.databinding.ActivityMainBinding
import com.chrono.mohammedia.ui.login.LoginActivity
import com.chrono.mohammedia.ui.riders.RidersFragment
import com.chrono.mohammedia.ui.riders.RidersViewModel
import com.google.android.material.navigation.NavigationView

class MainActivity : AppCompatActivity(), NavigationView.OnNavigationItemSelectedListener {

    private lateinit var binding: ActivityMainBinding
    private val viewModel: RidersViewModel by viewModels()
    private var ridersFragment: RidersFragment? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val repo = viewModel.repository
        repo.loadPreferences(this)

        if (!repo.hasValidSavedSession()) {
            val intent = LoginActivity.createIntent(this, forceLogin = false).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            }
            startActivity(intent)
            finish()
            return
        }

        setupToolbar()
        setupDrawer()

        if (savedInstanceState == null) {
            showRidersFragment(FilterType.ALL)
        }
    }

    private fun setupToolbar() {
        setSupportActionBar(binding.toolbar)
        binding.toolbar.inflateMenu(R.menu.menu_top_app_bar)
        binding.toolbar.setOnMenuItemClickListener { item ->
            when (item.itemId) {
                R.id.action_scan_parcels -> {
                    showHubScanFragment()
                    true
                }
                R.id.action_search_consignment -> {
                    showConsignmentLookupFragment()
                    true
                }
                R.id.action_refresh -> {
                    viewModel.refresh()
                    Toast.makeText(this, "Actualisation des données en cours...", Toast.LENGTH_SHORT).show()
                    true
                }
                R.id.action_settings -> {
                    showSettingsFragment()
                    true
                }
                R.id.action_switch_marjane -> {
                    startActivity(Intent(this, com.chrono.mohammedia.ui.marjane.MarjaneMallActivity::class.java))
                    true
                }
                else -> false
            }
        }
    }

    private fun setupDrawer() {
        val toggle = ActionBarDrawerToggle(
            this,
            binding.drawerLayout,
            binding.toolbar,
            R.string.menu_all_riders,
            R.string.btn_close
        )
        binding.drawerLayout.addDrawerListener(toggle)
        toggle.syncState()

        binding.navView.setNavigationItemSelectedListener(this)
    }

    override fun onNavigationItemSelected(item: MenuItem): Boolean {
        when (item.itemId) {
            R.id.nav_all_riders -> {
                showRidersFragment(FilterType.ALL)
                binding.toolbar.title = getString(R.string.app_name)
                binding.toolbar.subtitle = getString(R.string.hub_title)
            }
            R.id.nav_finished_trips -> {
                showRidersFragment(FilterType.FINISHED_TRIPS)
                binding.toolbar.title = "Courses Terminées"
                binding.toolbar.subtitle = "Livreurs ayant fini leur tournée (✔)"
            }
            R.id.nav_settlements -> {
                showRidersFragment(FilterType.HAS_DUE)
                binding.toolbar.title = "Règlements & Montants"
                binding.toolbar.subtitle = "Montants à encaisser / régler (MAD)"
            }
            R.id.nav_undelivered -> {
                showRidersFragment(FilterType.HAS_UNDELIVERED)
                binding.toolbar.title = "Colis Non Livrés"
                binding.toolbar.subtitle = "Suivi des échecs et reports"
            }
            R.id.nav_lookup_consignment -> {
                showConsignmentLookupFragment()
            }
            R.id.nav_hub_scan -> {
                showHubScanFragment()
            }
            R.id.nav_marjane_mall -> {
                val intent = Intent(this, com.chrono.mohammedia.ui.marjane.MarjaneMallActivity::class.java)
                startActivity(intent)
            }
            R.id.nav_portal_selector -> {
                val intent = com.chrono.mohammedia.ui.portal.PortalSelectorActivity.createIntent(this, forceSelector = true)
                startActivity(intent)
            }
            R.id.nav_settings -> {
                showSettingsFragment()
            }
            R.id.nav_sync -> {
                viewModel.refresh()
                Toast.makeText(this, "Données actualisées", Toast.LENGTH_SHORT).show()
            }
            R.id.nav_logout -> {
                viewModel.repository.logout(this)
                val intent = LoginActivity.createIntent(this, forceLogin = true).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                }
                startActivity(intent)
                finish()
            }
        }

        binding.drawerLayout.closeDrawer(GravityCompat.START)
        return true
    }

    fun showHubScanFragment(initialMode: com.chrono.mohammedia.data.model.HubScanMode = com.chrono.mohammedia.data.model.HubScanMode.INSCAN) {
        val currentFragment = supportFragmentManager.findFragmentById(R.id.fragment_container)
        if (currentFragment !is com.chrono.mohammedia.ui.consignments.HubScanFragment) {
            supportFragmentManager.beginTransaction()
                .replace(R.id.fragment_container, com.chrono.mohammedia.ui.consignments.HubScanFragment.newInstance(initialMode))
                .addToBackStack("hub_scan")
                .commit()
            binding.toolbar.title = "Scanner les Colis"
            binding.toolbar.subtitle = "Inscan • Outscan • Arrival"
        }
    }

    fun showSettingsFragment() {
        val currentFragment = supportFragmentManager.findFragmentById(R.id.fragment_container)
        if (currentFragment !is com.chrono.mohammedia.ui.settings.SettingsFragment) {
            supportFragmentManager.beginTransaction()
                .replace(R.id.fragment_container, com.chrono.mohammedia.ui.settings.SettingsFragment.newInstance())
                .addToBackStack("settings")
                .commit()
            binding.toolbar.title = getString(R.string.menu_settings)
            binding.toolbar.subtitle = "Hub Mohammedia • Shipsy Session"
        }
    }

    fun showConsignmentLookupFragment(initialCode: String? = null) {
        val currentFragment = supportFragmentManager.findFragmentById(R.id.fragment_container)
        if (currentFragment !is com.chrono.mohammedia.ui.consignments.ConsignmentLookupFragment) {
            supportFragmentManager.beginTransaction()
                .replace(R.id.fragment_container, com.chrono.mohammedia.ui.consignments.ConsignmentLookupFragment.newInstance(initialCode))
                .addToBackStack("lookup")
                .commit()
            binding.toolbar.title = "Recherche Colis"
            binding.toolbar.subtitle = "Suivi en direct Shipsy"
        }
    }


    private fun showRidersFragment(filter: FilterType) {
        val currentFragment = supportFragmentManager.findFragmentById(R.id.fragment_container)

        if (currentFragment !is RidersFragment) {
            val fragment = RidersFragment.newInstance(filter)
            ridersFragment = fragment
            supportFragmentManager.beginTransaction()
                .replace(R.id.fragment_container, fragment)
                .commit()
        } else {
            currentFragment.applyFilterFromMenu(filter)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (binding.drawerLayout.isDrawerOpen(GravityCompat.START)) {
            binding.drawerLayout.closeDrawer(GravityCompat.START)
        } else {
            super.onBackPressed()
            // Restore title if returned to riders
            val currentFragment = supportFragmentManager.findFragmentById(R.id.fragment_container)
            if (currentFragment is RidersFragment) {
                binding.toolbar.title = getString(R.string.app_name)
                binding.toolbar.subtitle = getString(R.string.hub_title)
            }
        }
    }
}
