(function() {
  const parseHeaders = (headers) => {
    let extracted = {};
    if (headers instanceof Headers) {
      headers.forEach((value, key) => {
        extracted[key.toLowerCase()] = value;
      });
    } else if (typeof headers === 'object' && headers !== null) {
      for (let key in headers) {
        extracted[key.toLowerCase()] = headers[key];
      }
    }
    return extracted;
  };

  const decryptShipsyAES = async (encryptedHex) => {
    if (!encryptedHex || typeof encryptedHex !== 'string' || encryptedHex.length <= 16) return encryptedHex;
    try {
      const keyStr = "8b7e156228aed2a6abf7152985cf4f9c";
      const t = encryptedHex.substring(0, 16);
      const a = encryptedHex.substring(16);
      const iv = new TextEncoder().encode(t);
      const match = a.match(/.{1,2}/g);
      if (!match) return encryptedHex;
      const ciphertextBytes = new Uint8Array(match.map(byte => parseInt(byte, 16)));

      const cryptoKey = await window.crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(keyStr),
        "AES-CBC",
        false,
        ["decrypt"]
      );

      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-CBC", iv: iv },
        cryptoKey,
        ciphertextBytes
      );

      return new TextDecoder().decode(decryptedBuffer);
    } catch (_) {
      return encryptedHex;
    }
  };

  const notifyExtension = async (extracted) => {
    let accessToken = extracted['access-token'] || '';
    let userId = extracted['user-id'] || '';

    if (accessToken && accessToken.length > 50 && /^[a-f0-9]+$/i.test(accessToken)) {
      accessToken = await decryptShipsyAES(accessToken) || accessToken;
    }
    if (userId && userId.length > 30 && /^[a-f0-9]+$/i.test(userId)) {
      userId = await decryptShipsyAES(userId) || userId;
    }

    if (accessToken) {
      const tokens = {
        'access-token': accessToken,
        'user-id': userId,
        'organisation-id': extracted['organisation-id'] || 'chronodiali',
        'application-type': extracted['application-type'] || 'ops'
      };
      console.log('🔑 [ChronoExt] Captured API Tokens (Decrypted):', tokens);
      window.postMessage({
        type: 'CHRONO_TOKENS',
        tokens: tokens
      }, '*');
    }
  };

  // Automatically read & decrypt from Shipsy localStorage if present
  const checkLocalStorageAuth = async () => {
    try {
      const encUid = localStorage.getItem('___USER_ID__');
      const encToken = localStorage.getItem('__AUTH_TOKEN__');
      const orgId = localStorage.getItem('__ORGANISATION_ID__') || 'chronodiali';
      if (encUid || encToken) {
        const userId = encUid ? await decryptShipsyAES(encUid) : '';
        const accessToken = encToken ? await decryptShipsyAES(encToken) : '';
        if (accessToken) {
          notifyExtension({
            'access-token': accessToken,
            'user-id': userId || '2540768522926034221',
            'organisation-id': orgId,
            'application-type': 'ops'
          });
        }
      }
    } catch (_) {}
  };
  checkLocalStorageAuth();

  const notifyApiIntercept = (url, method, body, responseText) => {
    window.postMessage({
      type: 'CHRONO_API_INTERCEPT',
      payload: { url, method, body, response: responseText }
    }, '*');
  };

  // Intercept Fetch API
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
    const options = args[1] || {};
    
    if (options.headers) {
      notifyExtension(parseHeaders(options.headers));
    }
    
    const response = await originalFetch.apply(this, args);
    
    if (url.includes('getReconciliationData') || url.includes('transactionsHistory') || url.includes('transaction') || url.includes('Transaction')) {
      const clonedRes = response.clone();
      clonedRes.text().then(text => {
        const bodyStr = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : '';
        notifyApiIntercept(url, options.method || 'GET', bodyStr, text);
      }).catch(e => console.error(e));
    }
    
    return response;
  };

  // Intercept XHR
  const originalXHR = window.XMLHttpRequest;
  function newXHR() {
    const xhr = new originalXHR();
    const originalSetRequestHeader = xhr.setRequestHeader;
    const originalSend = xhr.send;
    
    xhr._reqHeaders = {};
    xhr.setRequestHeader = function(header, value) {
      xhr._reqHeaders[header] = value;
      notifyExtension(parseHeaders(xhr._reqHeaders));
      return originalSetRequestHeader.apply(this, arguments);
    };
    
    xhr.send = function(body) {
      this.addEventListener('load', function() {
        if (this.responseURL && (this.responseURL.includes('getReconciliationData') || this.responseURL.includes('transactionsHistory') || this.responseURL.includes('transaction') || this.responseURL.includes('Transaction'))) {
          try {
            const bodyStr = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
            notifyApiIntercept(this.responseURL, 'POST', bodyStr, this.responseText);
          } catch(e) {}
        }
      });
      return originalSend.apply(this, arguments);
    };
    
    return xhr;
  }
  window.XMLHttpRequest = newXHR;

})();
