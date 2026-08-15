// db.js - Shared database functions (main finance DB + users DB sync)
// Exposes window.financeDB and window.financeUsersDB (if users sync configured)

const db = new PouchDB('finance');
window.financeDB = db;

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
      .on('paused', () => console.debug('Remote finance sync paused'))
      .on('active', () => console.debug('Remote finance sync active'))
      .on('error', err => console.warn('Remote sync warning:', err));
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

    const remoteOpts = { skip_setup: true };
    if (cfg.couchAuth && cfg.couchAuth.username && cfg.couchAuth.password) {
      remoteOpts.auth = { username: cfg.couchAuth.username, password: cfg.couchAuth.password };
    }

    if (remoteUsersUrl) {
      try {
        const remoteUsers = new PouchDB(remoteUsersUrl, remoteOpts);
        usersDb.sync(remoteUsers, { live: true, retry: true })
          .on('change', info => console.debug('Users DB sync change', info))
          .on('paused', () => console.debug('Users DB sync paused'))
          .on('active', () => console.debug('Users DB sync active'))
          .on('error', err => console.warn('Users DB sync error', err));
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
