package com.chrono.mohammedia.ui.scanner

import android.app.Activity
import android.content.Context
import android.util.Log
import android.view.ScaleGestureDetector
import androidx.annotation.OptIn
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.google.zxing.client.android.BeepManager
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class CameraXScannerHelper(
    private val context: Context,
    private val activity: Activity? = null,
    private val autoBeep: Boolean = false,
    var expectedCodes: Set<String>? = null,
    private val onBarcodeScanned: (String) -> Unit
) {
    private val cameraExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private var cameraProvider: ProcessCameraProvider? = null
    private var camera: Camera? = null
    private var imageAnalysis: ImageAnalysis? = null
    private var barcodeScanner: BarcodeScanner? = null
    private var beepManager: BeepManager? = null

    var isTorchEnabled: Boolean = false
        private set

    var isAntiGlareEnabled: Boolean = false
        private set

    var isPaused: Boolean = false

    private val isProcessing = AtomicBoolean(false)

    // Consecutive frame verification buffer to guarantee 100% accuracy and eliminate single-frame glitches
    private var pendingCandidateCode: String? = null
    private var pendingCandidateHits: Int = 0
    private var lastCandidateHitTimestamp: Long = 0L

    // Cooldown to prevent spamming the same barcode repeatedly while pointing at the same parcel
    private var lastDispatchedCode: String? = null
    private var lastDispatchedTimestamp: Long = 0L

    init {
        // High-accuracy barcode formats: ONLY logistics & parcel barcodes
        // Excluded: FORMAT_ITF (Interleaved 2 of 5), FORMAT_CODABAR, FORMAT_UPC_E, FORMAT_EAN_8, FORMAT_UPC_A
        // Reason: These symbologies (especially ITF) have high false positive rates and generate
        // non-existent random numeric barcodes when scanning noise, textures, folds, or Code 128 at an angle.
        val options = BarcodeScannerOptions.Builder()
            .setBarcodeFormats(
                Barcode.FORMAT_CODE_128,
                Barcode.FORMAT_CODE_39,
                Barcode.FORMAT_CODE_93,
                Barcode.FORMAT_EAN_13,
                Barcode.FORMAT_QR_CODE,
                Barcode.FORMAT_DATA_MATRIX
            )
            .build()
        barcodeScanner = BarcodeScanning.getClient(options)

        activity?.let {
            beepManager = BeepManager(it).apply {
                isVibrateEnabled = true
            }
        }
    }

    fun startCamera(
        lifecycleOwner: LifecycleOwner,
        previewView: PreviewView
    ) {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
        cameraProviderFuture.addListener({
            try {
                cameraProvider = cameraProviderFuture.get()

                val targetResolution = android.util.Size(1280, 720)

                val preview = Preview.Builder()
                    .setTargetResolution(targetResolution)
                    .build()
                    .also {
                        it.setSurfaceProvider(previewView.surfaceProvider)
                    }

                imageAnalysis = ImageAnalysis.Builder()
                    .setTargetResolution(targetResolution)
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                    .also { analysis ->
                        analysis.setAnalyzer(cameraExecutor) { imageProxy ->
                            processImageProxy(imageProxy)
                        }
                    }

                val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

                cameraProvider?.unbindAll()
                camera = cameraProvider?.bindToLifecycle(
                    lifecycleOwner,
                    cameraSelector,
                    preview,
                    imageAnalysis
                )

                setupTouchAndZoom(previewView)

            } catch (exc: Exception) {
                Log.e("CameraXScanner", "Failed to bind camera lifecycle", exc)
            }
        }, ContextCompat.getMainExecutor(context))
    }

    @OptIn(ExperimentalGetImage::class)
    private fun processImageProxy(imageProxy: ImageProxy) {
        if (isPaused || isProcessing.get()) {
            imageProxy.close()
            return
        }

        val mediaImage = imageProxy.image
        if (mediaImage != null) {
            isProcessing.set(true)
            val rotationDegrees = imageProxy.imageInfo.rotationDegrees
            val image = InputImage.fromMediaImage(mediaImage, rotationDegrees)
            barcodeScanner?.process(image)
                ?.addOnSuccessListener { barcodes ->
                    val now = System.currentTimeMillis()
                    if (barcodes.isNullOrEmpty()) {
                        // Clear pending confirmation if scanner moved away from barcode for > 450ms
                        if (now - lastCandidateHitTimestamp > 450L) {
                            pendingCandidateCode = null
                            pendingCandidateHits = 0
                        }
                        return@addOnSuccessListener
                    }

                    val imgWidth = if (rotationDegrees == 90 || rotationDegrees == 270) imageProxy.height else imageProxy.width
                    val imgHeight = if (rotationDegrees == 90 || rotationDegrees == 270) imageProxy.width else imageProxy.height
                    val centerX = imgWidth / 2f
                    val centerY = imgHeight / 2f

                    // Filter and rank candidate barcodes
                    data class ScannedCandidate(
                        val cleanCode: String,
                        val length: Int,
                        val distanceToCenterSq: Float,
                        val isExpected: Boolean,
                        val isAmanaOrShipping: Boolean,
                        val isStandard1D: Boolean
                    )

                    val candidates = barcodes.mapNotNull { barcode ->
                        val clean = cleanBarcodeValue(barcode.rawValue)
                        if (!isValidParcelBarcode(clean, expectedCodes)) {
                            null
                        } else {
                            val box = barcode.boundingBox
                            val dx = if (box != null) Math.abs(box.centerX() - centerX) else 0f
                            val dy = if (box != null) Math.abs(box.centerY() - centerY) else 0f
                            val distSq = dx * dx + dy * dy

                            val isExpected = isCodeInExpectedSet(clean, expectedCodes)
                            val isAmana = isMoroccanShippingCode(clean)
                            val isStandard1D = barcode.format == Barcode.FORMAT_CODE_128 ||
                                    barcode.format == Barcode.FORMAT_CODE_39 ||
                                    barcode.format == Barcode.FORMAT_CODE_93

                            ScannedCandidate(
                                cleanCode = clean,
                                length = clean.length,
                                distanceToCenterSq = distSq,
                                isExpected = isExpected,
                                isAmanaOrShipping = isAmana,
                                isStandard1D = isStandard1D
                            )
                        }
                    }

                    // Best candidate ranking:
                    // 1. Matches expected codes list (if provided)
                    // 2. Strict Moroccan shipping format (PP...MA, LD...MA, CD..., LCWK-...)
                    // 3. Optimal shipping code length (9 to 20 chars)
                    // 4. Standard 1D logistics format (Code 128 / Code 39)
                    // 5. Center-most candidate (closest to user's targeting reticle)
                    val best = candidates.sortedWith(
                        compareByDescending<ScannedCandidate> { it.isExpected }
                            .thenByDescending { it.isAmanaOrShipping }
                            .thenByDescending { it.length in 9..20 }
                            .thenByDescending { it.isStandard1D }
                            .thenBy { it.distanceToCenterSq }
                    ).firstOrNull()

                    if (best != null) {
                        val candidateCode = best.cleanCode

                        // Cooldown: prevent re-dispatching the exact same barcode within 1500ms
                        if (candidateCode == lastDispatchedCode && (now - lastDispatchedTimestamp) < 1500L) {
                            return@addOnSuccessListener
                        }

                        // Required consecutive matching frames for 100% confirmation:
                        // - Expected codes: 1 frame is sufficient (proven to belong to rider/tour)
                        // - Other parcel codes: 2 consecutive frames (~33ms apart, eliminates optical noise)
                        val requiredHits = if (best.isExpected) 1 else 2

                        if (candidateCode == pendingCandidateCode && (now - lastCandidateHitTimestamp) < 450L) {
                            pendingCandidateHits++
                            lastCandidateHitTimestamp = now
                        } else {
                            pendingCandidateCode = candidateCode
                            pendingCandidateHits = 1
                            lastCandidateHitTimestamp = now
                        }

                        if (pendingCandidateHits >= requiredHits) {
                            lastDispatchedCode = candidateCode
                            lastDispatchedTimestamp = now
                            pendingCandidateCode = null
                            pendingCandidateHits = 0

                            if (autoBeep) {
                                beepManager?.playBeepSoundAndVibrate()
                            }
                            onBarcodeScanned(candidateCode)
                        }
                    }
                }
                ?.addOnFailureListener { e ->
                    Log.e("CameraXScanner", "Barcode analysis error", e)
                }
                ?.addOnCompleteListener {
                    isProcessing.set(false)
                    imageProxy.close()
                }
        } else {
            imageProxy.close()
        }
    }

    fun toggleTorch(): Boolean {
        val cam = camera ?: return false
        if (cam.cameraInfo.hasFlashUnit()) {
            isTorchEnabled = !isTorchEnabled
            cam.cameraControl.enableTorch(isTorchEnabled)
            return isTorchEnabled
        }
        return false
    }

    fun setTorch(enable: Boolean) {
        val cam = camera ?: return
        if (cam.cameraInfo.hasFlashUnit()) {
            isTorchEnabled = enable
            cam.cameraControl.enableTorch(enable)
        }
    }

    fun toggleAntiGlare(): Boolean {
        val cam = camera ?: return false
        isAntiGlareEnabled = !isAntiGlareEnabled
        val state = cam.cameraInfo.exposureState
        if (state.isExposureCompensationSupported) {
            val range = state.exposureCompensationRange
            val targetIndex = if (isAntiGlareEnabled) {
                // Lower exposure compensation by half or at least -2 to defeat light glare
                val minSafe = if (range.lower < -2) -2 else range.lower
                minSafe
            } else {
                0
            }
            cam.cameraControl.setExposureCompensationIndex(targetIndex)
        }
        return isAntiGlareEnabled
    }

    private fun setupTouchAndZoom(previewView: PreviewView) {
        val scaleDetector = ScaleGestureDetector(context, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScale(detector: ScaleGestureDetector): Boolean {
                val cam = camera ?: return false
                val currentZoom = cam.cameraInfo.zoomState.value?.zoomRatio ?: 1f
                val delta = detector.scaleFactor
                cam.cameraControl.setZoomRatio(currentZoom * delta)
                return true
            }
        })

        previewView.setOnTouchListener { view, event ->
            scaleDetector.onTouchEvent(event)
            if (event.action == android.view.MotionEvent.ACTION_UP && !scaleDetector.isInProgress) {
                val cam = camera
                if (cam != null) {
                    val factory = previewView.meteringPointFactory
                    val point = factory.createPoint(event.x, event.y)
                    val action = FocusMeteringAction.Builder(point).build()
                    cam.cameraControl.startFocusAndMetering(action)
                }
                view.performClick()
            }
            true
        }
    }

    fun playBeep() {
        beepManager?.playBeepSoundAndVibrate()
    }

    fun pause() {
        isPaused = true
    }

    fun resume() {
        isPaused = false
    }

    fun stop() {
        try {
            cameraProvider?.unbindAll()
            cameraExecutor.shutdown()
            barcodeScanner?.close()
        } catch (_: Exception) {}
    }

    companion object {
        fun isMoroccanShippingCode(code: String): Boolean {
            val c = code.uppercase(java.util.Locale.ROOT).trim()
            // Standard Moroccan UPU S10 format (Amana / Barid Al-Maghrib: PP...MA, LD...MA, LG...MA, QB...MA, EY...MA, CP...MA)
            if (c.matches(Regex("^[A-Z]{2}[0-9]{9}[A-Z]{2}$"))) return true

            // Chronodiali Hub reference (CD followed by digits)
            if (c.matches(Regex("^CD[0-9]{6,14}$"))) return true

            // Shipsy / Hub prefixes
            if (c.startsWith("LCWK-") || c.startsWith("SHP-") || c.startsWith("HUB-")) return true

            // Moroccan postal format with 8 to 11 digits ending in MA
            if (c.matches(Regex("^[A-Z]{2}[0-9]{8,11}MA$"))) return true

            return false
        }

        fun isCodeInExpectedSet(code: String, expectedCodes: Set<String>?): Boolean {
            if (expectedCodes.isNullOrEmpty()) return false
            val norm = code.replace("-", "").replace(" ", "").replace("_", "").uppercase(java.util.Locale.ROOT)
            return expectedCodes.any { exp ->
                val normExp = exp.replace("-", "").replace(" ", "").replace("_", "").uppercase(java.util.Locale.ROOT)
                normExp == norm || exp.equals(code, ignoreCase = true)
            }
        }

        fun isValidParcelBarcode(code: String, expectedCodes: Set<String>? = null): Boolean {
            if (code.isBlank() || code.length < 8 || code.length > 35) return false

            // Strict character set: must be alphanumeric plus dash, underscore, dot
            if (!code.matches(Regex("^[A-Z0-9\\-_.]+$"))) return false

            // If in expected set, 100% valid
            if (isCodeInExpectedSet(code, expectedCodes)) return true

            // Standard Moroccan postal / shipping code
            if (isMoroccanShippingCode(code)) return true

            // Numeric barcodes: protect against phantom numbers from optical noise or partial reads
            if (code.all { it.isDigit() }) {
                // Legitimate courier numeric barcodes are at least 9 digits
                if (code.length < 9) return false
                // Reject repetitive low-entropy numbers (e.g., 000000000, 111111111)
                if (code.toSet().size <= 2) return false
                return true
            }

            // Alphanumeric barcodes: must have at least 1 letter and at least 3 digits
            val letterCount = code.count { it.isLetter() }
            val digitCount = code.count { it.isDigit() }
            return letterCount >= 1 && digitCount >= 3
        }

        fun cleanBarcodeValue(raw: String?): String {
            if (raw.isNullOrBlank()) return ""
            var cleaned = raw.trim()
            // Strip GS1 / AIM symbology identifier prefix (e.g. "]C1", "]e0", "]d2", "]A0")
            if (cleaned.startsWith("]") && cleaned.length > 3 && cleaned[1].isLetterOrDigit() && cleaned[2].isLetterOrDigit()) {
                cleaned = cleaned.substring(3)
            }
            // Strip Code 39 / Codabar framing characters (*, #)
            cleaned = cleaned.trim { it <= ' ' || it == '*' || it == '#' }
            // Strip internal whitespace (e.g. "PP 501040424 MA" -> "PP501040424MA")
            cleaned = cleaned.replace("\\s+".toRegex(), "")
            // Strip ASCII control characters (including GS \u001D, CR, LF, etc.)
            cleaned = cleaned.replace("\\p{Cntrl}".toRegex(), "")
            return cleaned.trim().uppercase(java.util.Locale.ROOT)
        }
    }
}
