package com.chrono.mohammedia.ui.settings

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import com.chrono.mohammedia.databinding.FragmentSettingsBinding
import com.chrono.mohammedia.ui.login.LoginActivity
import com.chrono.mohammedia.ui.riders.RidersViewModel

class SettingsFragment : Fragment() {

    private var _binding: FragmentSettingsBinding? = null
    private val binding get() = _binding!!
    private val viewModel: RidersViewModel by activityViewModels()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentSettingsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val repo = viewModel.repository
        repo.loadPreferences(requireContext())

        // Display current active session info
        binding.tvAccountUsername.text = repo.shipsyUsername.ifBlank { "M.KOTBI@CHRONODIALI.MA" }
        binding.tvOrganisationName.text = repo.shipsyOrganisationId.ifBlank { "chronodiali" }
        binding.switchUseLiveApi.isChecked = repo.isLiveApiEnabled

        binding.switchUseLiveApi.setOnCheckedChangeListener { _, isChecked ->
            repo.isLiveApiEnabled = isChecked
            repo.savePreferences(requireContext())
            Toast.makeText(
                requireContext(),
                if (isChecked) "Synchronisation Live Shipsy activée" else "Mode hors-ligne / test activé",
                Toast.LENGTH_SHORT
            ).show()
            viewModel.refresh()
        }

        binding.btnLogout.setOnClickListener {
            repo.logout(requireContext())
            val intent = LoginActivity.createIntent(requireContext(), forceLogin = true).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            }
            startActivity(intent)
            activity?.finish()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    companion object {
        fun newInstance() = SettingsFragment()
    }
}
