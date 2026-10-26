package com.chrono.mohammedia.ui.riders

import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.recyclerview.widget.LinearLayoutManager
import com.chrono.mohammedia.R
import com.chrono.mohammedia.data.model.FilterType
import com.chrono.mohammedia.data.model.RiderItem
import com.chrono.mohammedia.databinding.FragmentRidersBinding
import com.chrono.mohammedia.ui.adapter.RiderAdapter
import java.util.Locale

class RidersFragment : Fragment() {

    private var _binding: FragmentRidersBinding? = null
    private val binding get() = _binding!!

    private val viewModel: RidersViewModel by activityViewModels()
    private lateinit var riderAdapter: RiderAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val filterName = arguments?.getString(ARG_FILTER)
        val initialFilter = filterName?.let { runCatching { FilterType.valueOf(it) }.getOrNull() }
        if (initialFilter != null) {
            viewModel.setFilter(initialFilter)
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentRidersBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        setupRecyclerView()
        setupSearch()
        setupFilterChips()
        setupSwipeRefresh()
        setupEmptyStateActions()
        observeViewModel()
    }

    private fun setupEmptyStateActions() {
        binding.btnEmptyRetry.setOnClickListener {
            viewModel.refresh()
        }
        binding.btnEmptySettings.setOnClickListener {
            val intent = com.chrono.mohammedia.ui.login.LoginActivity.createIntent(requireContext(), forceLogin = true).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            }
            startActivity(intent)
            activity?.finish()
        }
    }

    private fun setupRecyclerView() {
        riderAdapter = RiderAdapter(
            onRiderClick = { rider ->
                showRiderDetails(rider)
            },
            onReconcileClick = { rider ->
                startActivity(RiderReconciliationActivity.createIntent(requireContext(), rider))
            }
        )

        binding.recyclerRiders.apply {
            layoutManager = LinearLayoutManager(requireContext())
            adapter = riderAdapter
        }
    }

    private fun setupSearch() {
        binding.editSearch.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                val query = s?.toString().orEmpty()
                binding.btnClearSearch.visibility = if (query.isNotEmpty()) View.VISIBLE else View.GONE
                viewModel.setSearchQuery(query)
            }
            override fun afterTextChanged(s: Editable?) {}
        })

        binding.btnClearSearch.setOnClickListener {
            binding.editSearch.text?.clear()
        }
    }

    private fun setupFilterChips() {
        binding.chipGroupFilters.setOnCheckedStateChangeListener { _, checkedIds ->
            val filter = when (checkedIds.firstOrNull()) {
                R.id.chip_finished -> FilterType.FINISHED_TRIPS
                R.id.chip_in_transit -> FilterType.IN_TRANSIT
                R.id.chip_has_due -> FilterType.HAS_DUE
                R.id.chip_undelivered -> FilterType.HAS_UNDELIVERED
                else -> FilterType.ALL
            }
            viewModel.setFilter(filter)
        }
    }

    fun applyFilterFromMenu(filter: FilterType) {
        viewModel.setFilter(filter)
        _binding?.let { binding ->
            val chipId = when (filter) {
                FilterType.ALL -> R.id.chip_all
                FilterType.FINISHED_TRIPS -> R.id.chip_finished
                FilterType.IN_TRANSIT -> R.id.chip_in_transit
                FilterType.HAS_DUE -> R.id.chip_has_due
                FilterType.HAS_UNDELIVERED -> R.id.chip_undelivered
            }
            if (binding.chipGroupFilters.checkedChipId != chipId) {
                binding.chipGroupFilters.check(chipId)
            }
        }
    }

    private fun setupSwipeRefresh() {
        binding.swipeRefresh.setColorSchemeResources(R.color.chrono_primary)
        binding.swipeRefresh.setOnRefreshListener {
            viewModel.refresh()
        }
    }

    private fun observeViewModel() {
        viewModel.riders.observe(viewLifecycleOwner) { riders ->
            riderAdapter.submitList(riders)
            val hasError = !viewModel.errorMessage.value.isNullOrBlank()
            binding.layoutEmpty.visibility = if (riders.isEmpty()) View.VISIBLE else View.GONE
            binding.recyclerRiders.visibility = if (riders.isEmpty()) View.GONE else View.VISIBLE
        }

        viewModel.errorMessage.observe(viewLifecycleOwner) { errorMsg ->
            if (!errorMsg.isNullOrBlank()) {
                val isAuthErr = errorMsg.contains("connecter", ignoreCase = true) || errorMsg.contains("expirée", ignoreCase = true) || errorMsg.contains("passe", ignoreCase = true)
                binding.textEmptyTitle.text = if (isAuthErr) "Connexion requise" else "Erreur de synchronisation"
                binding.textEmptySubtitle.text = errorMsg
                binding.btnEmptyRetry.visibility = View.VISIBLE
                binding.btnEmptySettings.text = if (isAuthErr) "Se Connecter" else "Paramètres"
                binding.btnEmptySettings.visibility = View.VISIBLE
                if (riderAdapter.itemCount == 0) {
                    binding.layoutEmpty.visibility = View.VISIBLE
                    binding.recyclerRiders.visibility = View.GONE
                }
            } else {
                binding.textEmptyTitle.setText(R.string.empty_riders_title)
                binding.textEmptySubtitle.setText(R.string.empty_riders_subtitle)
                binding.btnEmptyRetry.visibility = View.GONE
                binding.btnEmptySettings.visibility = View.GONE
            }
        }

        viewModel.hubSummary.observe(viewLifecycleOwner) { summary ->
            binding.textActiveDate.text = summary.activeDateLabel
            binding.textKpiTotalDue.text = String.format(Locale.FRENCH, "%,.2f MAD", summary.totalDueAmount)
            binding.textKpiFinishedTrips.text = "${summary.completedTripsCount} / ${summary.totalTripsCount}"
            binding.textKpiTotalParcels.text = "${summary.totalDeliveredParcels} / ${summary.totalParcels}"
        }

        viewModel.isLoading.observe(viewLifecycleOwner) { loading ->
            binding.swipeRefresh.isRefreshing = loading
        }


        viewModel.currentFilter.observe(viewLifecycleOwner) { filter ->
            _binding?.let { binding ->
                val chipId = when (filter) {
                    FilterType.ALL -> R.id.chip_all
                    FilterType.FINISHED_TRIPS -> R.id.chip_finished
                    FilterType.IN_TRANSIT -> R.id.chip_in_transit
                    FilterType.HAS_DUE -> R.id.chip_has_due
                    FilterType.HAS_UNDELIVERED -> R.id.chip_undelivered
                }
                if (binding.chipGroupFilters.checkedChipId != chipId) {
                    binding.chipGroupFilters.check(chipId)
                }
            }
        }
    }

    private fun showRiderDetails(rider: RiderItem) {
        val sheet = RiderDetailBottomSheet(rider)
        sheet.show(childFragmentManager, RiderDetailBottomSheet.TAG)
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    companion object {
        private const val ARG_FILTER = "arg_filter"

        fun newInstance(filter: FilterType = FilterType.ALL): RidersFragment {
            val fragment = RidersFragment()
            val args = Bundle().apply {
                putString(ARG_FILTER, filter.name)
            }
            fragment.arguments = args
            return fragment
        }
    }
}
