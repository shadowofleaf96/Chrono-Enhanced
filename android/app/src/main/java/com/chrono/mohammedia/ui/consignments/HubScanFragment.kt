package com.chrono.mohammedia.ui.consignments

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.chrono.mohammedia.R
import com.chrono.mohammedia.data.model.HubScanExecutionResult
import com.chrono.mohammedia.data.model.HubScanMode
import com.chrono.mohammedia.data.model.ScannedItemStatus
import com.chrono.mohammedia.data.model.ScannedParcelItem
import com.chrono.mohammedia.data.repository.RiderRepository
import com.chrono.mohammedia.databinding.FragmentHubScanBinding
import com.chrono.mohammedia.data.model.ParcelStatus
import com.chrono.mohammedia.ui.adapter.ScannedParcelAdapter
import com.chrono.mohammedia.ui.riders.ConsignmentDetailBottomSheet
import com.chrono.mohammedia.ui.scanner.ScannerActivity
import com.chrono.mohammedia.ui.scanner.CameraXScannerHelper
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class HubScanFragment : Fragment() {

    private var _binding: FragmentHubScanBinding? = null
    private val binding get() = _binding!!

    private lateinit var repository: RiderRepository
    private lateinit var adapter: ScannedParcelAdapter
    private var currentMode: HubScanMode = HubScanMode.INSCAN
    private val scannedList = mutableListOf<ScannedParcelItem>()
    private var selectedDestinationHubId: String? = null

    private val scannerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == android.app.Activity.RESULT_OK) {
            val codes = result.data?.getStringArrayListExtra(ScannerActivity.EXTRA_SCANNED_CODES_LIST)
            codes?.forEach { rawCode ->
                val cleanCode = CameraXScannerHelper.cleanBarcodeValue(rawCode)
                if (cleanCode.isNotBlank() && !scannedList.any { it.code.equals(cleanCode, ignoreCase = true) }) {
                    addScannedParcelToList(cleanCode)
                }
            }
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentHubScanBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        repository = RiderRepository.getInstance(requireContext())

        setupRecyclerView()
        setupModeSelector()
        setupCameraControls()
        setupManualInput()
        setupSubmitButton()
        setupDestinationHub()

        updateUiState()
    }

    private fun setupRecyclerView() {
        adapter = ScannedParcelAdapter(
            onItemClick = { item ->
                val sheet = ConsignmentDetailBottomSheet.newInstance(
                    referenceNumber = item.code
                )
                sheet.show(parentFragmentManager, "scanned_consignment_detail")
            },
            onDeleteClick = { item ->
                removeScannedItem(item)
            }
        )
        binding.recyclerScannedParcels.layoutManager = LinearLayoutManager(requireContext())
        binding.recyclerScannedParcels.adapter = adapter

        binding.btnClearAllScanned.setOnClickListener {
            if (scannedList.isNotEmpty()) {
                MaterialAlertDialogBuilder(requireContext())
                    .setTitle("Vider la liste")
                    .setMessage("Voulez-vous supprimer l'ensemble des ${scannedList.size} colis scannés ?")
                    .setPositiveButton("Vider") { _, _ ->
                        scannedList.clear()
                        adapter.submitList(emptyList())
                        updateUiState()
                    }
                    .setNegativeButton("Annuler", null)
                    .show()
            }
        }
    }

    private fun setupModeSelector() {
        binding.chipGroupScanMode.setOnCheckedStateChangeListener { _, checkedIds ->
            when {
                checkedIds.contains(R.id.chip_inscan) -> setScanMode(HubScanMode.INSCAN)
                checkedIds.contains(R.id.chip_outscan) -> setScanMode(HubScanMode.OUTSCAN)
                checkedIds.contains(R.id.chip_arrival) -> setScanMode(HubScanMode.ARRIVAL)
                checkedIds.contains(R.id.chip_rto) -> setScanMode(HubScanMode.RTO)
            }
        }
        setScanMode(HubScanMode.INSCAN)
    }

    private fun setupDestinationHub() {
        val arrayAdapter = android.widget.ArrayAdapter<String>(requireContext(), R.layout.item_dropdown, mutableListOf())
        binding.autoDestinationHub.setAdapter(arrayAdapter)

        var searchJob: kotlinx.coroutines.Job? = null
        val hubMap = mutableMapOf<String, String>()

        binding.autoDestinationHub.addTextChangedListener(object: android.text.TextWatcher {
            override fun afterTextChanged(s: android.text.Editable?) {
                val query = s?.toString()?.trim() ?: ""
                if (query.length >= 2 && !hubMap.containsKey(query)) {
                    searchJob?.cancel()
                    searchJob = viewLifecycleOwner.lifecycleScope.launch {
                        kotlinx.coroutines.delay(400)
                        val results = repository.searchHubs(query)
                        if (results.isNotEmpty()) {
                            hubMap.clear()
                            arrayAdapter.clear()
                            for (h in results) {
                                val label = "${h.name} (${h.code})"
                                hubMap[label] = h.id
                                arrayAdapter.add(label)
                            }
                            arrayAdapter.notifyDataSetChanged()
                        }
                    }
                }
            }
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                selectedDestinationHubId = null
            }
        })

        binding.autoDestinationHub.setOnItemClickListener { parent, _, position, _ ->
            val selection = parent.getItemAtPosition(position) as String
            selectedDestinationHubId = hubMap[selection]
            val imm = requireContext().getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
            imm?.hideSoftInputFromWindow(binding.autoDestinationHub.windowToken, 0)
        }
    }

    private fun setScanMode(mode: HubScanMode) {
        currentMode = mode
        binding.layoutDestinationHub.visibility = View.GONE
        when (mode) {
            HubScanMode.INSCAN -> {
                binding.textModeDescription.text = "Inscan at Hub : Réception et enregistrement des colis dans le hub"
            }
            HubScanMode.OUTSCAN -> {
                binding.textModeDescription.text = "Outscan at hub : Expédition et sortie des colis depuis le hub"
                binding.layoutDestinationHub.visibility = View.VISIBLE
            }
            HubScanMode.ARRIVAL -> {
                binding.textModeDescription.text = "Arrival : Confirmation de l'arrivée physique des colis au hub"
            }
            HubScanMode.RTO -> {
                binding.textModeDescription.text = "Set RTO : Retour à l'envoyeur"
            }
        }
        updateUiState()
    }

    private fun setupCameraControls() {
        binding.btnOpenScanner.setOnClickListener {
            val intent = android.content.Intent(requireContext(), ScannerActivity::class.java)
            intent.putExtra(ScannerActivity.EXTRA_IS_BATCH_MODE, true)
            intent.putStringArrayListExtra(ScannerActivity.EXTRA_ALREADY_SCANNED_CODES, ArrayList(scannedList.map { it.code }))
            scannerLauncher.launch(intent)
        }
    }

    private fun setupManualInput() {
        binding.btnPasteManual.setOnClickListener {
            val clipboard = requireContext().getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            val clipText = clipboard?.primaryClip?.getItemAt(0)?.text?.toString()?.trim()
            if (!clipText.isNullOrBlank()) {
                val cleaned = com.chrono.mohammedia.ui.scanner.CameraXScannerHelper.cleanBarcodeValue(clipText)
                binding.editManualBarcode.setText(cleaned)
                addManualCode(cleaned)
            } else {
                Toast.makeText(requireContext(), "Presse-papiers vide", Toast.LENGTH_SHORT).show()
            }
        }

        binding.btnAddManual.setOnClickListener {
            val code = binding.editManualBarcode.text?.toString()?.trim().orEmpty()
            addManualCode(code)
        }

        binding.editManualBarcode.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEND || actionId == EditorInfo.IME_ACTION_DONE) {
                val code = binding.editManualBarcode.text?.toString()?.trim().orEmpty()
                addManualCode(code)
                true
            } else {
                false
            }
        }
    }

    private fun addManualCode(code: String) {
        val clean = com.chrono.mohammedia.ui.scanner.CameraXScannerHelper.cleanBarcodeValue(code)
        if (clean.isBlank()) {
            Toast.makeText(requireContext(), "Veuillez saisir un numéro de colis", Toast.LENGTH_SHORT).show()
            return
        }

        if (scannedList.any { it.code.equals(clean, ignoreCase = true) }) {
            Toast.makeText(requireContext(), "Colis $clean déjà présent", Toast.LENGTH_SHORT).show()
        } else {
            binding.editManualBarcode.text?.clear()
            val imm = requireContext().getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
            imm?.hideSoftInputFromWindow(binding.editManualBarcode.windowToken, 0)

            addScannedParcelToList(clean)
        }
    }

    private fun addScannedParcelToList(cleanCode: String) {
        val now = System.currentTimeMillis()

        // 1. Check local tour cache for instant 0ms data
        val cachedPair = repository.findParcelInCache(cleanCode)
        val cachedParcel = cachedPair?.second
        val initialStatus: String?
        val initialDate: String?
        val initialRecipient: String?

        if (cachedParcel != null) {
            initialStatus = when (cachedParcel.status) {
                ParcelStatus.DELIVERED -> "Livré"
                ParcelStatus.UNDELIVERED -> {
                    if (!cachedParcel.failureReason.isNullOrBlank()) "Non livré (${cachedParcel.failureReason})"
                    else "Non livré"
                }
                ParcelStatus.PICKED_UP -> "Ramassé"
                ParcelStatus.PENDING -> "En tournée"
            }
            initialDate = formatFriendlyDate(cachedParcel.createdAt)
            initialRecipient = cachedParcel.recipientName
        } else {
            initialStatus = null
            initialDate = null
            initialRecipient = null
        }

        val newItem = ScannedParcelItem(
            code = cleanCode,
            scannedAt = now,
            status = ScannedItemStatus.PENDING,
            latestStatus = initialStatus,
            latestStatusDate = initialDate,
            recipientName = initialRecipient,
            isLoadingDetails = true
        )

        scannedList.add(0, newItem)
        adapter.submitList(scannedList.map { it.copy() })
        binding.recyclerScannedParcels.scrollToPosition(0)
        updateUiState()

        // 2. Fetch live latest status & date from Shipsy
        fetchParcelStatusAsync(cleanCode)
    }

    private fun fetchParcelStatusAsync(code: String) {
        viewLifecycleOwner.lifecycleScope.launch {
            val result = repository.lookupParcel(code)
            if (_binding == null || !isAdded) return@launch

            val index = scannedList.indexOfFirst { it.code.equals(code, ignoreCase = true) }
            if (index == -1) return@launch

            val current = scannedList[index]
            if (result.isSuccess) {
                val d = result.getOrNull()
                if (d != null) {
                    val statusText = formatStatusBadgeText(d.status, d.failureReason)
                    val rawDate = d.deliveryTime ?: d.lastEventDate ?: d.creationTime
                    val dateText = formatFriendlyDate(rawDate)
                    val recipient = d.destinationName?.takeIf { it.isNotBlank() } ?: current.recipientName

                    scannedList[index] = current.copy(
                        latestStatus = statusText ?: current.latestStatus,
                        latestStatusDate = dateText ?: current.latestStatusDate,
                        recipientName = recipient,
                        attemptCount = d.attemptCount ?: current.attemptCount,
                        isLoadingDetails = false
                    )
                } else {
                    scannedList[index] = current.copy(isLoadingDetails = false)
                }
            } else {
                scannedList[index] = current.copy(isLoadingDetails = false)
            }
            adapter.submitList(scannedList.map { it.copy() })
        }
    }

    private fun formatStatusBadgeText(rawStatus: String?, failureReason: String?): String? {
        if (rawStatus.isNullOrBlank()) return null
        val upper = rawStatus.uppercase(Locale.ROOT)

        val cleanReason = failureReason?.takeIf { !it.equals("Non livré", ignoreCase = true) && !it.equals("null", ignoreCase = true) }

        // 1. Terminal Delivered
        val isDelivered = upper == "DELIVERED" || 
                          upper == "LIVRÉ" || 
                          upper == "LIVRE" || 
                          (upper.contains("DELIVER") && !upper.contains("UNDELIVER")) || 
                          (upper.contains("LIVR") && !upper.contains("NON"))
        if (isDelivered) return "Livré"

        // 2. Hub / Inscan / Outscan states (prioritized even if parcel had a past delivery attempt)
        if (upper.contains("REACH") || upper.contains("ARRIV")) {
            return if (!cleanReason.isNullOrBlank()) "Arrivé au Hub (Échec : $cleanReason)" else "Arrivé au Hub"
        }
        if (upper.contains("INSCAN")) {
            return if (!cleanReason.isNullOrBlank()) "Inscan au Hub (Échec : $cleanReason)" else "Inscan au Hub"
        }
        if (upper.contains("OUTSCAN")) return "Outscan du Hub"
        if (upper.contains("OFD") || upper.contains("DISPATCH") || upper.contains("OUT_FOR")) return "En livraison (OFD)"

        // 3. Undelivered / Attempted states
        val isUndelivered = upper.contains("UNDELIVER") || 
                            upper.contains("NON LIVR") || 
                            upper.contains("NON_LIVR") || 
                            upper.contains("FAIL") || 
                            upper.contains("ÉCHOU") || 
                            upper.contains("ECHOU") || 
                            upper.contains("ATTEMPT") || 
                            upper.contains("CANCEL") || 
                            upper.contains("REFUS")

        if (isUndelivered) {
            return if (!cleanReason.isNullOrBlank()) "Non livré : $cleanReason" else "Non livré"
        }

        if (upper.contains("TRANSIT")) return "En cours"
        if (upper.contains("PICK") || upper.contains("RAMASS")) return "Ramassé"

        if (!cleanReason.isNullOrBlank()) {
            return "$rawStatus ($cleanReason)"
        }

        return rawStatus
    }

    private fun formatFriendlyDate(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        val trimmed = raw.trim()

        val asLong = trimmed.toLongOrNull()
        if (asLong != null && asLong > 1000000000L) {
            val millis = if (asLong < 1000000000000L) asLong * 1000L else asLong
            return runCatching { SimpleDateFormat("dd/MM HH:mm", Locale.FRENCH).format(Date(millis)) }.getOrNull()
        }

        val formats = listOf(
            SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.ROOT),
            SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.ROOT),
            SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.ROOT),
            SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.FRENCH),
            SimpleDateFormat("dd/MM/yyyy", Locale.FRENCH)
        )

        for (sdf in formats) {
            try {
                val parsed = sdf.parse(trimmed)
                if (parsed != null) {
                    return SimpleDateFormat("dd/MM HH:mm", Locale.FRENCH).format(parsed)
                }
            } catch (_: Exception) { }
        }

        return if (trimmed.length > 14) trimmed.take(14) else trimmed
    }

    private fun removeScannedItem(item: ScannedParcelItem) {
        scannedList.removeAll { it.code.equals(item.code, ignoreCase = true) }
        adapter.submitList(scannedList.map { it.copy() })
        updateUiState()
    }

    private fun setupSubmitButton() {
        binding.btnSubmitScan.setOnClickListener {
            if (scannedList.isEmpty()) return@setOnClickListener

            val codes = scannedList.map { it.code }
            val modeName = when (currentMode) {
                HubScanMode.INSCAN -> "Inscan at Hub"
                HubScanMode.OUTSCAN -> "Outscan at hub"
                HubScanMode.ARRIVAL -> "Arrival"
                HubScanMode.RTO -> "Set RTO"
            }

            if (currentMode == HubScanMode.OUTSCAN && selectedDestinationHubId.isNullOrBlank()) {
                Toast.makeText(requireContext(), "Veuillez sélectionner un hub de destination pour l'Outscan", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            MaterialAlertDialogBuilder(requireContext())
                .setTitle("Confirmer l'opération")
                .setMessage("Valider l'action '$modeName' pour ${codes.size} colis ?")
                .setPositiveButton("Valider") { _, _ ->
                    executeBatchSubmission(codes)
                }
                .setNegativeButton("Annuler", null)
                .show()
        }
    }

    private fun executeBatchSubmission(codes: List<String>) {
        binding.btnSubmitScan.isEnabled = false
        binding.progressSubmitting.visibility = View.VISIBLE

        viewLifecycleOwner.lifecycleScope.launch {
            val result = repository.executeHubScan(currentMode, codes, destinationHubId = selectedDestinationHubId)
            binding.progressSubmitting.visibility = View.GONE
            binding.btnSubmitScan.isEnabled = true

            if (result.isSuccess) {
                val data = result.getOrNull()!!
                Toast.makeText(requireContext(), "Réponse Shipsy reçue", Toast.LENGTH_SHORT).show()
                handleSubmissionSuccess(data)
            } else {
                val err = result.exceptionOrNull()?.localizedMessage ?: "Erreur inconnue"
                Toast.makeText(requireContext(), "Échec de l'opération", Toast.LENGTH_SHORT).show()
                showSubmissionError(err)
            }
        }
    }

    private fun handleSubmissionSuccess(data: HubScanExecutionResult) {
        val total = data.totalCount
        val succ = data.successCount
        val fail = data.failureCount

        val modeValidationLabel = when (data.mode) {
            HubScanMode.INSCAN -> "Inscan validé"
            HubScanMode.OUTSCAN -> "Outscan validé"
            HubScanMode.ARRIVAL -> "Arrivée validée"
            HubScanMode.RTO -> "RTO validé"
        }
        val currentNowDate = SimpleDateFormat("dd/MM HH:mm", Locale.FRENCH).format(Date())

        // Update items status in adapter
        for (i in scannedList.indices) {
            val item = scannedList[i]
            val failMsg = data.failures.firstOrNull { it.contains(item.code, ignoreCase = true) }
            if (failMsg != null) {
                scannedList[i] = item.copy(
                    status = ScannedItemStatus.FAILED,
                    message = failMsg
                )
            } else {
                scannedList[i] = item.copy(
                    status = ScannedItemStatus.SUCCESS,
                    message = null,
                    latestStatus = modeValidationLabel,
                    latestStatusDate = currentNowDate
                )
            }
        }
        adapter.submitList(scannedList.map { it.copy() })

        val modeLabel = when (data.mode) {
            HubScanMode.INSCAN -> "Inscan at Hub"
            HubScanMode.OUTSCAN -> "Outscan at hub"
            HubScanMode.ARRIVAL -> "Arrival"
            HubScanMode.RTO -> "Set RTO"
        }

        val msg = buildString {
            if (!data.rawMessage.isNullOrBlank()) {
                append("Message : ${data.rawMessage}\n\n")
            }
            append("Opération $modeLabel traitée :\n")
            append("✔ Réussis : $succ / $total\n")
            if (fail > 0) {
                append("✖ Échecs : $fail\n\n")
                append("Détails des échecs :\n")
                data.failures.take(8).forEach { append("• $it\n") }
                if (data.failures.size > 8) {
                    append("... et ${data.failures.size - 8} autres")
                }
            }
        }

        MaterialAlertDialogBuilder(requireContext())
            .setTitle(if (fail == 0) "Succès ($succ colis)" else "Résultat partiel")
            .setMessage(msg)
            .setPositiveButton(if (fail == 0) "Vider la liste" else "OK") { _, _ ->
                if (fail == 0) {
                    scannedList.clear()
                    adapter.submitList(emptyList())
                    updateUiState()
                }
            }
            .setNegativeButton(if (fail == 0) "Conserver" else null, null)
            .show()
    }

    private fun showSubmissionError(error: String) {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("Erreur Shipsy")
            .setMessage("L'opération a échoué :\n$error")
            .setPositiveButton("OK", null)
            .show()
    }

    private fun updateUiState() {
        val count = scannedList.size
        binding.textScannedCountLabel.text = "Colis scannés ($count)"
        binding.btnClearAllScanned.visibility = if (count > 0) View.VISIBLE else View.GONE
        binding.layoutEmptyScanned.visibility = if (count == 0) View.VISIBLE else View.GONE
        binding.btnSubmitScan.isEnabled = count > 0

        val modeLabel = when (currentMode) {
            HubScanMode.INSCAN -> "L'INSCAN"
            HubScanMode.OUTSCAN -> "L'OUTSCAN"
            HubScanMode.ARRIVAL -> "L'ARRIVÉE"
            HubScanMode.RTO -> "LE RETOUR (RTO)"
        }
        binding.btnSubmitScan.text = "VALIDER $modeLabel ($count COLIS)"
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
        fun newInstance(initialMode: HubScanMode = HubScanMode.INSCAN): HubScanFragment {
            return HubScanFragment().apply {
                currentMode = initialMode
            }
        }
    }
}
