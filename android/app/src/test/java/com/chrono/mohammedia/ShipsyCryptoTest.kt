package com.chrono.mohammedia

import com.chrono.mohammedia.util.ShipsyCrypto
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class ShipsyCryptoTest {

    @Test
    fun testEncryptPasswordAndLiveLogin() {
        val plaintextPwd = "Pass123-**"
        val username = "M.KOTBI@CHRONODIALI.MA"

        val encryptedBase64 = ShipsyCrypto.encryptPassword(plaintextPwd)
        println("Generated Encrypted Pwd:\n$encryptedBase64")

        assertNotNull(encryptedBase64)
        assertTrue(encryptedBase64.isNotBlank())

        // Test against Shipsy login endpoint
        val url = URL("https://projectxeuapi.shipsy.io/api/dashboard/login")
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Content-Type", "application/json")
        conn.setRequestProperty("Accept", "application/json")
        conn.setRequestProperty("organisation-id", "chronodiali")
        conn.doOutput = true

        val jsonBody = """{"username":"$username","pwd":"$encryptedBase64"}"""
        OutputStreamWriter(conn.outputStream).use { it.write(jsonBody) }

        val responseCode = conn.responseCode
        println("Login API Response Code: $responseCode")

        val responseText = if (responseCode == 200) {
            conn.inputStream.bufferedReader().use { it.readText() }
        } else {
            conn.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
        }
        println("Login API Response:\n$responseText")

        assertTrue("Expected HTTP 200, got $responseCode: $responseText", responseCode == 200)
        assertTrue("Expected access_token in response", responseText.contains("access_token"))
    }

    @Test
    fun testFetchOneConsignment() {
        val plaintextPwd = "Pass123-**"
        val username = "M.KOTBI@CHRONODIALI.MA"
        val encryptedBase64 = ShipsyCrypto.encryptPassword(plaintextPwd)

        val loginUrl = URL("https://projectxeuapi.shipsy.io/api/dashboard/login")
        val loginConn = loginUrl.openConnection() as HttpURLConnection
        loginConn.requestMethod = "POST"
        loginConn.setRequestProperty("Content-Type", "application/json")
        loginConn.setRequestProperty("Accept", "application/json")
        loginConn.setRequestProperty("organisation-id", "chronodiali")
        loginConn.doOutput = true

        val jsonBody = """{"username":"$username","pwd":"$encryptedBase64"}"""
        OutputStreamWriter(loginConn.outputStream).use { it.write(jsonBody) }

        val loginResp = loginConn.inputStream.bufferedReader().use { it.readText() }
        val tokenRegex = """"access_token":\{"id":"([^"]+)"""".toRegex()
        val tokenMatch = tokenRegex.find(loginResp)
        val token = tokenMatch?.groupValues?.get(1)
        assertNotNull("Token must not be null", token)

        val cn = "LD644278718MA"
        val fetchUrl = URL("https://projectxeuapi.shipsy.io/api/CRMDashboard/consignments/fetchOne?referenceNumber=$cn&send_unmasked_data=false")
        val fetchConn = fetchUrl.openConnection() as HttpURLConnection
        fetchConn.requestMethod = "GET"
        fetchConn.setRequestProperty("Accept", "application/json")
        fetchConn.setRequestProperty("access-token", token)
        fetchConn.setRequestProperty("user-id", "2540768522926034221")
        fetchConn.setRequestProperty("organisation-id", "chronodiali")
        fetchConn.setRequestProperty("application-type", "ops")

        val fetchCode = fetchConn.responseCode
        println("FetchOne HTTP Code: $fetchCode")
        val fetchText = if (fetchCode == 200) {
            fetchConn.inputStream.bufferedReader().use { it.readText() }
        } else {
            fetchConn.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
        }
        println("FetchOne Response: $fetchText")
        assertTrue("FetchOne should return 200", fetchCode == 200)
    }
}
