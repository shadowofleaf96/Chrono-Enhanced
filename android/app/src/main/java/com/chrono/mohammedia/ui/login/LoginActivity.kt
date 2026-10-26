package com.chrono.mohammedia.ui.login

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.widget.Toast
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.chrono.mohammedia.databinding.ActivityLoginBinding
import com.chrono.mohammedia.ui.MainActivity
import com.chrono.mohammedia.ui.riders.RidersViewModel
import kotlinx.coroutines.launch

class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding
    private val viewModel: RidersViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val repo = viewModel.repository
        repo.loadPreferences(this)

        val forceLogin = intent.getBooleanExtra(EXTRA_FORCE_LOGIN, false)

        // If user already has an active authenticated session and didn't request a forced re-login, proceed to MainActivity
        if (savedInstanceState == null && !forceLogin && repo.hasValidSavedSession()) {
            startMainActivityAndFinish()
            return
        }

        setupViews()
        setupListeners()
    }

    private fun setupViews() {
        // Do not pre-fill username or password per user preference
        binding.editUsername.setText("")
        binding.editPassword.setText("")
        binding.cbRememberMe.isChecked = true
    }

    private fun setupListeners() {
        binding.btnLogin.setOnClickListener {
            performLogin()
        }
    }

    private fun performLogin() {
        val username = binding.editUsername.text?.toString()?.trim().orEmpty()
        val password = binding.editPassword.text?.toString()?.trim().orEmpty()
        val rememberMe = binding.cbRememberMe.isChecked

        hideKeyboard()

        if (username.isBlank()) {
            binding.tilUsername.error = "Veuillez renseigner votre identifiant ou email"
            binding.editUsername.requestFocus()
            return
        } else {
            binding.tilUsername.error = null
        }

        if (password.isBlank()) {
            binding.tilPassword.error = "Veuillez saisir votre mot de passe"
            binding.editPassword.requestFocus()
            return
        } else {
            binding.tilPassword.error = null
        }

        binding.btnLogin.isEnabled = false
        binding.btnLogin.text = ""
        binding.progressLogin.visibility = View.VISIBLE
        binding.cardError.visibility = View.GONE

        lifecycleScope.launch {
            val result = viewModel.repository.loginWithPlaintext(
                username = username,
                plaintextPassword = password,
                rememberMe = rememberMe,
                context = this@LoginActivity
            )

            binding.btnLogin.isEnabled = true
            binding.btnLogin.text = "SE CONNECTER"
            binding.progressLogin.visibility = View.GONE

            if (result.isSuccess) {
                val data = result.getOrNull()
                val employeeName = data?.employee?.fullName ?: username
                Toast.makeText(
                    this@LoginActivity,
                    "✅ Connexion réussie ! Bienvenue $employeeName",
                    Toast.LENGTH_SHORT
                ).show()

                if (callingActivity != null) {
                    setResult(RESULT_OK)
                    finish()
                } else {
                    startMainActivityAndFinish()
                }
            } else {
                val ex = result.exceptionOrNull()
                val msg = ex?.localizedMessage ?: "Échec d'authentification. Vérifiez vos identifiants."
                binding.tvErrorMsg.text = msg
                binding.cardError.visibility = View.VISIBLE
            }
        }
    }

    private fun startMainActivityAndFinish() {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        startActivity(intent)
        finish()
    }

    private fun hideKeyboard() {
        val view = currentFocus ?: binding.root
        val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
        imm?.hideSoftInputFromWindow(view.windowToken, 0)
    }

    companion object {
        const val EXTRA_FORCE_LOGIN = "extra_force_login"

        fun createIntent(context: Context, forceLogin: Boolean = false): Intent {
            return Intent(context, LoginActivity::class.java).apply {
                putExtra(EXTRA_FORCE_LOGIN, forceLogin)
            }
        }
    }
}
