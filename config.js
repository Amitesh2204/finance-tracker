// config.js
(function () {
  const hostname = window.location.hostname || '';
  const isLocalDev = ['localhost', '127.0.0.1', '::1'].includes(hostname);
  window.__API_BASE__ = window.__API_BASE__ || (isLocalDev ? 'http://127.0.0.1:8001' : '');

  // Primary CouchDB host (used by db.js for the main finance DB)
  // Replace couchHost with your tunnel/host. Provide credentials via couchAuth or set __USERS_COUCH__.
  window.__CONFIG__ = {
    couchHost: 'remarks-kentucky-acquired-stops.trycloudflare.com', // replace with your tunnel host
    couchDbName: 'finance',
    apiBase: window.__API_BASE__,
    // Recommended: store credentials here (or set window.__USERS_COUCH__ to a full URL with credentials)
    couchAuth: {
      username: 'admin',
      password: 'Winter_2026'
    }
  };

  // Optional explicit remote users DB URL (preferred if credentials are embedded)
  // Example: 'https://admin:password@your-tunnel/finance-users'
  // If empty, code will derive remote users URL from __CONFIG__.couchHost and use couchAuth.
  window.__USERS_COUCH__ = window.__USERS_COUCH__ || 'https://admin:Winter_2026@remarks-kentucky-acquired-stops.trycloudflare.com/finance-users';
})();
