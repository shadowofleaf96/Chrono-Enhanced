/* ============================================================
   Chrono Enhanced — Background Service Worker
   Handles cross-origin API requests to bypass CORS restrictions
   in Chrome Extension Manifest V3.
   ============================================================ */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'UPDATE_CONSIGNMENT_STATUS') {
    handleUpdateStatus(request)
      .then(sendResponse)
      .catch((err) => {
        sendResponse({
          success: false,
          error: err.message || 'Unknown background script error'
        });
      });
    return true; // Keep message channel open for async response
  }
});

async function handleUpdateStatus({ eventCode, referenceNumber, reason, apiKey, apiTokens }) {
  if (!eventCode) {
    return { success: false, error: 'Event code is required.' };
  }
  if (!referenceNumber) {
    return { success: false, error: 'Reference number is required.' };
  }

  const cleanEventCode = encodeURIComponent(eventCode.trim());
  const url = `https://projectxeuapi.shipsy.io/api/client/integration/consignment/event/${cleanEventCode}`;

  const headers = {
    'Content-Type': 'application/json'
  };

  // Attach session tokens from web context if available
  if (apiTokens && typeof apiTokens === 'object') {
    Object.assign(headers, apiTokens);
  }

  // Attach Shipsy Integration API key (takes precedence for /api/client/integration/ endpoints)
  if (apiKey && typeof apiKey === 'string' && apiKey.trim()) {
    headers['api-key'] = apiKey.trim();
  }

  const payload = {
    reference_number: referenceNumber.trim(),
    event_time_epoch: Math.floor(Date.now() / 1000)
  };

  if (reason && typeof reason === 'string' && reason.trim()) {
    payload.reason = reason.trim();
    payload.comments = reason.trim();
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    const responseText = await res.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    if (!res.ok) {
      let errorMsg = `HTTP Error ${res.status}`;
      if (responseData && typeof responseData === 'object') {
        if (responseData.error && typeof responseData.error === 'object') {
          errorMsg = responseData.error.message || responseData.error.reason || JSON.stringify(responseData.error);
        } else if (responseData.message) {
          errorMsg = responseData.message;
        } else if (responseData.error) {
          errorMsg = responseData.error;
        }
      } else if (typeof responseData === 'string' && responseData.trim()) {
        errorMsg = responseData;
      }

      return {
        success: false,
        status: res.status,
        error: errorMsg,
        data: responseData
      };
    }

    return {
      success: true,
      data: responseData
    };
  } catch (err) {
    return {
      success: false,
      error: `Network error: ${err.message || String(err)}`
    };
  }
}
