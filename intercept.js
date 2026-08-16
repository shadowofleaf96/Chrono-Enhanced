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

  const notifyExtension = (extracted) => {
    if (extracted['access-token']) {
      window.postMessage({
        type: 'CHRONO_TOKENS',
        tokens: {
          'access-token': extracted['access-token'],
          'user-id': extracted['user-id'] || '',
          'organisation-id': extracted['organisation-id'] || '',
          'application-type': extracted['application-type'] || ''
        }
      }, '*');
    }
  };

  // Intercept Fetch API
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    if (args[1] && args[1].headers) {
      notifyExtension(parseHeaders(args[1].headers));
    }
    return originalFetch.apply(this, args);
  };

  // Intercept XHR
  const originalXHR = window.XMLHttpRequest;
  function newXHR() {
    const xhr = new originalXHR();
    const originalSetRequestHeader = xhr.setRequestHeader;
    xhr._reqHeaders = {};
    xhr.setRequestHeader = function(header, value) {
      xhr._reqHeaders[header] = value;
      notifyExtension(parseHeaders(xhr._reqHeaders));
      return originalSetRequestHeader.apply(this, arguments);
    };
    return xhr;
  }
  window.XMLHttpRequest = newXHR;

})();
