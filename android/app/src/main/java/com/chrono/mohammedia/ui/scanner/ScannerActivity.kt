package com.chrono.mohammedia.ui.scanner

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import com.chrono.mohammedia.databinding.ActivityScannerBinding

class ScannerActivity : AppCompatActivity() {

    private lateinit var binding: ActivityScannerBinding
    private var scannerHelper: CameraXScannerHelper? = null
    
    private var isBatchMode = false
    private val scannedCodes = mutableSetOf<String>()
    private var expectedCodesSet: Set<String>? = null
    
    private var toneGenerator: ToneGenerator? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityScannerBinding.inflate(layoutInflater)
        setContentView(binding.root)

        isBatchMode = intent.getBooleanExtra(EXTRA_IS_BATCH_MODE, false)
        val previouslyScanned = intent.getStringArrayListExtra(EXTRA_ALREADY_SCANNED_CODES)
        if (previouslyScanned != null) {
            scannedCodes.addAll(previouslyScanned)
        }

        val expectedList = intent.getStringArrayListExtra(EXTRA_EXPECTED_CODES)
        if (!expectedList.isNullOrEmpty()) {
            expectedCodesSet = expectedList.toSet()
        }
        
        try {
            toneGenerator = ToneGenerator(AudioManager.STREAM_MUSIC, 100)
        } catch (e: Exception) {
            e.printStackTrace()
        }

        binding.btnBack.setOnClickListener {
            finishWithResult()
        }

        if (isBatchMode) {
            binding.layoutBatchControls.visibility = View.VISIBLE
            val expectedCountMsg = if (expectedCodesSet != null) " / ${expectedCodesSet!!.size} prévus" else ""
            binding.textScannedCount.text = "${scannedCodes.size} colis scannés$expectedCountMsg"
            binding.btnFinishBatch.setOnClickListener {
                finishWithResult()
            }
        } else {
            binding.layoutBatchControls.visibility = View.GONE
        }

        scannerHelper = CameraXScannerHelper(
            context = this,
            activity = this,
            autoBeep = false,
            expectedCodes = expectedCodesSet,
            onBarcodeScanned = { code ->
                handleScanResult(code)
            }
        )

        binding.btnTorch.setOnClickListener {
            scannerHelper?.toggleTorch()
        }

        scannerHelper?.startCamera(this, binding.cameraPreview)
    }

    private var isFinishing = false

    private fun handleScanResult(code: String) {
        if (isFinishing) return
        val cleanCode = CameraXScannerHelper.cleanBarcodeValue(code)
        if (!CameraXScannerHelper.isValidParcelBarcode(cleanCode, expectedCodesSet)) return

        if (isBatchMode) {
            if (scannedCodes.add(cleanCode)) {
                playBeep()
                runOnUiThread {
                    val isExpected = CameraXScannerHelper.isCodeInExpectedSet(cleanCode, expectedCodesSet)
                    val expectedBadge = if (expectedCodesSet != null && expectedCodesSet!!.isNotEmpty()) {
                        if (isExpected) " ✔" else ""
                    } else ""
                    binding.textScannedCount.text = "${scannedCodes.size} scanné(s) : $cleanCode$expectedBadge"
                }
            }
        } else {
            // In single mode, if we already scanned this code in a previous session, ignore it
            if (scannedCodes.contains(cleanCode)) return

            isFinishing = true
            scannerHelper?.pause()
            playBeep()
            val resultIntent = Intent().apply {
                putExtra(EXTRA_SCANNED_CODE, cleanCode)
            }
            setResult(Activity.RESULT_OK, resultIntent)
            finish()
        }
    }

    private fun playBeep() {
        try {
            toneGenerator?.startTone(ToneGenerator.TONE_PROP_BEEP, 120)
        } catch (e: Exception) {
            e.printStackTrace()
        }

        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? android.os.VibratorManager
                vm?.defaultVibrator?.vibrate(android.os.VibrationEffect.createOneShot(70, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                val v = getSystemService(Context.VIBRATOR_SERVICE) as? android.os.Vibrator
                @Suppress("DEPRECATION")
                v?.vibrate(70)
            }
        } catch (_: Exception) {}
    }

    private fun finishWithResult() {
        if (isBatchMode && scannedCodes.isNotEmpty()) {
            val resultIntent = Intent().apply {
                putStringArrayListExtra(EXTRA_SCANNED_CODES_LIST, ArrayList(scannedCodes))
            }
            setResult(Activity.RESULT_OK, resultIntent)
        } else {
            setResult(Activity.RESULT_CANCELED)
        }
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            toneGenerator?.release()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    companion object {
        const val EXTRA_IS_BATCH_MODE = "extra_is_batch_mode"
        const val EXTRA_SCANNED_CODE = "extra_scanned_code"
        const val EXTRA_SCANNED_CODES_LIST = "extra_scanned_codes_list"
        const val EXTRA_ALREADY_SCANNED_CODES = "extra_already_scanned_codes"
        const val EXTRA_EXPECTED_CODES = "extra_expected_codes"
    }
}
