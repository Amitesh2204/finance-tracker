// config.js
(function () {
  const hostname = window.location.hostname || '';
  const isLocalDev = ['localhost', '127.0.0.1', '::1'].includes(hostname);
  window.__API_BASE__ = window.__API_BASE__ || (isLocalDev ? 'http://127.0.0.1:8001' : '');

  window.__CONFIG__ = {
    couchHost: 'shadow-jersey-inches-presents.trycloudflare.com', // <-- replace with your current tunnel URL
    couchDbName: 'finance',
    apiBase: window.__API_BASE__
  };
})();
