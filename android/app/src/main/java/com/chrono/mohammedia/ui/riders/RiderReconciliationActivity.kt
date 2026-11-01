package com.chrono.mohammedia.ui.riders

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.media.ToneGenerator
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.chrono.mohammedia.R
import com.chrono.mohammedia.data.model.HubScanMode
import com.chrono.mohammedia.data.model.ParcelDetail
import com.chrono.mohammedia.data.model.ParcelStatus
import com.chrono.mohammedia.data.model.RiderItem
import com.chrono.mohammedia.data.repository.RiderRepository
import com.chrono.mohammedia.databinding.ActivityRiderReconciliationBinding
import com.chrono.mohammedia.ui.scanner.CameraXScannerHelper
import com.chrono.mohammedia.ui.scanner.ScannerActivity
import com.chrono.mohammedia.util.setupDoubleTapAmountCopy
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import java.util.Locale

class RiderReconciliationActivity : AppCompatActivity() {

    private lateinit var binding: ActivityRiderReconciliationBinding
    private lateinit var repository: RiderRepository
    private lateinit var adapter: ReconcileParcelAdapter

    private var currentRider: RiderItem? = null
    private val allParcels = mutableListOf<ParcelDetail>()
    private val parcelsToScan = mutableListOf<ParcelDetail>()
    private val deliveredParcels = mutableListOf<ParcelDetail>()
    private val scannedRefs = mutableSetOf<String>()
    private val checkedDeliveredRefs = mutableSetOf<String>()

    private var isInscanCompleted: Boolean = false
    private var currentFilterTab = TAB_UNSCANNED
    private var toneGenerator: ToneGenerator? = null

