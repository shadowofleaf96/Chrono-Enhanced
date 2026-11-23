package com.chrono.mohammedia.ui.chrono

import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.text.Editable
import android.text.TextWatcher
import android.util.Base64
import android.util.Log
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.webkit.*
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.chrono.mohammedia.R
import com.chrono.mohammedia.databinding.ActivityChronoWebBinding
import com.chrono.mohammedia.ui.portal.PortalSelectorActivity
import com.chrono.mohammedia.ui.scanner.ScannerActivity

class ChronoWebActivity : AppCompatActivity() {

    private lateinit var binding: ActivityChronoWebBinding

    // JS assets injected into every page
    private var cachedXlsxFullJs: String? = null
    private var cachedXlsxPopulateJs: String? = null
    private var cachedContentJs: String? = null
    private var cachedInterceptJs: String? = null
    private var cachedMobileResponsiveCss: String? = null

    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (filePathCallback != null) {
            val results = if (result.resultCode == Activity.RESULT_OK && result.data != null) {
                val data = result.data
                val dataString = data?.dataString
                val clipData = data?.clipData
                when {
                    clipData != null -> Array(clipData.itemCount) { i -> clipData.getItemAt(i).uri }
                    dataString != null -> arrayOf(Uri.parse(dataString))
                    data?.data != null -> arrayOf(data.data!!)
                    else -> null
                }
            } else {
                null
            }
            filePathCallback?.onReceiveValue(results)
            filePathCallback = null
        }
    }

    private val scannerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val code = result.data?.getStringExtra(ScannerActivity.EXTRA_SCANNED_CODE)
            if (!code.isNullOrBlank()) {
                injectScannedBarcode(code)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WebView.setWebContentsDebuggingEnabled(true)
        binding = ActivityChronoWebBinding.inflate(layoutInflater)
        setContentView(binding.root)

        loadAssetScripts()
        setupToolbar()
        setupWebView()
        setupListeners()

        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val lastUrl = prefs.getString(KEY_LAST_URL, DEFAULT_CHRONO_URL) ?: DEFAULT_CHRONO_URL
        val startUrl = if (lastUrl.contains("/login", ignoreCase = true) ||
            lastUrl.contains("/Login", ignoreCase = true)) DEFAULT_CHRONO_URL else lastUrl
        binding.webviewChrono.loadUrl(startUrl)
    }

    // ── Asset loading ────────────────────────────────────────────────────────

    private fun loadAssetScripts() {
        cachedXlsxFullJs = loadAsset("xlsx.full.min.js")
        cachedXlsxPopulateJs = loadAsset("xlsx-populate.min.js")
        cachedContentJs = loadAsset("chrono_content.js")
        cachedInterceptJs = loadAsset("chrono_intercept.js")
        cachedMobileResponsiveCss = loadAsset("chrono_mobile.css")
    }

    private fun loadAsset(name: String): String? = try {
        assets.open(name).bufferedReader().use { it.readText() }
    } catch (e: Exception) {
        Log.e(TAG, "Failed loading asset $name: ${e.message}")
        null
    }

    // ── Toolbar ──────────────────────────────────────────────────────────────

    private fun setupToolbar() {
        binding.toolbarChrono.setNavigationOnClickListener {
            openPortalSelector()
        }
        binding.toolbarChrono.inflateMenu(R.menu.menu_chrono_top_app_bar)
        binding.toolbarChrono.setOnMenuItemClickListener { item ->
            when (item.itemId) {
                R.id.action_search_chrono -> { toggleInPageSearch(); true }
                R.id.action_scan_chrono   -> { launchBarcodeScanner(); true }
                R.id.action_refresh_chrono -> {
                    binding.webviewChrono.reload()
                    Toast.makeText(this, "Actualisation…", Toast.LENGTH_SHORT).show()
                    true
                }
                else -> false
            }
        }
    }

    // ── Listeners ────────────────────────────────────────────────────────────

    private fun setupListeners() {
        binding.fabScanBarcode.setOnClickListener { launchBarcodeScanner() }

        binding.btnRetry.setOnClickListener {
            binding.layoutError.visibility = View.GONE
            binding.webviewChrono.visibility = View.VISIBLE
            binding.webviewChrono.reload()
        }

        // In-page search
        binding.editSearchQuery.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                val query = s?.toString() ?: ""
                if (query.isNotBlank()) {
                    binding.webviewChrono.findAllAsync(query)
                } else {
                    binding.webviewChrono.clearMatches()
                    binding.textSearchCount.text = ""
                }
            }
            override fun afterTextChanged(s: Editable?) {}
        })

        binding.editSearchQuery.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                binding.webviewChrono.findNext(true); true
            } else false
        }

        binding.btnSearchNext.setOnClickListener { binding.webviewChrono.findNext(true) }
        binding.btnSearchPrev.setOnClickListener { binding.webviewChrono.findNext(false) }
        binding.btnCloseSearch.setOnClickListener { hideInPageSearch() }

        binding.webviewChrono.setFindListener { activeMatchOrdinal, numberOfMatches, _ ->
            binding.textSearchCount.text = if (numberOfMatches > 0)
                "${activeMatchOrdinal + 1}/$numberOfMatches" else "0/0"
        }
    }

    // ── WebView setup ────────────────────────────────────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val wv = binding.webviewChrono
        wv.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        wv.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            setSupportZoom(true)
            builtInZoomControls = false
            displayZoomControls = false
            loadWithOverviewMode = true
            useWideViewPort = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = userAgentString.replace("wv", "") // remove WebView marker
        }

        wv.addJavascriptInterface(ChronoJsBridge(), "AndroidApp")

        wv.webChromeClient = object : WebChromeClient() {
            override fun onReceivedTitle(view: WebView?, title: String?) {
                super.onReceivedTitle(view, title)
                if (!title.isNullOrBlank() &&
                    !title.contains("http", ignoreCase = true) &&
                    !title.contains("cross.chronodiali", ignoreCase = true) &&
                    !title.contains("about:blank", ignoreCase = true)
                ) {
                    val cleanTitle = when {
                        title.contains("Consignment", ignoreCase = true) -> "Consignments"
                        title.contains("Reconciliation", ignoreCase = true) -> "Rider Recon"
                        title.contains("Trip Manager", ignoreCase = true) -> "Trip Manager"
                        title.contains("Inscan", ignoreCase = true) -> "Inscan / Outscan"
                        else -> title
                    }
                    binding.toolbarChrono.title = cleanTitle
                }
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                request.grant(request.resources)
            }

            override fun onShowFileChooser(
                webView: WebView?,
                callback: ValueCallback<Array<Uri>>?,
                params: FileChooserParams?
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback

                val intent = try {
                    params?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                    }
                } catch (e: Exception) {
                    Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                    }
                }

                val chooserIntent = Intent.createChooser(intent, "Sélectionner un fichier Excel")
                return try {
                    fileChooserLauncher.launch(chooserIntent)
                    true
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to launch file chooser: ${e.message}")
                    filePathCallback?.onReceiveValue(null)
                    filePathCallback = null
                    false
                }
            }
        }

        wv.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                binding.progressLoading.visibility = View.VISIBLE
                binding.layoutError.visibility = View.GONE
                binding.webviewChrono.visibility = View.VISIBLE
                saveLastUrl(url)
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                binding.progressLoading.visibility = View.GONE
                injectMobileResponsiveCSS(view)
                injectScripts(view, url)
            }

            override fun onReceivedError(
                view: WebView, request: WebResourceRequest, error: WebResourceError
            ) {
                if (request.isForMainFrame) {
                    binding.progressLoading.visibility = View.GONE
                    binding.webviewChrono.visibility = View.GONE
                    binding.layoutError.visibility = View.VISIBLE
                    Log.e(TAG, "WebView error: ${error.description} on ${request.url}")
                }
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                return if (url.startsWith("https://cross.chronodiali.ma") ||
                    url.startsWith("https://projectxeuapi.shipsy.io")) {
                    false // let WebView handle Chrono URLs
                } else {
                    // Open external URLs in system browser
                    try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: Exception) {}
                    true
                }
            }
        }

        // Handle file downloads (Excel exports from the extension)
        wv.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            try {
                val request = DownloadManager.Request(Uri.parse(url)).apply {
                    setMimeType(mimeType)
                    addRequestHeader("User-Agent", userAgent)
                    setDescription("Téléchargement Chrono")
                    setTitle(URLUtil.guessFileName(url, contentDisposition, mimeType))
                    allowScanningByMediaScanner()
                    setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, URLUtil.guessFileName(url, contentDisposition, mimeType))
                }
                val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                dm.enqueue(request)
                Toast.makeText(this@ChronoWebActivity, "Téléchargement démarré…", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Log.e(TAG, "Download failed: ${e.message}")
            }
        }
    }

    // ── CSS injection: make Chrono site mobile-responsive ────────────────────

    private fun injectMobileResponsiveCSS(view: WebView) {
        val css = cachedMobileResponsiveCss ?: return
        val escaped = css.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n")
        val js = """
            (function() {
                try {
                    var meta = document.querySelector('meta[name="viewport"]');
                    if (!meta) {
                        meta = document.createElement('meta');
                        meta.name = 'viewport';
                        (document.head || document.documentElement).appendChild(meta);
                    }
                    meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';

                    var existing = document.getElementById('chrono-mobile-responsive');
                    if (existing) {
                        existing.textContent = '$escaped';
                        return;
                    }
                    var style = document.createElement('style');
                    style.id = 'chrono-mobile-responsive';
                    style.type = 'text/css';
                    style.appendChild(document.createTextNode('$escaped'));
                    (document.head || document.documentElement).appendChild(style);
                } catch(e) {
                    console.error('[ChronoWeb] CSS injection error:', e);
                }
            })();
        """.trimIndent()
        view.evaluateJavascript(js, null)
    }

    // ── JS injection: intercept + content scripts ────────────────────────────

    private fun injectScripts(view: WebView, url: String) {
        // Always inject interceptor (token capture, API hooks)
        cachedInterceptJs?.let { js ->
            view.evaluateJavascript("""(function(){$js})();""", null)
        }
        // Inject content.js only on the ops pages (not login)
        if (url.contains("/ops", ignoreCase = true)) {
            cachedXlsxFullJs?.let { view.evaluateJavascript(it, null) }
            cachedXlsxPopulateJs?.let { view.evaluateJavascript(it, null) }
            cachedContentJs?.let { view.evaluateJavascript("""(function(){$it})();""", null) }
        }
    }

    // ── Scanner integration ───────────────────────────────────────────────────

    private fun launchBarcodeScanner() {
        val intent = Intent(this, ScannerActivity::class.java)
        scannerLauncher.launch(intent)
    }

    private fun injectScannedBarcode(code: String) {
        val escaped = code.replace("'", "\\'")
        val js = """
            (function() {
                // Try to fill the active/focused input, or the last scan input
                var active = document.activeElement;
                if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
                    active.value = '$escaped';
                    active.dispatchEvent(new Event('input', { bubbles: true }));
                    active.dispatchEvent(new Event('change', { bubbles: true }));
                    return;
                }
                // Fallback: look for a scan input field (common patterns in Chrono SPA)
                var inputs = document.querySelectorAll('input[placeholder*="scan"], input[placeholder*="Scan"], input[placeholder*="CN"], input[placeholder*="colis"], input[type="search"]');
                if (inputs.length > 0) {
                    var inp = inputs[0];
                    inp.focus();
                    inp.value = '$escaped';
                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                    inp.dispatchEvent(new Event('change', { bubbles: true }));
                }
                if (window.AndroidApp) window.AndroidApp.showToast('Code scanné: $escaped');
            })();
        """.trimIndent()
        binding.webviewChrono.evaluateJavascript(js, null)
    }

    // ── In-page search ───────────────────────────────────────────────────────

    private fun toggleInPageSearch() {
        if (binding.layoutSearchBar.visibility == View.VISIBLE) {
            hideInPageSearch()
        } else {
            binding.layoutSearchBar.visibility = View.VISIBLE
            binding.editSearchQuery.requestFocus()
            val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            imm.showSoftInput(binding.editSearchQuery, InputMethodManager.SHOW_IMPLICIT)
        }
    }

    private fun hideInPageSearch() {
        binding.layoutSearchBar.visibility = View.GONE
        binding.editSearchQuery.text?.clear()
        binding.webviewChrono.clearMatches()
        binding.textSearchCount.text = ""
        val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.hideSoftInputFromWindow(binding.editSearchQuery.windowToken, 0)
    }

    // ── Portal navigation ─────────────────────────────────────────────────────

    private fun openPortalSelector() {
        val intent = PortalSelectorActivity.createIntent(this, forceSelector = true)
        intent.flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        startActivity(intent)
    }

    // ── Persistence ───────────────────────────────────────────────────────────

    private fun saveLastUrl(url: String) {
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_LAST_URL, url).apply()
    }

    // ── Back navigation ───────────────────────────────────────────────────────

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        when {
            binding.layoutSearchBar.visibility == View.VISIBLE -> hideInPageSearch()
            binding.webviewChrono.canGoBack() -> binding.webviewChrono.goBack()
            else -> super.onBackPressed()
        }
    }

    // ── JS Bridge ─────────────────────────────────────────────────────────────

    inner class ChronoJsBridge {
        @JavascriptInterface
        fun launchScanner() = runOnUiThread { launchBarcodeScanner() }

        @JavascriptInterface
        fun showToast(message: String) = runOnUiThread {
            Toast.makeText(this@ChronoWebActivity, message, Toast.LENGTH_SHORT).show()
        }

        @JavascriptInterface
        fun log(message: String) = Log.d(TAG, "[ChronoWeb-JS]: $message")

        @JavascriptInterface
        fun updateTitle(title: String) = runOnUiThread {
            if (!title.isNullOrBlank() && !title.contains("http") && !title.contains("cross.") && !title.equals("Shipsy", ignoreCase = true)) {
                binding.toolbarChrono.title = title
            }
        }
    }

    companion object {
        const val TAG = "ChronoWebActivity"
        const val PREFS_NAME = "chrono_web_prefs"
        const val KEY_LAST_URL = "key_last_chrono_url"
        const val DEFAULT_CHRONO_URL = "https://cross.chronodiali.ma/ops"
    }
}
