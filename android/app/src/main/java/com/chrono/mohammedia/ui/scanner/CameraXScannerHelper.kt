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

    init {
        val options = BarcodeScannerOptions.Builder()
            .setBarcodeFormats(
                Barcode.FORMAT_CODE_128,
                Barcode.FORMAT_CODE_39,
                Barcode.FORMAT_CODE_93,
                Barcode.FORMAT_CODABAR,
                Barcode.FORMAT_ITF,
                Barcode.FORMAT_EAN_13,
                Barcode.FORMAT_EAN_8,
                Barcode.FORMAT_UPC_A,
                Barcode.FORMAT_UPC_E,
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
                    if (barcodes.isNullOrEmpty()) return@addOnSuccessListener

                    val imgWidth = if (rotationDegrees == 90 || rotationDegrees == 270) imageProxy.height else imageProxy.width
                    val imgHeight = if (rotationDegrees == 90 || rotationDegrees == 270) imageProxy.width else imageProxy.height
                    val centerX = imgWidth / 2f
                    val centerY = imgHeight / 2f

                    // Filter and rank candidate barcodes
                    data class ScannedCandidate(
                        val cleanCode: String,
                        val length: Int,
                        val distanceToCenterSq: Float,
                        val isStandardFormat: Boolean,
                        val isAmanaOrShipping: Boolean
                    )

                    val candidates = barcodes.mapNotNull { barcode ->
                        val clean = cleanBarcodeValue(barcode.rawValue)
                        if (clean.length < 6) null
                        else {
                            val box = barcode.boundingBox
                            val dx = if (box != null) Math.abs(box.centerX() - centerX) else 0f
                            val dy = if (box != null) Math.abs(box.centerY() - centerY) else 0f

                            val distSq = dx * dx + dy * dy
                            val isStandard = barcode.format == Barcode.FORMAT_CODE_128 ||
                                    barcode.format == Barcode.FORMAT_CODE_39 ||
                                    barcode.format == Barcode.FORMAT_CODE_93 ||
                                    barcode.format == Barcode.FORMAT_ITF
                            val isAmana = isMoroccanShippingCode(clean)

                            ScannedCandidate(
                                cleanCode = clean,
                                length = clean.length,
                                distanceToCenterSq = distSq,
                                isStandardFormat = isStandard,
                                isAmanaOrShipping = isAmana
                            )
                        }
                    }

                    // Best candidate:
                    // 1. Moroccan Amana / Chronodiali code (PP...MA, QB...MA, CD..., LCWK-...)
                    // 2. Shipping tracking format (length >= 9)
                    // 3. Standard 1D barcode format (Code 128, Code 39)
                    // 4. Center-most candidate (closest to user's targeting reticle)
                    val best = candidates.sortedWith(
                        compareByDescending<ScannedCandidate> { it.isAmanaOrShipping }
                            .thenByDescending { it.length in 9..20 }
                            .thenByDescending { it.isStandardFormat }
                            .thenBy { it.distanceToCenterSq }
                    ).firstOrNull()

                    if (best != null) {
                        if (autoBeep) {
                            beepManager?.playBeepSoundAndVibrate()
                        }
                        onBarcodeScanned(best.cleanCode)
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
            return c.matches(Regex("^[A-Z]{2}[0-9]{9}[A-Z]{2}$")) ||
                   c.matches(Regex("^CD[0-9]{8,12}$")) ||
                   c.startsWith("LCWK-") ||
                   (c.length in 10..15 && c.endsWith("MA"))
        }

        fun cleanBarcodeValue(raw: String?): String {
            if (raw.isNullOrBlank()) return ""
            var cleaned = raw.trim()
            // Strip GS1 symbology prefixes (e.g. "]C1", "]e0", "]d2", "]A0")
            if (cleaned.startsWith("]") && cleaned.length > 3) {
                cleaned = cleaned.substring(3)
            }
            // Strip Code 39 framing characters (*, #)
            cleaned = cleaned.trim { it <= ' ' || it == '*' || it == '#' }
            // Strip internal whitespace (e.g. "PP 501040424 MA" -> "PP501040424MA")
            cleaned = cleaned.replace("\\s+".toRegex(), "")
            // Strip ASCII control characters (including GS \u001D, CR, LF, etc.)
            cleaned = cleaned.replace("\\p{Cntrl}".toRegex(), "")
            return cleaned.trim().uppercase(java.util.Locale.ROOT)
        }
    }
}
