// config.js
(function () {
  'use strict';

  const hostname = window.location.hostname || '';
  const isLocalDev = ['localhost', '127.0.0.1', '::1'].includes(hostname);

  window.__API_BASE__ = window.__API_BASE__ || (isLocalDev ? 'http://127.0.0.1:8001' : '');

  // Production CouchDB configuration.
  // IMPORTANT: No CouchDB credentials belong in this file.
  window.__CONFIG__ = {
    couchHost: 'mar-detective-influences-trembl.trycloudflare.com',
    couchDbName: 'finance',
    apiBase: window.__API_BASE__,
    requireLogin: true,
    allowRemoteUserSync: false
  };

  // CouchDB credentials are supplied at runtime and kept only
  // in sessionStorage by the application.
})();
