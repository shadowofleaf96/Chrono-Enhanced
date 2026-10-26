package com.chrono.mohammedia.ui.marjane

import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.util.Base64
import android.util.Log
import android.view.View
import android.webkit.*
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.chrono.mohammedia.R
import com.chrono.mohammedia.data.repository.RiderRepository
import com.chrono.mohammedia.databinding.ActivityMarjaneMallBinding
import com.chrono.mohammedia.ui.MainActivity
import com.chrono.mohammedia.ui.login.LoginActivity
import com.chrono.mohammedia.ui.portal.PortalSelectorActivity
import com.chrono.mohammedia.ui.scanner.ScannerActivity
import java.io.File
import java.io.FileOutputStream

class MarjaneMallActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMarjaneMallBinding

    private var cachedXlsxFullJs: String? = null
    private var cachedXlsxPopulateJs: String? = null
    private var cachedGoFleetJs: String? = null

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
        binding = ActivityMarjaneMallBinding.inflate(layoutInflater)
        setContentView(binding.root)

        loadAssetScripts()
        setupToolbar()
        setupWebView()
        setupListeners()

        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val lastUrl = prefs.getString(KEY_LAST_URL, DEFAULT_TMS_URL) ?: DEFAULT_TMS_URL
        val startUrl = if (lastUrl.contains("/Account/Login", ignoreCase = true)) DEFAULT_TMS_URL else lastUrl
        binding.webviewMarjane.loadUrl(startUrl)
    }

    private fun loadAssetScripts() {
        try {
            cachedXlsxFullJs = assets.open("xlsx.full.min.js").bufferedReader().use { it.readText() }
        } catch (e: Exception) {
            Log.e(TAG, "Failed loading xlsx.full.min.js: ${e.message}")
        }

        try {
            cachedXlsxPopulateJs = assets.open("xlsx-populate.min.js").bufferedReader().use { it.readText() }
        } catch (e: Exception) {
            Log.e(TAG, "Failed loading xlsx-populate.min.js: ${e.message}")
        }

        try {
            cachedGoFleetJs = assets.open("gofleet_content.js").bufferedReader().use { it.readText() }
        } catch (e: Exception) {
            Log.e(TAG, "Failed loading gofleet_content.js: ${e.message}")
        }
    }

    private fun setupToolbar() {
        binding.toolbarMarjane.setNavigationOnClickListener {
            openPortalSelector()
        }

        binding.toolbarMarjane.inflateMenu(R.menu.menu_marjane_top_app_bar)
        binding.toolbarMarjane.setOnMenuItemClickListener { item ->
            when (item.itemId) {
                R.id.action_scan_marjane -> {
                    launchBarcodeScanner()
                    true
                }
                R.id.action_refresh_marjane -> {
                    binding.webviewMarjane.reload()
                    Toast.makeText(this, "Actualisation de la page...", Toast.LENGTH_SHORT).show()
                    true
                }
                else -> false
            }
        }
    }

    private fun setupListeners() {
        binding.fabScanBarcode.setOnClickListener {
            launchBarcodeScanner()
        }

        binding.btnRetry.setOnClickListener {
            binding.layoutError.visibility = View.GONE
            binding.webviewMarjane.visibility = View.VISIBLE
            binding.webviewMarjane.reload()
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val webView = binding.webviewMarjane
        val settings = webView.settings

        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.setSupportZoom(true)
        settings.builtInZoomControls = true
        settings.displayZoomControls = false
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        // Accept persistent cookies
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
            flush()
        }

        webView.addJavascriptInterface(MarjaneJsBridge(), "AndroidApp")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress < 100) {
                    binding.progressLoading.visibility = View.VISIBLE
                    binding.progressLoading.progress = newProgress
                } else {
                    binding.progressLoading.visibility = View.GONE
                }
            }

            override fun onReceivedTitle(view: WebView?, title: String?) {
                super.onReceivedTitle(view, title)
                if (!title.isNullOrBlank() && !title.startsWith("http")) {
                    binding.toolbarMarjane.title = title
                } else {
                    binding.toolbarMarjane.title = "Marjane Mall TMS"
                }
            }

            override fun onJsAlert(view: WebView?, url: String?, message: String?, result: JsResult?): Boolean {
                Toast.makeText(this@MarjaneMallActivity, message ?: "", Toast.LENGTH_SHORT).show()
                result?.confirm()
                return true
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                binding.layoutError.visibility = View.GONE
                binding.progressLoading.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                binding.progressLoading.visibility = View.GONE
                
                // Flush cookies to disk so login session is never lost on restart
                CookieManager.getInstance().flush()

                val safeUrl = url.orEmpty()
                val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

                if (safeUrl.contains("/Account/Login", ignoreCase = true)) {
                    handleLoginPage(view, prefs)
                } else if (safeUrl.startsWith("https://tms.marjanemall.ma", ignoreCase = true)) {
                    prefs.edit().putString(KEY_LAST_URL, safeUrl).apply()
                }

                injectGoFleetEnhancements(view)
            }

            override fun doUpdateVisitedHistory(view: WebView?, url: String?, isReload: Boolean) {
                super.doUpdateVisitedHistory(view, url, isReload)
                injectGoFleetEnhancements(view)
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                if (request?.isForMainFrame == true) {
                    binding.progressLoading.visibility = View.GONE
                    binding.layoutError.visibility = View.VISIBLE
                    binding.tvErrorDetails.text = error?.description ?: "Erreur réseau inconnue."
                }
            }
        }

        webView.setDownloadListener { url, userAgent, contentDisposition, mimetype, _ ->
            handleDownload(url, contentDisposition, mimetype)
        }
    }

    private fun injectGoFleetEnhancements(view: WebView?) {
        if (view == null) return

        // 0. Inject Chrome extension API polyfill (storage.local, runtime.onMessage, runtime.sendMessage)
        val polyfillScript = """
            (function() {
                if (typeof window.chrome === 'undefined') window.chrome = {};
                if (!window.chrome.runtime) {
                    window.chrome.runtime = {
                        id: 'gofleet-android-extension',
                        onMessage: {
                            _listeners: [],
                            addListener: function(fn) { if (typeof fn === 'function' && this._listeners.indexOf(fn) === -1) this._listeners.push(fn); },
                            removeListener: function(fn) { var idx = this._listeners.indexOf(fn); if (idx !== -1) this._listeners.splice(idx, 1); },
                            hasListener: function(fn) { return this._listeners.indexOf(fn) !== -1; }
                        },
                        sendMessage: function(msg, cb) {
                            if (typeof cb === 'function') setTimeout(function() { cb({ success: true }); }, 10);
                        }
                    };
                }
                if (!window.chrome.storage) {
                    window.chrome.storage = {
                        local: {
                            get: function(keys, cb) {
                                var result = {};
                                try {
                                    if (typeof keys === 'string') {
                                        var v = localStorage.getItem('gofleet_' + keys);
                                        if (v !== null) try { result[keys] = JSON.parse(v); } catch(e) { result[keys] = v; }
                                    } else if (Array.isArray(keys)) {
                                        keys.forEach(function(k) {
                                            var v = localStorage.getItem('gofleet_' + k);
                                            if (v !== null) try { result[k] = JSON.parse(v); } catch(e) { result[k] = v; }
                                        });
                                    } else if (typeof keys === 'object' && keys !== null) {
                                        result = Object.assign({}, keys);
                                        Object.keys(keys).forEach(function(k) {
                                            var v = localStorage.getItem('gofleet_' + k);
                                            if (v !== null) try { result[k] = JSON.parse(v); } catch(e) { result[k] = v; }
                                        });
                                    }
                                } catch(e) {}
                                if (typeof cb === 'function') setTimeout(function() { cb(result); }, 5);
                            },
                            set: function(items, cb) {
                                try {
                                    if (typeof items === 'object' && items !== null) {
                                        Object.keys(items).forEach(function(k) {
                                            localStorage.setItem('gofleet_' + k, JSON.stringify(items[k]));
                                        });
                                    }
                                } catch(e) {}
                                if (typeof cb === 'function') setTimeout(function() { cb(); }, 5);
                            },
                            remove: function(keys, cb) {
                                try {
                                    var arr = Array.isArray(keys) ? keys : [keys];
                                    arr.forEach(function(k) { localStorage.removeItem('gofleet_' + k); });
                                } catch(e) {}
                                if (typeof cb === 'function') setTimeout(cb, 5);
                            },
                            clear: function(cb) {
                                try {
                                    Object.keys(localStorage).forEach(function(k) {
                                        if (k.startsWith('gofleet_')) localStorage.removeItem(k);
                                    });
                                } catch(e) {}
                                if (typeof cb === 'function') setTimeout(cb, 5);
                            }
                        }
                    };
                }
            })();
        """.trimIndent()
        view.evaluateJavascript(polyfillScript, null)

        // 1. Inject XLSX Full library if not already present
        cachedXlsxFullJs?.let { xlsxScript ->
            val wrapped = "if (typeof window.XLSX === 'undefined') { $xlsxScript }"
            view.evaluateJavascript(wrapped, null)
        }

        // 2. Inject XlsxPopulate library if not already present
        cachedXlsxPopulateJs?.let { populateScript ->
            val wrapped = "if (typeof window.XlsxPopulate === 'undefined') { $populateScript }"
            view.evaluateJavascript(wrapped, null)
        }

        // 3. Inject GoFleet Enhancer Script
        cachedGoFleetJs?.let { goFleetScript ->
            val wrapped = """
                (function() {
                    try {
                        $goFleetScript
                        console.log('[GoFleet-Enhancer] Script injected successfully in Android WebView.');
                    } catch (e) {
                        console.error('[GoFleet-Enhancer] Evaluation error:', e);
                    }
                })();
            """.trimIndent()
            view.evaluateJavascript(wrapped) { result ->
                Log.d(TAG, "GoFleet Enhancer injected. Result: $result")
            }
        }

        // 4. Replace website scanner button with native app scanner button (same space, zero overlap)
        injectWebsiteScannerButton(view)
    }

    private fun injectWebsiteScannerButton(view: WebView?) {
        val script = """
            (function() {
                function findWebsiteScannerButton() {
                    var barcodeInput = document.getElementById('js-barcode-input') ||
                                       document.querySelector('input[name*="code" i], input[name*="cab" i], input[name*="bar" i], input[name*="colis" i], input[placeholder*="scan" i], input[placeholder*="code" i], input[placeholder*="colis" i], input[placeholder*="barre" i]');

                    if (barcodeInput) {
                        var container = barcodeInput.closest('form') ||
                                        barcodeInput.closest('.row') ||
                                        barcodeInput.closest('.form-group') ||
                                        barcodeInput.closest('.d-flex') ||
                                        barcodeInput.parentElement;

                        if (container) {
                            var siblings = Array.from(barcodeInput.parentElement ? barcodeInput.parentElement.children : []);
                            for (var s = 0; s < siblings.length; s++) {
                                var sib = siblings[s];
                                if (sib === barcodeInput || sib.id === 'chrono-inline-scan-btn' || sib.dataset.chronoAppButton === 'true') continue;
                                var sText = (sib.textContent || '').replace(/\u00A0/g, ' ').trim().toLowerCase();
                                var sCls = (typeof sib.className === 'string' ? sib.className : '').toLowerCase();
                                var sIcon = sib.querySelector && sib.querySelector('.fa-barcode, .fa-camera, .fa-qrcode, [class*="barcode"], [class*="scan"], [class*="qrcode"], svg, img');
                                if (sText === 'scanner' || sText === 'scan' || (sIcon && (sText.includes('scan') || sCls.includes('btn')))) {
                                    return sib.closest('button, a, [role="button"], .btn') || sib;
                                }
                            }

                            var candidates = Array.from(container.querySelectorAll('button:not([data-chrono-app-button="true"]), a:not([data-chrono-app-button="true"]), [role="button"]:not([data-chrono-app-button="true"]), .btn:not([data-chrono-app-button="true"]), span[class*="btn"], div[class*="btn"], input[type="button"], input[type="submit"]'));
                            for (var i = 0; i < candidates.length; i++) {
                                var el = candidates[i];
                                if (el === barcodeInput || el.id === 'chrono-inline-scan-btn' || el.dataset.chronoAppButton === 'true') continue;
                                if (el.contains(barcodeInput)) continue;

                                var text = (el.textContent || '').replace(/\u00A0/g, ' ').trim().toLowerCase();
                                var id = (el.id || '').toLowerCase();
                                var cls = (typeof el.className === 'string' ? el.className : '').toLowerCase();
                                var hasScanIcon = el.querySelector && el.querySelector('.fa-barcode, .fa-camera, .fa-qrcode, [class*="barcode"], [class*="scan"], [class*="qrcode"], svg, img');

                                var isScan = (
                                    text === 'scanner' ||
                                    text === 'scan' ||
                                    (text.includes('scanner') && !text.includes('colis scann')) ||
                                    (hasScanIcon && (text.includes('scan') || cls.includes('btn') || el.tagName === 'BUTTON' || el.tagName === 'A')) ||
                                    cls.includes('btn-scanner') || cls.includes('js-scanner') ||
                                    id.includes('scanner')
                                );

                                if (isScan) {
                                    var btnTarget = el.closest('button, a, [role="button"], .btn') || el;
                                    if (btnTarget && !btnTarget.contains(barcodeInput)) {
                                        return btnTarget;
                                    }
                                }
                            }
                        }
                    }

                    var contentArea = document.querySelector('.page-content, .content, main, #content, .container, .container-fluid, body') || document.body;
                    if (contentArea) {
                        var allButtons = Array.from(contentArea.querySelectorAll('button:not([data-chrono-app-button="true"]), a:not([data-chrono-app-button="true"]), [role="button"]:not([data-chrono-app-button="true"]), .btn:not([data-chrono-app-button="true"])'));
                        for (var j = 0; j < allButtons.length; j++) {
                            var b = allButtons[j];
                            if (b.closest('nav, header, .sidebar, .navbar, .menu, #sidebar, .drawer, #drawer, [class*="nav"], [class*="sidebar"]')) continue;

                            var t = (b.textContent || '').replace(/\u00A0/g, ' ').trim().toLowerCase();
                            var bId = (b.id || '').toLowerCase();
                            var bCls = (typeof b.className === 'string' ? b.className : '').toLowerCase();
                            var bIcon = b.querySelector && b.querySelector('.fa-barcode, .fa-camera, .fa-qrcode, [class*="barcode"], [class*="scan"], [class*="qrcode"], svg, img');

                            var isSiteScan = (
                                t === 'scanner' ||
                                t === 'scan' ||
                                (t.includes('scanner') && !t.includes('colis scann')) ||
                                (bIcon && (t.includes('scan') || bCls.includes('btn') || b.tagName === 'BUTTON' || b.tagName === 'A')) ||
                                bCls.includes('btn-scanner') || bCls.includes('js-scanner') ||
                                bId.includes('scanner')
                            );

                            if (isSiteScan) {
                                return b;
                            }
                        }
                    }

                    return null;
                }

                function replaceScannerButton() {
                    var barcodeInput = document.getElementById('js-barcode-input') ||
                                       document.querySelector('input[name*="code" i], input[name*="cab" i], input[name*="bar" i], input[name*="colis" i], input[placeholder*="scan" i], input[placeholder*="code" i], input[placeholder*="colis" i], input[placeholder*="barre" i]');

                    var siteScanBtn = findWebsiteScannerButton();

                    var inlineBtn = document.getElementById('chrono-inline-scan-btn');
                    if (!inlineBtn) {
                        inlineBtn = document.createElement('button');
                        inlineBtn.id = 'chrono-inline-scan-btn';
                        inlineBtn.type = 'button';
                        inlineBtn.dataset.chronoAppButton = 'true';
                        inlineBtn.style.display = 'inline-flex';
                        inlineBtn.style.alignItems = 'center';
                        inlineBtn.style.justifyContent = 'center';
                        inlineBtn.style.gap = '6px';
                        inlineBtn.style.backgroundColor = '#E30613';
                        inlineBtn.style.borderColor = '#C40510';
                        inlineBtn.style.color = '#FFFFFF';
                        inlineBtn.style.fontWeight = 'bold';
                        inlineBtn.style.fontSize = '14px';
                        inlineBtn.style.borderRadius = '20px';
                        inlineBtn.style.padding = '7px 16px';
                        inlineBtn.style.cursor = 'pointer';
                        inlineBtn.style.verticalAlign = 'middle';
                        inlineBtn.style.boxShadow = '0 2px 6px rgba(227,6,19,0.3)';
                        inlineBtn.innerHTML = '<svg style="width:18px;height:18px;fill:currentColor;vertical-align:middle;margin-right:4px;" viewBox="0 0 24 24"><path d="M2 4h2v16H2V4zm3 0h1v16H5V4zm3 0h2v16H8V4zm3 0h3v16h-3V4zm4 0h1v16h-1V4zm2 0h2v16h-2V4zm3 0h1v16h-1V4z"/></svg><span>Scanner</span>';
                        
                        inlineBtn.addEventListener('click', function(e) {
                            e.preventDefault();
                            e.stopPropagation();
                            if (window.AndroidApp && window.AndroidApp.launchScanner) {
                                window.AndroidApp.launchScanner();
                            }
                        });
                    }

                    if (siteScanBtn) {
                        siteScanBtn.style.setProperty('display', 'none', 'important');
                        siteScanBtn.style.setProperty('visibility', 'hidden', 'important');
                        siteScanBtn.style.setProperty('width', '0', 'important');
                        siteScanBtn.style.setProperty('height', '0', 'important');
                        siteScanBtn.style.setProperty('margin', '0', 'important');
                        siteScanBtn.style.setProperty('padding', '0', 'important');
                        siteScanBtn.style.setProperty('opacity', '0', 'important');
                        siteScanBtn.style.setProperty('pointer-events', 'none', 'important');

                        if (inlineBtn.parentNode !== siteScanBtn.parentNode || inlineBtn.nextSibling !== siteScanBtn) {
                            siteScanBtn.parentNode.insertBefore(inlineBtn, siteScanBtn);
                        }

                        if (siteScanBtn.parentElement) {
                            Array.from(siteScanBtn.parentElement.children).forEach(function(child) {
                                if (child === inlineBtn || child === barcodeInput || child.dataset.chronoAppButton === 'true') return;
                                var ct = (child.textContent || '').replace(/\u00A0/g, ' ').trim().toLowerCase();
                                var cIcon = child.querySelector && child.querySelector('.fa-barcode, .fa-camera, .fa-qrcode, [class*="barcode"], [class*="scan"], [class*="qrcode"], svg, img');
                                if (ct === 'scanner' || ct === 'scan' || (cIcon && (ct.includes('scan') || (child.className && child.className.includes && child.className.includes('btn'))))) {
                                    child.style.setProperty('display', 'none', 'important');
                                    child.style.setProperty('visibility', 'hidden', 'important');
                                    child.style.setProperty('pointer-events', 'none', 'important');
                                }
                            });
                        }
                    } else if (barcodeInput && !inlineBtn.parentNode) {
                        if (barcodeInput.nextSibling) {
                            barcodeInput.parentNode.insertBefore(inlineBtn, barcodeInput.nextSibling);
                        } else {
                            barcodeInput.parentNode.appendChild(inlineBtn);
                        }
                    }
                }

                replaceScannerButton();
                if (!window._chronoScanObs && document.body) {
                    window._chronoScanObs = new MutationObserver(replaceScannerButton);
                    window._chronoScanObs.observe(document.body, { childList: true, subtree: true });
                }
            })();
        """.trimIndent()
        view?.evaluateJavascript(script, null)
    }

    private fun injectScannedBarcode(code: String) {
        val escaped = code.replace("'", "\\'").replace("\"", "\\\"").trim()
        val script = """
            (function() {
                var input = document.getElementById('js-barcode-input') ||
                            document.querySelector('input[name*="code" i], input[name*="cab" i], input[name*="bar" i], input[name*="colis" i], input[placeholder*="scan" i], input[placeholder*="code" i], input[placeholder*="colis" i], input[placeholder*="barre" i]');
                if (input) {
                    input.focus();
                    input.value = '$escaped';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    var enterEvent = new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        which: 13,
                        bubbles: true
                    });
                    input.dispatchEvent(enterEvent);
                    return 'barcode_input_filled';
                }
                
                var active = document.activeElement;
                if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
                    active.value = '$escaped';
                    active.dispatchEvent(new Event('input', { bubbles: true }));
                    active.dispatchEvent(new Event('change', { bubbles: true }));
                    return 'active_input_filled';
                }
                
                return 'no_input_found';
            })();
        """.trimIndent()

        binding.webviewMarjane.evaluateJavascript(script) { result ->
            val res = result?.replace("\"", "") ?: ""
            if (res == "barcode_input_filled") {
                Toast.makeText(this, "✅ Code-barres scanné : $escaped", Toast.LENGTH_SHORT).show()
            } else if (res == "active_input_filled") {
                Toast.makeText(this, "✅ Code injecté dans le champ actif : $escaped", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this, "Code scanné : $escaped (champ de scan non détecté)", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun handleDownload(url: String, contentDisposition: String, mimetype: String) {
        try {
            if (url.startsWith("data:") || url.startsWith("blob:")) {
                saveDataUri(url)
                return
            }

            val request = DownloadManager.Request(Uri.parse(url)).apply {
                setMimeType(mimetype)
                addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url))
                addRequestHeader("User-Agent", binding.webviewMarjane.settings.userAgentString)
                setDescription("Téléchargement Marjane TMS...")
                setTitle(URLUtil.guessFileName(url, contentDisposition, mimetype))
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalPublicDir(
                    Environment.DIRECTORY_DOWNLOADS,
                    URLUtil.guessFileName(url, contentDisposition, mimetype)
                )
            }
            val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            dm.enqueue(request)
            Toast.makeText(this, "Téléchargement démarré...", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(this, "Erreur téléchargement: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun saveDataUri(dataUri: String) {
        try {
            val parts = dataUri.split(",")
            if (parts.size >= 2) {
                val base64Data = parts[1]
                val bytes = Base64.decode(base64Data, Base64.DEFAULT)
                val fileName = "Marjane_Export_${System.currentTimeMillis()}.xlsx"
                val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: filesDir
                val file = File(dir, fileName)
                FileOutputStream(file).use { it.write(bytes) }
                Toast.makeText(this, "Fichier enregistré: ${file.name}", Toast.LENGTH_LONG).show()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save data URI: ${e.message}")
        }
    }

    private fun launchBarcodeScanner() {
        val intent = Intent(this, ScannerActivity::class.java).apply {
            putExtra(ScannerActivity.EXTRA_IS_BATCH_MODE, false)
        }
        scannerLauncher.launch(intent)
    }

    private fun switchToChrono() {
        val repo = RiderRepository.getInstance(this)
        val targetIntent = if (repo.hasValidSavedSession()) {
            Intent(this, MainActivity::class.java)
        } else {
            LoginActivity.createIntent(this, forceLogin = false)
        }.apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        startActivity(targetIntent)
    }

    private fun openPortalSelector() {
        val intent = PortalSelectorActivity.createIntent(this, forceSelector = true)
        startActivity(intent)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (binding.webviewMarjane.canGoBack()) {
            binding.webviewMarjane.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush()
    }

    override fun onStop() {
        super.onStop()
        CookieManager.getInstance().flush()
    }

    override fun onDestroy() {
        super.onDestroy()
        CookieManager.getInstance().flush()
    }

    private fun handleLoginPage(view: WebView?, prefs: android.content.SharedPreferences) {
        val savedUser = prefs.getString(KEY_SAVED_USER, "") ?: ""
        val savedPass = prefs.getString(KEY_SAVED_PASS, "") ?: ""

        val escUser = savedUser.replace("'", "\\'").replace("\"", "\\\"")
        val escPass = savedPass.replace("'", "\\'").replace("\"", "\\\"")

        val script = """
            (function() {
                try {
                    function getFields() {
                        var user = document.querySelector('input[name="Email"]') || 
                                   document.querySelector('input[type="email"]') || 
                                   document.querySelector('input[name="Username"]') || 
                                   document.querySelector('input[name="Identifiant"]') || 
                                   document.querySelector('input[type="text"]');
                        var pass = document.querySelector('input[type="password"]');
                        var submit = document.querySelector('button[type="submit"]') || 
                                     document.querySelector('input[type="submit"]') || 
                                     document.querySelector('form button') ||
                                     document.querySelector('.btn-primary');
                        return { user: user, pass: pass, submit: submit };
                    }

                    // 1. Hook form submission to capture credentials
                    var form = document.querySelector('form');
                    if (form && !form.dataset.chronoHooked) {
                        form.dataset.chronoHooked = 'true';
                        form.addEventListener('submit', function() {
                            var f = getFields();
                            if (f.user && f.pass && f.user.value && f.pass.value) {
                                if (window.AndroidApp && window.AndroidApp.saveCredentials) {
                                    window.AndroidApp.saveCredentials(f.user.value, f.pass.value);
                                }
                            }
                        });
                    }

                    var f = getFields();
                    if (f.submit && !f.submit.dataset.chronoHooked) {
                        f.submit.dataset.chronoHooked = 'true';
                        f.submit.addEventListener('click', function() {
                            var fields = getFields();
                            if (fields.user && fields.pass && fields.user.value && fields.pass.value) {
                                if (window.AndroidApp && window.AndroidApp.saveCredentials) {
                                    window.AndroidApp.saveCredentials(fields.user.value, fields.pass.value);
                                }
                            }
                        });
                    }

                    // 2. Pre-fill credentials if saved
                    var u = '$escUser';
                    var p = '$escPass';
                    if (u.length > 0 && p.length > 0) {
                        var fields = getFields();
                        if (fields.user && fields.pass) {
                            if (!fields.user.value || fields.user.value === '') {
                                fields.user.value = u;
                                fields.user.dispatchEvent(new Event('input', { bubbles: true }));
                                fields.user.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                            if (!fields.pass.value || fields.pass.value === '') {
                                fields.pass.value = p;
                                fields.pass.dispatchEvent(new Event('input', { bubbles: true }));
                                fields.pass.dispatchEvent(new Event('change', { bubbles: true }));
                            }

                            // Auto-submit if fields populated and not yet submitted
                            if (fields.submit && !window._autoSubmitted) {
                                window._autoSubmitted = true;
                                setTimeout(function() {
                                    fields.submit.click();
                                }, 350);
                            }
                        }
                    }
                } catch(e) {
                    console.error('Error in login handler:', e);
                }
            })();
        """.trimIndent()

        view?.evaluateJavascript(script, null)
    }

    inner class MarjaneJsBridge {
        @JavascriptInterface
        fun saveCredentials(username: String, password: String) {
            if (username.isNotBlank() && password.isNotBlank()) {
                val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                prefs.edit()
                    .putString(KEY_SAVED_USER, username.trim())
                    .putString(KEY_SAVED_PASS, password.trim())
                    .apply()
                Log.d(TAG, "Saved Marjane TMS credentials for: $username")
            }
        }

        @JavascriptInterface
        fun launchScanner() {
            runOnUiThread {
                launchBarcodeScanner()
            }
        }

        @JavascriptInterface
        fun showToast(message: String) {
            runOnUiThread {
                Toast.makeText(this@MarjaneMallActivity, message, Toast.LENGTH_SHORT).show()
            }
        }

        @JavascriptInterface
        fun log(message: String) {
            Log.d(TAG, "[GoFleet-WebView]: $message")
        }
    }

    companion object {
        const val TAG = "MarjaneMallActivity"
        const val PREFS_NAME = "marjane_tms_prefs"
        const val KEY_LAST_URL = "key_last_tms_url"
        const val KEY_SAVED_USER = "key_saved_tms_user"
        const val KEY_SAVED_PASS = "key_saved_tms_pass"
        const val DEFAULT_TMS_URL = "https://tms.marjanemall.ma/"
        const val TMS_LOGIN_URL = "https://tms.marjanemall.ma/Account/Login"
    }
}
