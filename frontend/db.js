// db.js - Shared database functions (main finance DB + users DB sync)
// Exposes window.financeDB and window.financeUsersDB (if users sync configured)

(function () {
  'use strict';

  // Main finance DB (local PouchDB)
  const db = new PouchDB('finance');
  window.financeDB = db;

  // Initialize remote sync for the main finance DB (uses __CONFIG__)
  function safeInitRemoteSync() {
    try {
      const { couchHost, couchDbName, couchAuth } = window.__CONFIG__ || {};
      if (!couchHost || !couchDbName) {
        console.debug('safeInitRemoteSync: no couchHost/couchDbName configured');
        return;
      }

      const remoteUrl = `https://${couchHost}/${couchDbName}`;
      const remoteOpts = { skip_setup: true };
      if (couchAuth && couchAuth.username && couchAuth.password) {
        remoteOpts.auth = { username: couchAuth.username, password: couchAuth.password };
      }

      const remoteDB = new PouchDB(remoteUrl, remoteOpts);

      db.sync(remoteDB, { live: true, retry: true })
        .on('change', info => console.debug('Remote finance sync change', info))
        .on('paused', info => console.debug('Remote finance sync paused', info))
        .on('active', info => console.debug('Remote finance sync active', info))
        .on('denied', info => console.warn('Remote finance sync denied', info))
        .on('error', err => console.error('Remote finance sync error', err));
    } catch (err) {
      console.warn('Remote sync skipped:', err);
    }
  }

  safeInitRemoteSync();

  // --- Users DB initialization and sync (separate DB so user docs replicate independently) ---
  (function initUsersDbSync() {
    try {
      if (window.financeUsersDB) return;

      const usersDb = new PouchDB('finance-users');
      window.financeUsersDB = usersDb;

      // Determine remote users URL and auth
      let remoteUsersUrl = (typeof window.__USERS_COUCH__ === 'string' && window.__USERS_COUCH__.trim()) ? window.__USERS_COUCH__.trim() : null;
      const cfg = window.__CONFIG__ || {};
      if (!remoteUsersUrl && cfg.couchHost) {
        remoteUsersUrl = `https://${cfg.couchHost}/finance-users`;
      }

      // Build remote options and extract credentials if embedded in URL
      const remoteOpts = { skip_setup: true };
      try {
        if (remoteUsersUrl) {
          try {
            const parsed = new URL(remoteUsersUrl);
            if (parsed.username || parsed.password) {
              // set auth explicitly for PouchDB (safer than relying on credentials in URL)
              remoteOpts.auth = {
                username: decodeURIComponent(parsed.username || ''),
                password: decodeURIComponent(parsed.password || '')
              };
              // remove credentials from URL to avoid browser quirks
              parsed.username = '';
              parsed.password = '';
              remoteUsersUrl = parsed.toString();
            }
          } catch (e) {
            // If URL parsing fails, fall back to cfg.couchAuth below
            console.debug('initUsersDbSync: URL parse failed (falling back to cfg.couchAuth)', e);
          }
        }

        // If no auth from URL, use cfg.couchAuth if present
        if (!remoteOpts.auth && cfg.couchAuth && cfg.couchAuth.username && cfg.couchAuth.password) {
          remoteOpts.auth = { username: cfg.couchAuth.username, password: cfg.couchAuth.password };
        }
      } catch (e) {
        console.warn('initUsersDbSync: credential parsing failed', e);
      }

      if (remoteUsersUrl) {
        try {
          const remoteUsers = new PouchDB(remoteUsersUrl, remoteOpts);

          // Live bi-directional sync
          usersDb.sync(remoteUsers, { live: true, retry: true })
            .on('change', info => console.debug('Users DB sync change', info))
            .on('paused', info => console.debug('Users DB sync paused', info))
            .on('active', info => console.debug('Users DB sync active', info))
            .on('denied', info => console.warn('Users DB sync denied', info))
            .on('error', err => console.error('Users DB sync error', err));

          console.debug('initUsersDbSync: usersDb.sync started', { remoteUsersUrl, hasAuth: !!remoteOpts.auth });
        } catch (e) {
          console.warn('Users DB live sync setup failed', e);
        }
      } else {
        console.debug('initUsersDbSync: no remote users URL configured; users will remain local until configured');
      }

      // Create a Mango index on email to speed up email lookups (safe to call repeatedly)
      (async () => {
        try {
          if (typeof usersDb.createIndex === 'function') {
            await usersDb.createIndex({ index: { fields: ['email'] } }).catch(() => null);
          }
        } catch (e) {
          console.warn('usersDb.createIndex failed', e);
        }
      })();
    } catch (err) {
      console.warn('initUsersDbSync skipped', err);
    }
  })();

  // --- Expose helper wrappers for entries (keeps previous behavior) ---
  window.addEntry = async function(entry) {
    try {
      return await db.post(entry);
    } catch (err) {
      console.error("Error adding entry:", err);
      throw err;
    }
  };

  window.fetchEntries = async function() {
    try {
      const result = await db.allDocs({ include_docs: true });
      return result.rows.map(r => r.doc);
    } catch (err) {
      console.error("Error fetching entries:", err);
      return [];
    }
  };

  // Delete an entry by its doc (or _id). Always re-fetches the latest _rev
  // first so this works even if the doc was synced/updated elsewhere since
  // it was loaded into the page.
  window.deleteEntry = async function(docOrId) {
    try {
      const id = typeof docOrId === 'string' ? docOrId : docOrId && docOrId._id;
      if (!id) throw new Error('deleteEntry: no _id provided');
      const latest = await db.get(id);
      return await db.remove(latest);
    } catch (err) {
      console.error("Error deleting entry:", err);
      throw err;
    }
  };

  // Expose local DB for debugging
  window._localFinanceDB = db;
})();