    private val batchScannerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val list = result.data?.getStringArrayListExtra(ScannerActivity.EXTRA_SCANNED_CODES_LIST)
            if (!list.isNullOrEmpty()) {
                var newlyScanned = 0
                for (rawCode in list) {
                    val returnMatch = findMatchingReturnParcel(rawCode)
                    if (returnMatch != null) {
                        if (scannedRefs.add(returnMatch.referenceNumber)) {
                            newlyScanned++
                        }
                    } else {
                        // Check if it belongs to delivered parcels to automatically validate it
                        val clean = CameraXScannerHelper.cleanBarcodeValue(rawCode)
                        val cleanNorm = clean.replace("-", "").replace(" ", "").replace("*", "").uppercase()
                        val delMatch = deliveredParcels.find { p ->
                            val refNorm = p.referenceNumber.replace("-", "").replace(" ", "").replace("*", "").uppercase()
                            refNorm == cleanNorm || p.referenceNumber.equals(clean, ignoreCase = true)
                        }
                        if (delMatch != null && checkedDeliveredRefs.add(delMatch.referenceNumber)) {
                            newlyScanned++
                        }
                    }
                }
                if (newlyScanned > 0) {
                    playSuccessFeedback()
                    Toast.makeText(this, "✔ $newlyScanned nouveau(x) colis validé(s) !", Toast.LENGTH_SHORT).show()
                    updateUi()
                } else {
                    Toast.makeText(this, "Aucun nouveau colis correspondant trouvé.", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityRiderReconciliationBinding.inflate(layoutInflater)
        setContentView(binding.root)

        repository = RiderRepository.getInstance(this)

        @Suppress("DEPRECATION")
        currentRider = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getSerializableExtra(EXTRA_RIDER, RiderItem::class.java)
        } else {
            intent.getSerializableExtra(EXTRA_RIDER) as? RiderItem
        }

        if (currentRider == null) {
            Toast.makeText(this, "Erreur : Livreur non spécifié", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        try {
            toneGenerator = ToneGenerator(AudioManager.STREAM_MUSIC, 100)
        } catch (_: Exception) {}

        setupToolbar()
        setupRiderHeader()
        setupRecyclerView()
        setupScannerAndInputs()
        setupFilterTabs()
        setupActions()

        loadParcels()
    }

    private fun setupToolbar() {
        binding.toolbar.setNavigationOnClickListener {
            finish()
        }

        val workerCode = getEffectiveWorkerCode()
        binding.btnOpenWebRecon.setOnClickListener {
            openShipsyWebReconciliation(workerCode)
        }
    }

    private fun setupRiderHeader() {
        val rider = currentRider ?: return

        // Initials avatar
        val initials = rider.name.split(" ")
            .filter { it.isNotBlank() }
            .take(2)
            .map { it.first().uppercaseChar() }
            .joinToString("")
        binding.textRiderAvatar.text = if (initials.isNotEmpty()) initials else "R"

        binding.textRiderName.text = rider.name
        val workerCode = getEffectiveWorkerCode()
        binding.textWorkerCode.text = workerCode
        binding.textTripRef.text = "• ${rider.code}"

        // Financial amount
        val amtStr = String.format(Locale.FRENCH, "%,.2f MAD", rider.amountToPay)
        binding.textAmountDue.text = amtStr
        binding.textAmountDue.setupDoubleTapAmountCopy({ rider.amountToPay })

        binding.btnCopyAmount.setOnClickListener {
            copyToClipboard(amtStr, "Montant $amtStr copié !")
        }

        // Initial status
        if (rider.isReconciled) {
            val by = if (!rider.reconciledBy.isNullOrBlank()) "par : ${rider.reconciledBy}" else "validé"
            binding.textRiderStatusPill.text = "✔ Réglé ($by)"
            binding.textRiderStatusPill.setBackgroundResource(R.drawable.bg_badge_finished)
            binding.textRiderStatusPill.setTextColor(ContextCompat.getColor(this, R.color.status_finished_text))
            isInscanCompleted = true
        } else {
            binding.textRiderStatusPill.text = "⏳ À réconcilier"
            binding.textRiderStatusPill.setBackgroundResource(R.drawable.bg_badge_transit)
            binding.textRiderStatusPill.setTextColor(ContextCompat.getColor(this, R.color.status_transit_text))
        }
    }

    private fun setupRecyclerView() {
        adapter = ReconcileParcelAdapter(
            onToggleScan = { parcel, shouldBeScanned ->
                if (shouldBeScanned) {
                    if (scannedRefs.add(parcel.referenceNumber)) {
                        playSuccessFeedback()
                        Toast.makeText(this, "✔ Colis ${parcel.referenceNumber} validé pour l'inscan", Toast.LENGTH_SHORT).show()
                    }
                } else {
                    scannedRefs.remove(parcel.referenceNumber)
                    Toast.makeText(this, "Scan annulé pour ${parcel.referenceNumber}", Toast.LENGTH_SHORT).show()
                }
                updateUi()
            },
            onToggleDeliveredCheck = { parcel, isChecked ->
                if (isChecked) {
                    checkedDeliveredRefs.add(parcel.referenceNumber)
                } else {
                    checkedDeliveredRefs.remove(parcel.referenceNumber)
                }
                updateUi()
            },
            onOpenDetails = { parcel ->
                val sheet = ConsignmentDetailBottomSheet.newInstance(
                    parcel = parcel,
                    riderName = currentRider?.name,
                    tripRef = currentRider?.code
                )
                sheet.show(supportFragmentManager, ConsignmentDetailBottomSheet.TAG)
            }
        )

        binding.recyclerParcels.layoutManager = LinearLayoutManager(this)
        binding.recyclerParcels.adapter = adapter

        supportFragmentManager.setFragmentResultListener(ConsignmentDetailBottomSheet.TAG, this) { _, bundle ->
            val ref = bundle.getString("ref")
            applyCachedDetailsToParcels(ref)
        }
    }

    private fun setupScannerAndInputs() {
        // Camera Scanner Button -> Launches Fast Batch Scanner
        binding.btnOpenCameraScan.setOnClickListener {
            val intent = Intent(this, ScannerActivity::class.java).apply {
                putExtra(ScannerActivity.EXTRA_IS_BATCH_MODE, true)
                putStringArrayListExtra(ScannerActivity.EXTRA_ALREADY_SCANNED_CODES, ArrayList(scannedRefs))
                // Pass all rider parcel references as expected codes so the scanner achieves 100% precision
                val expected = allParcels.map { it.referenceNumber }.filter { it.isNotBlank() }
                if (expected.isNotEmpty()) {
                    putStringArrayListExtra(ScannerActivity.EXTRA_EXPECTED_CODES, ArrayList(expected))
                }
            }
            batchScannerLauncher.launch(intent)
        }

        // Paste Code Action
        binding.btnPasteCode.setOnClickListener {
            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            val clip = clipboard?.primaryClip?.getItemAt(0)?.text?.toString()?.trim()
            if (!clip.isNullOrBlank()) {
                val cleaned = CameraXScannerHelper.cleanBarcodeValue(clip)
                binding.editManualCode.setText(cleaned)
                binding.editManualCode.setSelection(cleaned.length)
                handleManualCodeSubmit(cleaned)
            } else {
                Toast.makeText(this, "Presse-papiers vide", Toast.LENGTH_SHORT).show()
            }
        }

        // Submit Manual Code Action
        binding.btnSubmitManualCode.setOnClickListener {
            val code = binding.editManualCode.text?.toString()?.trim().orEmpty()
            if (code.isNotBlank()) {
                handleManualCodeSubmit(code)
            }
        }

        binding.editManualCode.setOnEditorActionListener { _, _, _ ->
            val code = binding.editManualCode.text?.toString()?.trim().orEmpty()
            if (code.isNotBlank()) {
                handleManualCodeSubmit(code)
                true
            } else false
        }
    }

    // High-tolerance barcode matching prioritizing Amana codes
    private fun findMatchingReturnParcel(rawCode: String): ParcelDetail? {
        val clean = CameraXScannerHelper.cleanBarcodeValue(rawCode)
        if (clean.isBlank()) return null
        val cleanNorm = clean.replace("-", "").replace(" ", "").replace("*", "").uppercase()

        // 1. Direct or normalized match in returns list
        return parcelsToScan.find { p ->
            val refNorm = p.referenceNumber.replace("-", "").replace(" ", "").replace("*", "").uppercase()
            refNorm == cleanNorm ||
            p.referenceNumber.equals(clean, ignoreCase = true) ||
            (cleanNorm.length >= 8 && (refNorm.contains(cleanNorm) || cleanNorm.contains(refNorm)))
        }
    }

    private fun handleManualCodeSubmit(rawCode: String) {
        val clean = CameraXScannerHelper.cleanBarcodeValue(rawCode)
        if (clean.isBlank()) return

        val returnMatch = findMatchingReturnParcel(clean)
        if (returnMatch != null) {
            if (scannedRefs.add(returnMatch.referenceNumber)) {
                playSuccessFeedback()
                Toast.makeText(this, "✔ Colis ${returnMatch.referenceNumber} validé !", Toast.LENGTH_SHORT).show()
                binding.editManualCode.text?.clear()
                updateUi()
            } else {
                Toast.makeText(this, "Colis ${returnMatch.referenceNumber} déjà scanné", Toast.LENGTH_SHORT).show()
            }
            return
        }

        // Check if it belongs to delivered parcels
        val cleanNorm = clean.replace("-", "").replace(" ", "").replace("*", "").uppercase()
        val deliveredMatch = deliveredParcels.find { p ->
            val refNorm = p.referenceNumber.replace("-", "").replace(" ", "").replace("*", "").uppercase()
            refNorm == cleanNorm || p.referenceNumber.equals(clean, ignoreCase = true)
        }

        if (deliveredMatch != null) {
            playSuccessFeedback()
            Toast.makeText(
                this,
                "ℹ️ Colis ${deliveredMatch.referenceNumber} est déjà marqué LIVRÉ (Pas de retour requis)",
                Toast.LENGTH_LONG
            ).show()
            binding.editManualCode.text?.clear()
        } else {
            playErrorFeedback()
            Toast.makeText(
                this,
                "⚠ Colis inconnu ($clean) pour la tournée de ce livreur",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    private fun setupFilterTabs() {
        binding.tabUnscanned.setOnClickListener {
            currentFilterTab = TAB_UNSCANNED
            updateFilterTabsStyle()
            updateListDisplay()
        }

        binding.tabScanned.setOnClickListener {
            currentFilterTab = TAB_SCANNED
            updateFilterTabsStyle()
            updateListDisplay()
        }

        binding.tabDelivered.setOnClickListener {
            currentFilterTab = TAB_DELIVERED
            updateFilterTabsStyle()
            updateListDisplay()
        }

        binding.tabAll.setOnClickListener {
            currentFilterTab = TAB_ALL
            updateFilterTabsStyle()
            updateListDisplay()
        }
    }

    // Step 1: Inscan at Hub -> Step 2: Settle Rider
    private fun setupActions() {
        // Inscan Button directly in the Not Delivered Parcels tab
        binding.btnInscanTab.setOnClickListener {
            val totalToScan = parcelsToScan.size
            val countScanned = scannedRefs.size

            if (countScanned == 0 && totalToScan > 0) {
                MaterialAlertDialogBuilder(this)
                    .setTitle("Inscan au Hub")
                    .setMessage(
                        "Vous avez $totalToScan colis retourné(s) non livré(s).\n\n" +
                        "Voulez-vous les inscanner tous au Hub maintenant avant de régler ?"
                    )
                    .setPositiveButton("📥 Tout Inscanner ($totalToScan colis)") { _, _ ->
                        scannedRefs.addAll(parcelsToScan.map { it.referenceNumber })
                        updateUi()
                        performInscanAtHub()
                    }
                    .setNeutralButton("📷 Scanner Caméra") { _, _ ->
                        binding.btnOpenCameraScan.performClick()
                    }
                    .setNegativeButton("Annuler", null)
                    .show()
                return@setOnClickListener
            }

            performInscanAtHub()
        }

        // Option to check all delivered parcels with price
        binding.btnCheckAllWithPrice.setOnClickListener {
            val parcelsWithPrice = deliveredParcels.filter { it.amount > 0.0 }
            if (parcelsWithPrice.isEmpty()) {
                Toast.makeText(this, "Aucun colis livré avec prix pour cette tournée", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val allWithPriceChecked = parcelsWithPrice.all { it.referenceNumber in checkedDeliveredRefs }
            if (allWithPriceChecked) {
                // Toggle off
                parcelsWithPrice.forEach { checkedDeliveredRefs.remove(it.referenceNumber) }
                Toast.makeText(this, "Colis avec prix décochés", Toast.LENGTH_SHORT).show()
            } else {
                // Check all with price
                parcelsWithPrice.forEach { checkedDeliveredRefs.add(it.referenceNumber) }
                playSuccessFeedback()
                val totalCod = parcelsWithPrice.sumOf { it.amount }
                val amtFmt = String.format(Locale.FRENCH, "%,.2f MAD", totalCod)
                Toast.makeText(this, "✔ Tous les colis avec prix cochés (${parcelsWithPrice.size} colis • $amtFmt) !", Toast.LENGTH_SHORT).show()
            }
            updateUi()
        }

        // Step 1 Button: Inscan at Hub (Bottom bar)
        binding.btnInscanHub.setOnClickListener {
            val totalToScan = parcelsToScan.size
            val countScanned = scannedRefs.size

            if (countScanned == 0 && totalToScan > 0) {
                MaterialAlertDialogBuilder(this)
                    .setTitle("Inscan au Hub")
                    .setMessage(
                        "Aucun colis retourné n'a encore été scanné.\n\n" +
                        "Souhaitez-vous scanner les $totalToScan colis avec la caméra, ou les valider tous pour l'Inscan au Hub ?"
                    )
                    .setPositiveButton("📷 Scanner Caméra") { _, _ ->
                        binding.btnOpenCameraScan.performClick()
                    }
                    .setNeutralButton("Tout Inscanner ($totalToScan colis)") { _, _ ->
                        scannedRefs.addAll(parcelsToScan.map { it.referenceNumber })
                        updateUi()
                        performInscanAtHub()
                    }
                    .setNegativeButton("Annuler", null)
                    .show()
                return@setOnClickListener
            }

            performInscanAtHub()
        }

        // Step 2 Button: Settle Rider (Enabled after Inscan is completed)
        binding.btnSettleRider.setOnClickListener {
            val rider = currentRider ?: return@setOnClickListener
            val workerCode = getEffectiveWorkerCode()
            val totalDelivered = deliveredParcels.size
            val totalToScan = parcelsToScan.size

            // Enforce Inscan before Settle if there are undelivered parcels
            if (!isInscanCompleted && totalToScan > 0) {
                MaterialAlertDialogBuilder(this)
                    .setTitle("Inscan au Hub Requis")
                    .setMessage(
                        "Attention : Vous devez effectuer l'Inscan au Hub des $totalToScan colis non livrés (retours) avant de régler le livreur.\n\n" +
                        "Souhaitez-vous valider l'inscan au Hub maintenant ?"
                    )
                    .setPositiveButton("📥 Valider Inscan au Hub ($totalToScan)") { _, _ ->
                        scannedRefs.addAll(parcelsToScan.map { it.referenceNumber })
                        updateUi()
                        performInscanAtHub()
                    }
                    .setNegativeButton("Annuler", null)
                    .show()
                return@setOnClickListener
            }

            val totalDeliveredWithPrice = deliveredParcels.count { it.amount > 0.0 }
            val checkedWithPriceCount = deliveredParcels.count { it.amount > 0.0 && it.referenceNumber in checkedDeliveredRefs }
            val totalCheckedAmount = deliveredParcels.filter { it.referenceNumber in checkedDeliveredRefs }.sumOf { it.amount }
            val amountStr = String.format(Locale.FRENCH, "%,.2f MAD", rider.amountToPay)
            val checkedAmountStr = String.format(Locale.FRENCH, "%,.2f MAD", totalCheckedAmount)

            MaterialAlertDialogBuilder(this)
                .setTitle("Étape 2 : Régler le Livreur (Settlement)")
                .setMessage(
                    "Livreur : ${rider.name} ($workerCode)\n" +
                    "Montant COD total théorique : $amountStr\n\n" +
                    "✔ $checkedWithPriceCount / $totalDeliveredWithPrice colis livrés avec prix cochés ($checkedAmountStr).\n" +
                    (if (totalToScan > 0) "✔ $totalToScan colis retournés inscannés au Hub.\n\n" else "✔ Aucun retour (100% livrés).\n\n") +
                    "Valider le règlement maintenant ?"
                )
                .setPositiveButton("✔ Confirmer le Règlement") { _, _ ->
                    performSettlement(rider)
                }
                .setNeutralButton("🌐 Ouvrir Shipsy Web") { _, _ ->
                    openShipsyWebReconciliation(workerCode)
                }
                .setNegativeButton("Fermer", null)
                .show()
        }
    }

    private fun performInscanAtHub() {
        val codesToInscan = scannedRefs.toList()
        if (codesToInscan.isEmpty() && parcelsToScan.isNotEmpty()) {
            Toast.makeText(this, "Aucun colis sélectionné pour l'Inscan", Toast.LENGTH_SHORT).show()
            return
        }

        binding.progressAction.visibility = View.VISIBLE
        binding.btnInscanHub.isEnabled = false

        lifecycleScope.launch {
            val result = if (codesToInscan.isNotEmpty()) {
                repository.executeHubScan(HubScanMode.INSCAN, codesToInscan)
            } else {
                Result.success(null)
            }

            binding.progressAction.visibility = View.GONE
            binding.btnInscanHub.isEnabled = true

            if (result.isSuccess) {
                playSuccessFeedback()
                isInscanCompleted = true
                Toast.makeText(
                    this@RiderReconciliationActivity,
                    "✔ Inscan au hub validé avec succès (${codesToInscan.size} colis enregistrés à l'agence) !",
                    Toast.LENGTH_LONG
                ).show()
                updateUi()
            } else {
                playErrorFeedback()
                val err = result.exceptionOrNull()?.message ?: "Erreur réseau inconnue"
                MaterialAlertDialogBuilder(this@RiderReconciliationActivity)
                    .setTitle("Erreur Inscan au Hub")
                    .setMessage("Impossible de synchroniser l'inscan avec Shipsy :\n$err\n\nVoulez-vous quand même passer à l'étape suivante (Règlement) ?")
                    .setPositiveButton("Passer au Règlement") { _, _ ->
                        isInscanCompleted = true
                        updateUi()
                    }
                    .setNegativeButton("Réessayer", null)
                    .show()
            }
        }
    }

    private fun performSettlement(rider: RiderItem) {
        binding.progressAction.visibility = View.VISIBLE
        binding.btnSettleRider.isEnabled = false

        lifecycleScope.launch {
            val success = repository.settleRider(rider.id, "Réglé")
            binding.progressAction.visibility = View.GONE
            binding.btnSettleRider.isEnabled = true

            if (success) {
                playSuccessFeedback()
                binding.textRiderStatusPill.text = "✔ Réglé"
                binding.textRiderStatusPill.setBackgroundResource(R.drawable.bg_badge_finished)
                binding.textRiderStatusPill.setTextColor(ContextCompat.getColor(this@RiderReconciliationActivity, R.color.status_finished_text))

                val workerCode = getEffectiveWorkerCode()
                MaterialAlertDialogBuilder(this@RiderReconciliationActivity)
                    .setTitle("🎉 Règlement Validé")
                    .setMessage(
                        "Tournée du livreur ${rider.name} réglée avec succès !\n\n" +
                        "Inscan au hub : ✔ Validé sur Shipsy\n" +
                        "Montant COD encaissé : ${String.format(Locale.FRENCH, "%,.2f MAD", rider.amountToPay)}\n\n" +
                        "Pour finaliser la réconciliation financière sur Shipsy, ouvrir la page web ?"
                    )
                    .setPositiveButton("🌐 Finaliser sur Shipsy Web") { _, _ ->
                        openShipsyWebReconciliation(workerCode)
                        setResult(Activity.RESULT_OK)
                        finish()
                    }
                    .setNegativeButton("Terminer") { _, _ ->
                        setResult(Activity.RESULT_OK)
                        finish()
                    }
                    .show()
            } else {
                Toast.makeText(this@RiderReconciliationActivity, "Impossible d'enregistrer le statut", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun loadParcels() {
        val rider = currentRider ?: return

        lifecycleScope.launch {
            val list = if (rider.parcels.isNotEmpty()) {
                rider.parcels
            } else {
                repository.getParcelsForTrip(rider.code)
            }

            allParcels.clear()
            allParcels.addAll(list)

            // Apply any already cached details (including attempt count)
            applyCachedDetailsToParcels()

            // Split into delivered and undelivered/returns
            syncSplitLists()

            // Auto-check all delivered parcels that have a price (amount > 0)
            checkedDeliveredRefs.clear()
            checkedDeliveredRefs.addAll(deliveredParcels.filter { it.amount > 0.0 }.map { it.referenceNumber })

            // If rider has 0 returns (100% delivered), Inscan step is automatically completed!
            if (parcelsToScan.isEmpty()) {
                isInscanCompleted = true
            }

            updateUi()

            // Enrich parcels with full details (attempts count, detailed failure reasons, customer phone) in background
            enrichParcelsAttempts()
        }
    }

    private fun enrichParcelsAttempts() {
        lifecycleScope.launch {
            val toFetch = allParcels.filter { p ->
                val cached = repository.getCachedConsignmentDetails(p.referenceNumber)
                cached == null || (cached.attemptCount ?: 0) == 0
            }
            if (toFetch.isEmpty()) return@launch

            val sem = Semaphore(3)
            coroutineScope {
                toFetch.map { parcel ->
                    async(Dispatchers.IO) {
                        sem.withPermit {
                            repository.fetchConsignmentFullDetails(parcel.referenceNumber, isRetryAfterLogin = false).getOrNull()
                        }
                    }
                }.awaitAll()
            }

            applyCachedDetailsToParcels()
        }
    }

    private fun applyCachedDetailsToParcels(targetRef: String? = null) {
        var changed = false
        for (i in 0 until allParcels.size) {
            val p = allParcels[i]
            if (targetRef != null && !p.referenceNumber.equals(targetRef, ignoreCase = true)) continue
            val cached = repository.getCachedConsignmentDetails(p.referenceNumber)
            if (cached != null) {
                val attempts = when {
                    (cached.attemptCount ?: 0) > 0 -> cached.attemptCount!!
                    !cached.failureReason.isNullOrBlank() && !cached.failureReason.equals("Non livré", ignoreCase = true) -> 1
                    else -> p.attemptCount
                }
                if (attempts != p.attemptCount || (!cached.failureReason.isNullOrBlank() && cached.failureReason != p.failureReason)) {
                    allParcels[i] = p.copy(
                        attemptCount = attempts,
                        failureReason = cached.failureReason ?: p.failureReason,
                        recipientPhone = cached.destinationPhone ?: p.recipientPhone,
                        recipientName = cached.destinationName ?: p.recipientName,
                        address = cached.destinationAddress ?: p.address
                    )
                    changed = true
                }
            }
        }
        if (changed) {
            syncSplitLists()
            updateListDisplay()
        }
    }

    private fun syncSplitLists() {
        deliveredParcels.clear()
        parcelsToScan.clear()
        allParcels.forEach { p ->
            if (p.status == ParcelStatus.DELIVERED) {
                deliveredParcels.add(p)
            } else {
                parcelsToScan.add(p)
            }
        }
    }

    private fun updateUi() {
        val totalAll = allParcels.size
        val totalDelivered = deliveredParcels.size
        val totalToScan = parcelsToScan.size
        val scannedCount = scannedRefs.size
        val remainingCount = (totalToScan - scannedCount).coerceAtLeast(0)

        // KPI Numbers
        binding.textKpiTotal.text = "$totalAll"
        binding.textKpiDelivered.text = "$totalDelivered"
        binding.textKpiReturns.text = "$totalToScan"

        // Progress calculation
        val percent = if (totalToScan > 0) {
            ((scannedCount * 100) / totalToScan).coerceIn(0, 100)
        } else 100

        binding.progressReconcile.progress = percent
        binding.textScannedCountBadge.text = "$scannedCount / $totalToScan scannés ($percent%)"

        // Tabs badge text
        binding.tabUnscanned.text = "⏳ À Scanner ($remainingCount)"
        binding.tabScanned.text = "✔ Scannés ($scannedCount)"
        binding.tabDelivered.text = "🚚 Livrés ($totalDelivered)"
        binding.tabAll.text = "Tous ($totalAll)"

        // Update Inscan & Delivered Action Cards in the tabs
        val totalDeliveredWithPrice = deliveredParcels.count { it.amount > 0.0 }
        val checkedWithPriceCount = deliveredParcels.count { it.amount > 0.0 && it.referenceNumber in checkedDeliveredRefs }
        val totalCheckedAmount = deliveredParcels.filter { it.referenceNumber in checkedDeliveredRefs }.sumOf { it.amount }

        when (currentFilterTab) {
            TAB_DELIVERED -> {
                binding.cardDeliveredAction.visibility = View.VISIBLE
                binding.cardNotDeliveredAction.visibility = View.GONE

                binding.textDeliveredCheckedCount.text = "Colis avec prix : $checkedWithPriceCount / $totalDeliveredWithPrice cochés"
                binding.textDeliveredCheckedAmount.text = "Total COD coché : ${String.format(Locale.FRENCH, "%,.2f MAD", totalCheckedAmount)}"

                val allChecked = totalDeliveredWithPrice > 0 && checkedWithPriceCount == totalDeliveredWithPrice
                binding.btnCheckAllWithPrice.text = if (allChecked) "✔ Tout avec prix coché" else "☑ Tout cocher avec prix"
            }
            TAB_UNSCANNED, TAB_SCANNED -> {
                binding.cardDeliveredAction.visibility = View.GONE
                binding.cardNotDeliveredAction.visibility = if (totalToScan > 0) View.VISIBLE else View.GONE

                if (isInscanCompleted) {
                    binding.textNotDeliveredTitle.text = "Retours : $totalToScan colis inscannés au Hub"
                    binding.textNotDeliveredSubtitle.text = "Inscan au Hub validé avec succès."
                    binding.btnInscanTab.text = "✔ Retours inscannés"
                    binding.btnInscanTab.isEnabled = false
                    binding.btnInscanTab.backgroundTintList = ContextCompat.getColorStateList(this, R.color.settlement_green)
                } else {
                    binding.textNotDeliveredTitle.text = "Colis non livrés : $remainingCount à scanner / $totalToScan total"
                    binding.textNotDeliveredSubtitle.text = "Inscannez les retours au Hub avant de régler le livreur"
                    binding.btnInscanTab.isEnabled = true
                    binding.btnInscanTab.backgroundTintList = ContextCompat.getColorStateList(this, R.color.badge_blue_text)
                    binding.btnInscanTab.text = if (scannedCount > 0) "📥 Inscan au Hub ($scannedCount)" else "📥 Inscan au Hub ($totalToScan)"
                }
            }
            else -> {
                binding.cardDeliveredAction.visibility = View.GONE
                binding.cardNotDeliveredAction.visibility = View.GONE
            }
        }

        // Update Stepper Visuals
        updateStepperVisuals(totalToScan, remainingCount)

        // Update Bottom Sticky Action Bar (Step 1 -> Step 2)
        updateBottomActionBar(totalToScan, scannedCount, remainingCount)

        updateFilterTabsStyle()
        updateListDisplay()
    }

    private fun updateStepperVisuals(totalToScan: Int, remainingCount: Int) {
        if (isInscanCompleted) {
            // Step 1 is DONE
            binding.step1Indicator.backgroundTintList = ContextCompat.getColorStateList(this, R.color.status_finished_bg)
            binding.step1Badge.backgroundTintList = ContextCompat.getColorStateList(this, R.color.settlement_green)
            binding.step1Badge.text = "✔"
            binding.step1Title.setTextColor(ContextCompat.getColor(this, R.color.status_finished_text))

            // Step 2 is ACTIVE
            binding.step2Indicator.backgroundTintList = ContextCompat.getColorStateList(this, R.color.badge_blue_bg)
            binding.step2Badge.backgroundTintList = ContextCompat.getColorStateList(this, R.color.chrono_primary)
            binding.step2Badge.setTextColor(ContextCompat.getColor(this, android.R.color.white))
            binding.step2Title.setTextColor(ContextCompat.getColor(this, R.color.chrono_primary))
        } else {
            // Step 1 is ACTIVE
            binding.step1Indicator.backgroundTintList = ContextCompat.getColorStateList(this, R.color.badge_blue_bg)
            binding.step1Badge.backgroundTintList = ContextCompat.getColorStateList(this, R.color.chrono_primary)
            binding.step1Badge.text = "1"
            binding.step1Title.setTextColor(ContextCompat.getColor(this, R.color.chrono_primary))

            // Step 2 is INACTIVE
            binding.step2Indicator.backgroundTintList = null
            binding.step2Badge.backgroundTintList = null
            binding.step2Badge.setTextColor(ContextCompat.getColor(this, R.color.text_muted))
            binding.step2Title.setTextColor(ContextCompat.getColor(this, R.color.text_muted))
        }

        // Celebration card
        if (totalToScan > 0 && remainingCount == 0 && !isInscanCompleted) {
            binding.cardCelebration.visibility = View.VISIBLE
            binding.textCelebrationTitle.text = "RETOURS CONTRÔLÉS AVEC SUCCÈS !"
            binding.textCelebrationSubtitle.text = "Cliquez sur 'Inscan au Hub' ci-dessous pour enregistrer les retours, puis réglez le livreur."
        } else if (isInscanCompleted && currentRider?.isReconciled == false) {
            binding.cardCelebration.visibility = View.VISIBLE
            binding.textCelebrationTitle.text = "INSCAN AU HUB EFFECTUÉ !"
            binding.textCelebrationSubtitle.text = "Tous les retours sont enregistrés. Cliquez sur 'Régler le Livreur' pour clôturer."
        } else {
            binding.cardCelebration.visibility = View.GONE
        }
    }

    private fun updateBottomActionBar(totalToScan: Int, scannedCount: Int, remainingCount: Int) {
        val rider = currentRider ?: return
        val isAlreadyReconciled = rider.isReconciled
        val amtStr = String.format(Locale.FRENCH, "%,.2f MAD", rider.amountToPay)

        if (isAlreadyReconciled) {
            binding.btnInscanHub.visibility = View.GONE
            binding.btnSettleRider.visibility = View.VISIBLE
            binding.btnSettleRider.isEnabled = false
            binding.btnSettleRider.alpha = 0.5f
            binding.btnSettleRider.text = "✔ CIRCUIT DÉJÀ RÉGLÉ ($amtStr)"
            binding.textSettleHint.text = "Ce livreur a déjà été réconcilié et réglé."
            binding.textSettleHint.setTextColor(ContextCompat.getColor(this, R.color.status_finished_text))
            return
        }

        if (!isInscanCompleted) {
            // STEP 1: Inscan at Hub is the primary button
            binding.btnInscanHub.visibility = View.VISIBLE
            binding.btnSettleRider.visibility = View.GONE

            if (totalToScan == 0) {
                // No returns to scan!
                binding.btnInscanHub.text = "📥 1. INSCAN AU HUB (0 RETOURS)"
                binding.textSettleHint.text = "Aucun retour à scanner pour cette tournée."
            } else if (remainingCount == 0) {
                binding.btnInscanHub.text = "📥 1. VALIDER L'INSCAN AU HUB ($scannedCount COLIS)"
                binding.textSettleHint.text = "Tous les retours ont été scannés. Validez l'inscan au hub."
                binding.textSettleHint.setTextColor(ContextCompat.getColor(this, R.color.chrono_primary))
            } else {
                binding.btnInscanHub.text = "📥 1. INSCAN AU HUB ($scannedCount / $totalToScan SCANNÉS)"
                binding.textSettleHint.text = "Scannez les $remainingCount retours restants pour débloquer le règlement."
                binding.textSettleHint.setTextColor(ContextCompat.getColor(this, R.color.text_muted))
            }
        } else {
            // STEP 2: Settle Rider is the primary button!
            binding.btnInscanHub.visibility = View.GONE
            binding.btnSettleRider.visibility = View.VISIBLE
            binding.btnSettleRider.isEnabled = true
            binding.btnSettleRider.alpha = 1.0f
            binding.btnSettleRider.text = "💰 2. RÉGLER LE LIVREUR ($amtStr)"
            binding.textSettleHint.text = "Étape 2 : Tous les colis sont vérifiés. Vous pouvez régler le livreur."
            binding.textSettleHint.setTextColor(ContextCompat.getColor(this, R.color.status_finished_text))
        }
    }

    private fun updateFilterTabsStyle() {
        val selectedBg = R.drawable.bg_badge_amount
        val normalBg = R.drawable.bg_badge_code

        binding.tabUnscanned.setBackgroundResource(if (currentFilterTab == TAB_UNSCANNED) selectedBg else normalBg)
        binding.tabUnscanned.backgroundTintList = if (currentFilterTab == TAB_UNSCANNED) ContextCompat.getColorStateList(this, R.color.status_undelivered_bg) else null
        binding.tabUnscanned.setTextColor(ContextCompat.getColor(this, if (currentFilterTab == TAB_UNSCANNED) R.color.status_undelivered_text else R.color.text_secondary))

        binding.tabScanned.setBackgroundResource(if (currentFilterTab == TAB_SCANNED) selectedBg else normalBg)
        binding.tabScanned.backgroundTintList = if (currentFilterTab == TAB_SCANNED) ContextCompat.getColorStateList(this, R.color.status_finished_bg) else null
        binding.tabScanned.setTextColor(ContextCompat.getColor(this, if (currentFilterTab == TAB_SCANNED) R.color.status_finished_text else R.color.text_secondary))

        binding.tabDelivered.setBackgroundResource(if (currentFilterTab == TAB_DELIVERED) selectedBg else normalBg)
        binding.tabDelivered.backgroundTintList = if (currentFilterTab == TAB_DELIVERED) ContextCompat.getColorStateList(this, R.color.status_finished_bg) else null
        binding.tabDelivered.setTextColor(ContextCompat.getColor(this, if (currentFilterTab == TAB_DELIVERED) R.color.status_finished_text else R.color.text_secondary))

        binding.tabAll.setBackgroundResource(if (currentFilterTab == TAB_ALL) selectedBg else normalBg)
        binding.tabAll.backgroundTintList = if (currentFilterTab == TAB_ALL) ContextCompat.getColorStateList(this, R.color.badge_blue_bg) else null
        binding.tabAll.setTextColor(ContextCompat.getColor(this, if (currentFilterTab == TAB_ALL) R.color.badge_blue_text else R.color.text_secondary))
    }

    private fun updateListDisplay() {
        val filtered = when (currentFilterTab) {
            TAB_UNSCANNED -> parcelsToScan.filter { it.referenceNumber !in scannedRefs }
            TAB_SCANNED -> parcelsToScan.filter { it.referenceNumber in scannedRefs }
            TAB_DELIVERED -> deliveredParcels
            TAB_ALL -> allParcels
            else -> parcelsToScan
        }

        val uiList = filtered.map { parcel ->
            ReconcileParcelUiModel(
                parcel = parcel,
                isScanned = parcel.referenceNumber in scannedRefs || isInscanCompleted,
                isDeliveredChecked = parcel.referenceNumber in checkedDeliveredRefs,
                isDeliveredMode = currentFilterTab == TAB_DELIVERED || parcel.status == ParcelStatus.DELIVERED
            )
        }

        adapter.submitList(uiList)

        if (filtered.isEmpty()) {
            binding.recyclerParcels.visibility = View.GONE
            binding.layoutEmptyParcels.visibility = View.VISIBLE
            when (currentFilterTab) {
                TAB_UNSCANNED -> {
                    if (parcelsToScan.isEmpty()) {
                        binding.textEmptyTitle.text = "Aucun colis non-livré"
                        binding.textEmptySubtitle.text = "Tous les colis ont été livrés avec succès."
                    } else {
                        binding.textEmptyTitle.text = "Tous les retours ont été scannés !"
                        binding.textEmptySubtitle.text = "Aucun colis non-livré restant dans la file d'attente."
                    }
                }
                TAB_SCANNED -> {
                    binding.textEmptyTitle.text = "Aucun colis scanné"
                    binding.textEmptySubtitle.text = "Scannez les colis retournés avec la caméra."
                }
                TAB_DELIVERED -> {
                    binding.textEmptyTitle.text = "Aucun colis livré"
                    binding.textEmptySubtitle.text = "Cette tournée ne contient aucun colis livré."
                }
                TAB_ALL -> {
                    binding.textEmptyTitle.text = "Aucun colis trouvé"
                    binding.textEmptySubtitle.text = "La liste des colis est vide."
                }
            }
        } else {
            binding.recyclerParcels.visibility = View.VISIBLE
            binding.layoutEmptyParcels.visibility = View.GONE
        }
    }

    private fun getEffectiveWorkerCode(): String {
        val rider = currentRider ?: return "RIDER"
        return rider.workerCode?.takeIf { it.isNotBlank() } ?: rider.code
    }

    private fun copyToClipboard(text: String, toastMsg: String) {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        val clip = ClipData.newPlainText("amount", text)
        clipboard?.setPrimaryClip(clip)
        Toast.makeText(this, toastMsg, Toast.LENGTH_SHORT).show()
    }

    private fun openShipsyWebReconciliation(workerCode: String) {
        val url = "https://cross.chronodiali.ma/ops/reconciliation/recon/$workerCode"
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        try {
            startActivity(intent)
        } catch (_: Exception) {
            Toast.makeText(this, "Impossible d'ouvrir le navigateur pour $url", Toast.LENGTH_SHORT).show()
        }
    }

    private fun playSuccessFeedback() {
        try {
            toneGenerator?.startTone(ToneGenerator.TONE_PROP_BEEP, 120)
        } catch (_: Exception) {}

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vibratorManager?.defaultVibrator?.vibrate(VibrationEffect.createOneShot(70, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                @Suppress("DEPRECATION")
                vibrator?.vibrate(70)
            }
        } catch (_: Exception) {}
    }

    private fun playErrorFeedback() {
        try {
            toneGenerator?.startTone(ToneGenerator.TONE_PROP_NACK, 250)
        } catch (_: Exception) {}

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vibratorManager?.defaultVibrator?.vibrate(VibrationEffect.createOneShot(200, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                @Suppress("DEPRECATION")
                vibrator?.vibrate(200)
            }
        } catch (_: Exception) {}
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            toneGenerator?.release()
        } catch (_: Exception) {}
    }

    companion object {
        const val EXTRA_RIDER = "extra_rider"
        private const val TAB_UNSCANNED = 0
        private const val TAB_SCANNED = 1
        private const val TAB_DELIVERED = 2
        private const val TAB_ALL = 3

        fun createIntent(context: Context, rider: RiderItem): Intent {
            return Intent(context, RiderReconciliationActivity::class.java).apply {
                putExtra(EXTRA_RIDER, rider)
            }
        }
    }
}
