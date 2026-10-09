(function () {
  'use strict';

  const hostname = window.location.hostname || '';
  const isLocalDev = ['localhost', '127.0.0.1', '::1'].includes(hostname);

  window.__APP_BASE_PATH__ = window.__APP_BASE_PATH__ ||
    (hostname.toLowerCase() === 'amitesh2204.github.io' ? '/finance-tracker/' : '/');

  window.__API_BASE__ = window.__API_BASE__ ||
    (isLocalDev ? 'http://127.0.0.1:8001' : '');

  // Production CouchDB configuration.
  // IMPORTANT: No CouchDB credentials belong in this file.
  window.__CONFIG__ = {
    couchHost: 'orleans-earl-auburn-anniversary.trycloudflare.com',
    couchDbName: 'finance',
    apiBase: window.__API_BASE__,
    requireLogin: true,
    allowRemoteUserSync: false
  };

  // CouchDB credentials are supplied at runtime and kept only
  // in sessionStorage by the application.
})();
