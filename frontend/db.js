// db.js - Shared database functions (main finance DB + users DB sync)
// Runtime CouchDB credentials are kept only in sessionStorage.

(function () {
  'use strict';

  const SYNC_SESSION_KEY = 'finance-tracker:couch-sync-credentials';
  let financeSyncHandle = null;
  let usersSyncHandle = null;

  function getConfig() {
    return window.__CONFIG__ || {};
  }

  function getStoredCredentials() {
    try {
      const raw = sessionStorage.getItem(SYNC_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn('Unable to read CouchDB session credentials:', err);
      return null;
    }
  }

  function saveCredentials(username, password) {
    if (!username || !password) {
      throw new Error('CouchDB username and password are required.');
    }

    sessionStorage.setItem(
      SYNC_SESSION_KEY,
      JSON.stringify({ username, password })
    );
  }

  function clearCredentials() {
    sessionStorage.removeItem(SYNC_SESSION_KEY);

    if (financeSyncHandle) {
      try { financeSyncHandle.cancel(); } catch (err) {}
      financeSyncHandle = null;
    }

    if (usersSyncHandle) {
      try { usersSyncHandle.cancel(); } catch (err) {}
      usersSyncHandle = null;
    }

    setSyncStatus('signed-out', 'CouchDB credentials cleared');
  }

  function setSyncStatus(state, detail) {
    window.__FINANCE_SYNC_STATUS__ = {
      state,
      detail: detail || '',
      at: new Date().toISOString()
    };

    window.dispatchEvent(
      new CustomEvent('finance-sync-status', {
        detail: window.__FINANCE_SYNC_STATUS__
      })
    );
  }

  function getRemoteUrl(dbName) {
    const cfg = getConfig();
    const host = String(cfg.couchHost || '')
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/$/, '');

    const name = String(dbName || '').trim();

    if (!host || !name) return null;

    if (!/^[A-Za-z0-9.-]+(?::\d+)?$/.test(host)) {
      throw new Error('Invalid CouchDB host in config.js');
    }

    if (!/^[A-Za-z0-9_$()+\-\/]+$/.test(name)) {
      throw new Error('Invalid CouchDB database name');
    }

    return `https://${host}/${name}`;
  }

  function getRemoteOptions(credentials) {
    const remoteOpts = { skip_setup: true };

    if (credentials?.username && credentials?.password) {
      remoteOpts.auth = {
        username: credentials.username,
        password: credentials.password
      };
    }

    return remoteOpts;
  }

  // Main local finance DB.
  // The local PouchDB name is intentionally "finance".
  // The remote CouchDB database is configured separately via couchDbName
  // (for example, "finance-test" in the test environment).
  const db = new PouchDB('finance');
  window.financeDB = db;

  function startFinanceSync(credentials) {
    const cfg = getConfig();
    const remoteUrl = getRemoteUrl(cfg.couchDbName || 'finance');

    if (!remoteUrl) {
      setSyncStatus('not-configured', 'CouchDB host/database is not configured');
      return false;
    }

    if (!credentials?.username || !credentials?.password) {
      setSyncStatus('auth-required', 'Enter the CouchDB credentials to enable sync');
      return false;
    }

    if (financeSyncHandle) {
      try { financeSyncHandle.cancel(); } catch (err) {}
    }

    const remoteDB = new PouchDB(
      remoteUrl,
      getRemoteOptions(credentials)
    );

    financeSyncHandle = db.sync(remoteDB, {
      live: true,
      retry: true
    })
      .on('change', info => {
        setSyncStatus(
          'synced',
          `Finance change replicated (${info.direction || 'sync'})`
        );
      })
      .on('paused', info => {
        setSyncStatus(
          'synced',
          info ? 'Finance sync waiting for changes' : 'Finance sync paused'
        );
      })
      .on('active', () => {
        setSyncStatus('syncing', 'Finance replication active');
      })
      .on('denied', () => {
        setSyncStatus(
          'error',
          'CouchDB denied the finance replication request'
        );
      })
      .on('error', () => {
        setSyncStatus(
          'error',
          'Finance replication error; check CouchDB availability and credentials'
        );
      });

    setSyncStatus('syncing', `Connected to ${cfg.couchDbName || 'finance'}`);
    return true;
  }

  // Users DB
  function initUsersDb(credentials) {
    try {
      const usersDb = window.financeUsersDB || new PouchDB('finance-users');
      window.financeUsersDB = usersDb;

      const cfg = getConfig();

      // User credentials remain local unless remote user sync is explicitly enabled.
      if (cfg.allowRemoteUserSync !== true) {
        console.debug(
          'initUsersDb: remote user sync disabled by configuration; users remain local'
        );
        return usersDb;
      }

      const remoteUsersUrl = getRemoteUrl('finance-users');

      if (!remoteUsersUrl) {
        console.debug(
          'initUsersDb: no remote users URL configured; users remain local'
        );
        return usersDb;
      }

      if (!credentials?.username || !credentials?.password) {
        console.debug(
          'initUsersDb: CouchDB credentials not available; users remain local'
        );
        return usersDb;
      }

      if (usersSyncHandle) {
        try { usersSyncHandle.cancel(); } catch (err) {}
        usersSyncHandle = null;
      }

      const remoteUsers = new PouchDB(
        remoteUsersUrl,
        getRemoteOptions(credentials)
      );

      usersSyncHandle = usersDb.sync(remoteUsers, {
        live: true,
        retry: true
      })
        .on('change', info => {
          console.debug('Users DB sync change', info);
        })
        .on('paused', info => {
          console.debug(
            'Users DB sync paused',
            info ? 'waiting for changes' : ''
          );
        })
        .on('active', () => {
          console.debug('Users DB sync active');
        })
        .on('denied', () => {
          console.warn('Users DB sync denied');
        })
        .on('error', err => {
          console.error('Users DB sync error', err);
        });

      console.debug('initUsersDb: usersDb.sync started', {
        remoteUsersUrl,
        hasAuth: true
      });

      // Create a Mango index on email to speed up email lookups.
      (async () => {
        try {
          if (typeof usersDb.createIndex === 'function') {
            await usersDb.createIndex({
              index: { fields: ['email'] }
            }).catch(() => null);
          }
        } catch (err) {
          console.warn('usersDb.createIndex failed', err);
        }
      })();

      return usersDb;
    } catch (err) {
      console.warn('initUsersDb failed', err);
      return window.financeUsersDB || null;
    }
  }

  function startAllSync(credentials) {
    if (!credentials?.username || !credentials?.password) {
      setSyncStatus(
        'auth-required',
        'Enter the CouchDB username and password to enable sync'
      );
      return false;
    }

    const financeStarted = startFinanceSync(credentials);
    initUsersDb(credentials);

    return financeStarted;
  }

  window.financeSync = {
    configure(username, password) {
      saveCredentials(username, password);
      return startAllSync({ username, password });
    },

    start() {
      return startAllSync(getStoredCredentials());
    },

    clear() {
      clearCredentials();
    },

    status() {
      return window.__FINANCE_SYNC_STATUS__ || {
        state: 'not-started',
        detail: ''
      };
    },

    isConfigured() {
      const cfg = getConfig();
      return !!(cfg.couchHost && cfg.couchDbName);
    },

  };

  // Start automatically when a runtime session already exists.
  try {
    const credentials = getStoredCredentials();

    if (credentials?.username && credentials?.password) {
      startAllSync(credentials);
    } else {
      setSyncStatus(
        'local-only',
        'Local PouchDB mode until CouchDB credentials are supplied'
      );
    }
  } catch (err) {
    setSyncStatus('error', err.message);
  }

  // --- Expose helper wrappers for entries (keeps previous behavior) ---
  window.addEntry = async function (entry) {
    try {
      return await db.post(entry);
    } catch (err) {
      console.error('Error adding entry:', err);
      throw err;
    }
  };

  window.fetchEntries = async function () {
    try {
      const result = await db.allDocs({ include_docs: true });
      return result.rows.map(r => r.doc);
    } catch (err) {
      console.error('Error fetching entries:', err);
      return [];
    }
  };

  window.deleteEntry = async function (docOrId) {
    try {
      const id =
        typeof docOrId === 'string'
          ? docOrId
          : docOrId && docOrId._id;

      if (!id) {
        throw new Error('deleteEntry: no _id provided');
      }

      const latest = await db.get(id);
      return await db.remove(latest);
    } catch (err) {
      console.error('Error deleting entry:', err);
      throw err;
    }
  };

  window.updateEntry = async function (docOrId, patchedData) {
    try {
      const id =
        typeof docOrId === 'string'
          ? docOrId
          : docOrId && docOrId._id;

      if (!id) {
        throw new Error('updateEntry: no _id provided');
      }

      const latest = await db.get(id);

      return await db.put({
        ...latest,
        ...patchedData,
        _id: id,
        _rev: latest._rev
      });
    } catch (err) {
      console.error('Error updating entry:', err);
      throw err;
    }
  };

  window._localFinanceDB = db;
})();
