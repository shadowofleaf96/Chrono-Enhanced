package com.chrono.mohammedia.util

import java.security.KeyFactory
import java.security.spec.MGF1ParameterSpec
import java.security.spec.X509EncodedKeySpec
import javax.crypto.Cipher
import javax.crypto.spec.OAEPParameterSpec
import javax.crypto.spec.PSource

object ShipsyCrypto {

    // Shipsy Web CRM RSA 2048-bit Public Key extracted from main.b053543b.js
    private const val SHIPSY_PUBLIC_KEY_PEM = """
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA8U+fRUkt2fV+HiYLPRvV
ZUH6QHL/PU60+EfKX3A6p9tMc/Ntg2N1B9aBXXjZA4gIFcRO5w6PpzWA7dqrzKQD
yIdNtExjkaeA8KLLUm+JE5IN5P14yknCqgb6AtJB3aFWD2VipXH/U4tLaEona7AI
pf4mzy6EWZdmC2c3kbb0dW5WQg1yemO+P8JpExvNpAu8fKwZWq1so4hGgR7paYCs
aH+qqCy8h5wu8mSHgWldQfJtgGomEBDu5P91ouA59ri6NVeXMCSJMfDvYgW5XiBb
Co5kHgtE+0cvtmTA3w58Mr4I6qlJM2teJkPEWZvDLdMlOBaH3M6cH1DR0xcHhkB8
cwIDAQAB
"""

    /**
     * Encrypts plaintext password using RSA-OAEP SHA-256 / MGF1-SHA256 matching Shipsy's Web Crypto implementation.
     * The resulting Base64 string can be sent directly in the `pwd` field of Shipsy login API.
     */
    fun encryptPassword(plaintext: String): String {
        val cleanKey = SHIPSY_PUBLIC_KEY_PEM
            .replace("-----BEGIN PUBLIC KEY-----", "")
            .replace("-----END PUBLIC KEY-----", "")
            .replace("\\s".toRegex(), "")

        val keyBytes = decodeBase64(cleanKey)
        val keySpec = X509EncodedKeySpec(keyBytes)
        val keyFactory = KeyFactory.getInstance("RSA")
        val publicKey = keyFactory.generatePublic(keySpec)

        val oaepParams = OAEPParameterSpec(
            "SHA-256",
            "MGF1",
            MGF1ParameterSpec.SHA256,
            PSource.PSpecified.DEFAULT
        )

        val cipher = try {
            Cipher.getInstance("RSA/ECB/OAEPWithSHA-256AndMGF1Padding").apply {
                init(Cipher.ENCRYPT_MODE, publicKey, oaepParams)
            }
        } catch (_: Throwable) {
            Cipher.getInstance("RSA/ECB/OAEPPadding").apply {
                init(Cipher.ENCRYPT_MODE, publicKey, oaepParams)
            }
        }

        val encryptedBytes = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
        return encodeBase64(encryptedBytes)
    }

    private fun decodeBase64(base64Str: String): ByteArray {
        return try {
            android.util.Base64.decode(base64Str, android.util.Base64.DEFAULT)
        } catch (_: Throwable) {
            java.util.Base64.getDecoder().decode(base64Str)
        }
    }

    private fun encodeBase64(bytes: ByteArray): String {
        return try {
            android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
        } catch (_: Throwable) {
            java.util.Base64.getEncoder().encodeToString(bytes)
        }
    }
}
