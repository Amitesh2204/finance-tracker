// db.js - Shared database functions (main finance DB + users DB sync)
// Exposes window.financeDB and window.financeUsersDB (if users sync configured)

const db = new PouchDB('finance');
window.financeDB = db;

function safeInitRemoteSync() {
  try {
    const { couchHost, couchDbName } = window.__CONFIG__ || {};
    if (!couchHost || !couchDbName) {
      return;
    }

    const remoteDB = new PouchDB(`https://${couchHost}/${couchDbName}`, {
      auth: { username: "admin", password: "Winter_2026" },
      skip_setup: true
    });

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
    // Avoid recreating if already created elsewhere
    if (window.financeUsersDB) return;

    const usersDb = new PouchDB('finance-users');
    window.financeUsersDB = usersDb;

    // If a remote users DB URL is provided via config, set up live sync
    // window.__USERS_COUCH__ should be a full URL like: https://user:pass@host/finance-users
    try {
      const remoteUsersUrl = window.__USERS_COUCH__ || null;
      if (remoteUsersUrl) {
        const remoteUsers = new PouchDB(remoteUsersUrl, { skip_setup: true });
        usersDb.sync(remoteUsers, { live: true, retry: true })
          .on('change', info => console.debug('Users DB sync change', info))
          .on('paused', () => console.debug('Users DB sync paused'))
          .on('active', () => console.debug('Users DB sync active'))
          .on('error', err => console.warn('Users DB sync error', err));
      }
    } catch (e) {
      console.warn('Users DB live sync setup failed', e);
    }

    // Create a Mango index on email to speed up email lookups (safe to call repeatedly)
    (async () => {
      try {
        if (typeof usersDb.createIndex === 'function') {
          await usersDb.createIndex({ index: { fields: ['email'] } }).catch(() => null);
        }
      } catch (e) {
        // non-fatal
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
