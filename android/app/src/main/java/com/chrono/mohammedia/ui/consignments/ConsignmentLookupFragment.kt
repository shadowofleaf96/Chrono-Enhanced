package com.chrono.mohammedia.ui.consignments
 
import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.chrono.mohammedia.R
import com.chrono.mohammedia.data.model.ConsignmentFullDetails
import com.chrono.mohammedia.data.repository.RiderRepository
import com.chrono.mohammedia.databinding.FragmentConsignmentLookupBinding
import com.chrono.mohammedia.ui.login.LoginActivity
import com.chrono.mohammedia.ui.riders.ConsignmentDetailBottomSheet
import com.chrono.mohammedia.ui.scanner.CameraXScannerHelper
import com.chrono.mohammedia.util.setupDoubleTapAmountCopy
import com.google.android.material.chip.Chip
import kotlinx.coroutines.launch
import java.util.Locale

class ConsignmentLookupFragment : Fragment() {

    private var _binding: FragmentConsignmentLookupBinding? = null
    private val binding get() = _binding!!

    private lateinit var repository: RiderRepository
    private var currentDetails: ConsignmentFullDetails? = null

    private val scannerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == android.app.Activity.RESULT_OK) {
            val code = result.data?.getStringExtra(com.chrono.mohammedia.ui.scanner.ScannerActivity.EXTRA_SCANNED_CODE)
            if (!code.isNullOrBlank()) {
                binding.editConsignmentCode.setText(code)
                binding.editConsignmentCode.setSelection(code.length)
                performSearch(code)
            }
        }
    }

    private val loginLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == android.app.Activity.RESULT_OK) {
            val code = binding.editConsignmentCode.text?.toString()?.trim().orEmpty()
            if (code.isNotBlank()) {
                performSearch(code)
            }
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentConsignmentLookupBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        repository = RiderRepository.getInstance(requireContext())

        setupInputs()
        setupRecentSearches()

        // Check for initial query passed via arguments
        val initialCode = arguments?.getString(ARG_INITIAL_CODE)?.trim()
        if (!initialCode.isNullOrBlank()) {
            binding.editConsignmentCode.setText(initialCode)
            binding.editConsignmentCode.setSelection(initialCode.length)
            performSearch(initialCode)
        }
    }

    private fun setupInputs() {
        binding.editConsignmentCode.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                binding.btnClearInput.visibility = if (!s.isNullOrBlank()) View.VISIBLE else View.GONE
            }
            override fun afterTextChanged(s: Editable?) {}
        })

        binding.btnClearInput.setOnClickListener {
            binding.editConsignmentCode.text?.clear()
            showEmptyState()
        }

        binding.btnPasteCode.setOnClickListener {
            val clipboard = requireContext().getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            val clip = clipboard?.primaryClip?.getItemAt(0)?.text?.toString()?.trim()
            if (!clip.isNullOrBlank()) {
                val cleaned = com.chrono.mohammedia.ui.scanner.CameraXScannerHelper.cleanBarcodeValue(clip)
                binding.editConsignmentCode.setText(cleaned)
                binding.editConsignmentCode.setSelection(cleaned.length)
                performSearch(cleaned)
            } else {
                Toast.makeText(requireContext(), "Presse-papiers vide", Toast.LENGTH_SHORT).show()
            }
        }

        binding.btnOpenCameraScan.setOnClickListener {
            launchScanner()
        }

        binding.editConsignmentCode.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEARCH || actionId == EditorInfo.IME_ACTION_DONE) {
                val code = binding.editConsignmentCode.text?.toString()?.trim().orEmpty()
                if (code.isNotBlank()) {
                    hideKeyboard()
                    performSearch(code)
                }
                true
            } else {
                false
            }
        }

        binding.btnSearchConsignment.setOnClickListener {
            val code = binding.editConsignmentCode.text?.toString()?.trim().orEmpty()
            if (code.isBlank()) {
                Toast.makeText(requireContext(), "Veuillez entrer un numéro de colis", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            hideKeyboard()
            performSearch(code)
        }
    }

    private fun launchScanner() {
        val intent = Intent(requireContext(), com.chrono.mohammedia.ui.scanner.ScannerActivity::class.java)
        intent.putExtra(com.chrono.mohammedia.ui.scanner.ScannerActivity.EXTRA_IS_BATCH_MODE, false)
        scannerLauncher.launch(intent)
    }

    private fun performSearch(code: String) {
        val cleanCode = code.trim().uppercase(Locale.ROOT)
        if (cleanCode.isBlank()) return

        // In-button loading spinner
        binding.btnSearchConsignment.isEnabled = false
        binding.btnSearchConsignment.text = ""
        binding.progressSearch.visibility = View.VISIBLE

        binding.stateEmpty.visibility = View.GONE
        binding.stateError.visibility = View.GONE
        binding.stateResult.visibility = View.GONE

        viewLifecycleOwner.lifecycleScope.launch {
            val res = repository.lookupParcel(cleanCode)

            if (_binding == null || !isAdded) return@launch

            binding.btnSearchConsignment.isEnabled = true
            binding.btnSearchConsignment.text = "RECHERCHER LE COLIS"
            binding.progressSearch.visibility = View.GONE

            if (res.isSuccess) {
                val details = res.getOrNull()
                if (details != null) {
                    saveRecentSearch(cleanCode)
                    displayResult(details)
                } else {
                    showErrorState("Données indisponibles pour ce colis.")
                }
            } else {
                val err = res.exceptionOrNull()?.message ?: "Impossible de récupérer les détails du colis."
                showErrorState(err)
            }
        }
    }

    private fun displayResult(d: ConsignmentFullDetails) {
        currentDetails = d

        binding.stateEmpty.visibility = View.GONE
        binding.stateError.visibility = View.GONE
        binding.stateResult.visibility = View.VISIBLE

        // 1. Reference Number
        binding.resultRefNumber.text = d.referenceNumber

        // 2. Status Badge
        val rawStatus = d.status?.uppercase(Locale.ROOT) ?: ""
        val cleanReason = d.failureReason?.takeIf { !it.equals("Non livré", ignoreCase = true) && !it.equals("null", ignoreCase = true) }

        val isDelivered = rawStatus == "DELIVERED" || 
                          rawStatus == "LIVRÉ" || 
                          rawStatus == "LIVRE" || 
                          (rawStatus.contains("DELIVER") && !rawStatus.contains("UNDELIVER")) || 
                          (rawStatus.contains("LIVR") && !rawStatus.contains("NON"))

        val isFailed = !isDelivered && (
            rawStatus.contains("FAIL") || 
            rawStatus.contains("UNDELIVER") || 
            rawStatus.contains("NON LIVR") || 
            rawStatus.contains("NON_LIVR") || 
            rawStatus.contains("ATTEMPT") || 
            rawStatus.contains("ÉCHOU") || 
            rawStatus.contains("CANCEL") || 
            rawStatus.contains("REFUS")
        )

        if (isDelivered) {
            binding.resultStatusBadge.text = "✔ Livré"
            binding.resultStatusBadge.setBackgroundResource(R.drawable.bg_badge_finished)
            binding.resultStatusBadge.backgroundTintList = null
            binding.resultStatusBadge.setTextColor(ContextCompat.getColor(requireContext(), R.color.status_finished_text))
        } else if (isFailed) {
            val failLabel = if (!cleanReason.isNullOrBlank()) "✖ Non livré ($cleanReason)" else "✖ Non livré"
            binding.resultStatusBadge.text = failLabel
            binding.resultStatusBadge.setBackgroundResource(R.drawable.bg_badge_amount)
            binding.resultStatusBadge.backgroundTintList = ContextCompat.getColorStateList(requireContext(), R.color.status_undelivered_bg)
            binding.resultStatusBadge.setTextColor(ContextCompat.getColor(requireContext(), R.color.status_undelivered_text))
        } else if (rawStatus.contains("REACH") || rawStatus.contains("ARRIV")) {
            val label = if (!cleanReason.isNullOrBlank()) "🏢 Arrivé au Hub (Échec : $cleanReason)" else "🏢 Arrivé au Hub"
            binding.resultStatusBadge.text = label
            binding.resultStatusBadge.setBackgroundResource(R.drawable.bg_badge_transit)
            binding.resultStatusBadge.backgroundTintList = ContextCompat.getColorStateList(requireContext(), R.color.badge_blue_bg)
            binding.resultStatusBadge.setTextColor(ContextCompat.getColor(requireContext(), R.color.badge_blue_text))
        } else if (rawStatus.contains("INSCAN")) {
            val label = if (!cleanReason.isNullOrBlank()) "🏢 Inscan au Hub (Échec : $cleanReason)" else "🏢 Inscan au Hub"
            binding.resultStatusBadge.text = label
            binding.resultStatusBadge.setBackgroundResource(R.drawable.bg_badge_transit)
            binding.resultStatusBadge.backgroundTintList = ContextCompat.getColorStateList(requireContext(), R.color.badge_blue_bg)
            binding.resultStatusBadge.setTextColor(ContextCompat.getColor(requireContext(), R.color.badge_blue_text))
        } else if (rawStatus.contains("OUTSCAN")) {
            binding.resultStatusBadge.text = "🚚 Outscan du Hub"
            binding.resultStatusBadge.setBackgroundResource(R.drawable.bg_badge_transit)
            binding.resultStatusBadge.backgroundTintList = null
            binding.resultStatusBadge.setTextColor(ContextCompat.getColor(requireContext(), R.color.status_transit_text))
        } else if (rawStatus.contains("OFD") || rawStatus.contains("DISPATCH") || rawStatus.contains("OUT_FOR")) {
            binding.resultStatusBadge.text = "🚚 En livraison (OFD)"
            binding.resultStatusBadge.setBackgroundResource(R.drawable.bg_badge_transit)
            binding.resultStatusBadge.backgroundTintList = null
            binding.resultStatusBadge.setTextColor(ContextCompat.getColor(requireContext(), R.color.status_transit_text))
        } else {
            val label = if (!cleanReason.isNullOrBlank()) "⏳ En cours ($cleanReason)" else "⏳ En cours"
            binding.resultStatusBadge.text = label
            binding.resultStatusBadge.setBackgroundResource(R.drawable.bg_badge_transit)
            binding.resultStatusBadge.backgroundTintList = null
            binding.resultStatusBadge.setTextColor(ContextCompat.getColor(requireContext(), R.color.status_transit_text))
        }

        // 3. COD Amount
        val cod = d.codAmount ?: 0.0
        if (cod > 0.0) {
            binding.resultCodAmount.text = String.format(Locale.FRENCH, "%,.2f MAD", cod)
        } else {
            binding.resultCodAmount.text = "0,00 MAD"
        }

        // Enable double-click to copy amount directly
        binding.resultCodAmount.setupDoubleTapAmountCopy({ d.codAmount ?: cod })
        binding.resultBoxCodAmount.setupDoubleTapAmountCopy({ d.codAmount ?: cod })

        // 4. Recipient Details
        binding.resultRecipientName.text = d.destinationName?.takeIf { it.isNotBlank() } ?: "Destinataire standard"
        binding.resultRecipientAddress.text = d.destinationAddress?.takeIf { it.isNotBlank() } ?: "Adresse non renseignée"

        val phone = d.destinationPhone?.trim().orEmpty()
        if (phone.isNotBlank() && phone != "null") {
            binding.resultRecipientPhone.text = phone
            binding.resultBtnCallRecipient.visibility = View.VISIBLE
            binding.resultBtnCallRecipient.setOnClickListener {
                val dialIntent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${phone.replace(" ", "")}"))
                startActivity(dialIntent)
            }
        } else {
            binding.resultRecipientPhone.text = "Numéro de téléphone non renseigné"
            binding.resultBtnCallRecipient.visibility = View.GONE
        }

        // 5. Assigned Rider & Trip
        binding.resultRiderAssigned.text = d.riderName?.takeIf { it.isNotBlank() } ?: "Livreur non assigné"
        binding.resultTripRef.text = d.tripRef?.takeIf { it.isNotBlank() } ?: "Aucune tournée active"

        if (!d.hubName.isNullOrBlank()) {
            binding.resultLayoutHub.visibility = View.VISIBLE
            binding.resultHubName.text = d.hubName
        } else {
            binding.resultLayoutHub.visibility = View.GONE
        }

        // Delivery Attempts (Top Badge + Alert Banner + Details Row)
        val computedAttempts = when {
            (d.attemptCount ?: 0) > 0 -> d.attemptCount!!
            isFailed || !cleanReason.isNullOrBlank() -> 1
            else -> 0
        }
        val attemptsSuffix = if (computedAttempts > 1) "s" else ""
        if (computedAttempts > 0) {
            val attemptText = "$computedAttempts tentative$attemptsSuffix"
            binding.resultBadgeAttemptsTop.visibility = View.VISIBLE
            binding.resultBadgeAttemptsTop.text = attemptText

            binding.resultCardAttemptsAlert.visibility = View.VISIBLE
            binding.resultTextAttemptsBanner.text = "$computedAttempts tentative$attemptsSuffix de livraison enregistrée$attemptsSuffix pour ce colis"

            binding.resultLayoutDeliveryAttempts.visibility = View.VISIBLE
            binding.resultDeliveryAttempts.text = attemptText
            binding.resultDeliveryAttempts.setTextColor(ContextCompat.getColor(requireContext(), R.color.status_undelivered))
        } else {
            binding.resultBadgeAttemptsTop.visibility = View.GONE
            binding.resultCardAttemptsAlert.visibility = View.GONE

            binding.resultLayoutDeliveryAttempts.visibility = View.VISIBLE
            binding.resultDeliveryAttempts.text = "0 tentative"
            binding.resultDeliveryAttempts.setTextColor(ContextCompat.getColor(requireContext(), R.color.text_primary))
        }

        // 6. Failure Reason
        if (!isDelivered && !cleanReason.isNullOrBlank()) {
            binding.resultLayoutFailure.visibility = View.VISIBLE
            binding.resultFailureReason.text = cleanReason
        } else {
            binding.resultLayoutFailure.visibility = View.GONE
        }

        // 7. Actions: Copy & Open Full Sheet
        binding.resultBtnCopyRef.setOnClickListener {
            copyToClipboard(d.referenceNumber, "Code colis copié")
        }

        binding.resultBtnOpenSheet.setOnClickListener {
            val bottomSheet = ConsignmentDetailBottomSheet.newInstance(
                referenceNumber = d.referenceNumber,
                riderName = d.riderName,
                tripRef = d.tripRef
            )
            bottomSheet.show(parentFragmentManager, "consignment_detail")
        }
    }

    private fun showErrorState(message: String) {
        binding.stateEmpty.visibility = View.GONE
        binding.stateResult.visibility = View.GONE
        binding.stateError.visibility = View.VISIBLE

        val isSessionExpired = message.contains("401", ignoreCase = true) ||
                message.contains("SESSION_EXPIRED", ignoreCase = true) ||
                message.contains("Session", ignoreCase = true)

        if (isSessionExpired) {
            binding.textErrorTitle.text = "🔒 Session Shipsy expirée (401)"
            binding.textErrorMessage.text = "Votre session Shipsy a expiré. Veuillez vous reconnecter pour poursuivre vos recherches."
            binding.btnErrorRelogin.visibility = View.VISIBLE
            binding.btnErrorRelogin.setOnClickListener {
                val intent = LoginActivity.createIntent(requireContext(), forceLogin = true)
                loginLauncher.launch(intent)
            }
        } else {
            binding.textErrorTitle.text = "✖ Colis introuvable"
            binding.textErrorMessage.text = message
            binding.btnErrorRelogin.visibility = View.GONE
        }
    }

    private fun showEmptyState() {
        currentDetails = null
        binding.stateError.visibility = View.GONE
        binding.stateResult.visibility = View.GONE
        binding.btnErrorRelogin.visibility = View.GONE
        binding.stateEmpty.visibility = View.VISIBLE
    }

    private fun setupRecentSearches() {
        val prefs = requireContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val recentsStr = prefs.getString(KEY_RECENTS, "") ?: ""
        val list = recentsStr.split(",").map { it.trim() }.filter { it.isNotBlank() }

        binding.chipGroupRecents.removeAllViews()
        if (list.isNotEmpty()) {
            binding.layoutRecentSearches.visibility = View.VISIBLE
            for (code in list.take(6)) {
                val chip = Chip(requireContext()).apply {
                    text = code
                    isCheckable = false
                    isClickable = true
                    setChipBackgroundColorResource(R.color.badge_blue_bg)
                    setTextColor(ContextCompat.getColor(requireContext(), R.color.badge_blue_text))
                    setOnClickListener {
                        binding.editConsignmentCode.setText(code)
                        binding.editConsignmentCode.setSelection(code.length)
                        performSearch(code)
                    }
                }
                binding.chipGroupRecents.addView(chip)
            }
        } else {
            binding.layoutRecentSearches.visibility = View.GONE
        }
    }

    private fun saveRecentSearch(code: String) {
        val prefs = requireContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val recentsStr = prefs.getString(KEY_RECENTS, "") ?: ""
        val currentList = recentsStr.split(",").map { it.trim() }.filter { it.isNotBlank() }.toMutableList()

        currentList.remove(code)
        currentList.add(0, code)
        val trimmed = currentList.take(8).joinToString(",")
        prefs.edit().putString(KEY_RECENTS, trimmed).apply()

        setupRecentSearches()
    }

    private fun copyToClipboard(text: String, label: String) {
        val clipboard = requireContext().getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText("consignment_code", text)
        clipboard.setPrimaryClip(clip)
        Toast.makeText(requireContext(), "$label : $text", Toast.LENGTH_SHORT).show()
    }

    private fun hideKeyboard() {
        val imm = requireContext().getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
        imm?.hideSoftInputFromWindow(binding.editConsignmentCode.windowToken, 0)
    }

    override fun onResume() {
        super.onResume()
    }

    override fun onPause() {
        super.onPause()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    companion object {
        const val TAG = "ConsignmentLookupFragment"
        private const val ARG_INITIAL_CODE = "arg_initial_code"
        private const val PREFS_NAME = "chrono_lookup_prefs"
        private const val KEY_RECENTS = "key_recent_searches"

        fun newInstance(initialCode: String? = null): ConsignmentLookupFragment {
            return ConsignmentLookupFragment().apply {
                arguments = Bundle().apply {
                    putString(ARG_INITIAL_CODE, initialCode)
                }
            }
        }
    }
}
