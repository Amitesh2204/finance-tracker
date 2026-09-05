// app.js - main application logic (full file)
// Uses window.financeDB (from db.js) when available and falls back to remote API or localStorage.
// Adds authentication (local users stored in PouchDB 'finance-users' DB) and robust replication helpers.
// Preserves existing entries logic, charts, and UI wiring. Defensive checks added to avoid runtime errors.

(function () {
  'use strict';

  const db = window.financeDB || null;
  const STORAGE_KEY = 'finance-tracker:last-entries';
  const USER_KEY = 'finance-tracker:current-user';
  const USERS_DB_NAME = 'finance-users';
  const THEME_KEY = 'finance-tracker:theme';

  function updateChartTheme() {
    if (typeof Chart === 'undefined' || !Chart.defaults) return;
    const styles = getComputedStyle(document.documentElement);
    const textColor = styles.getPropertyValue('--text').trim();
    const borderColor = styles.getPropertyValue('--border').trim();
    if (textColor) Chart.defaults.color = textColor;
    if (borderColor) Chart.defaults.borderColor = borderColor;
    document.querySelectorAll('canvas').forEach(canvas => {
      const chart = Chart.getChart?.(canvas);
      if (chart) chart.update('none');
    });
  }

  function applyTheme(theme) {
    const allowedThemes = ['light', 'dark', 'custom'];
    const selectedTheme = allowedThemes.includes(theme) ? theme : 'light';
    document.documentElement.dataset.theme = selectedTheme;
    try { localStorage.setItem(THEME_KEY, selectedTheme); } catch (e) { /* storage is optional */ }
    updateChartTheme();
    const selector = document.getElementById('themeSelect');
    if (selector) selector.value = selectedTheme;
  }

  function initTheme() {
    let savedTheme = 'light';
    try { savedTheme = localStorage.getItem(THEME_KEY) || 'light'; } catch (e) { /* storage is optional */ }
    applyTheme(savedTheme);
    const selector = document.getElementById('themeSelect');
    if (selector && !selector.dataset.themeBound) {
      selector.addEventListener('change', event => applyTheme(event.target.value));
      selector.dataset.themeBound = 'true';
    }
  }

  initTheme();

  // --- Utility functions ---
  function normalizeEntryType(entry) {
    return String(entry?.type || '').trim().toLowerCase();
  }

  function isInvestmentCategoryText(value) {
    return /(mutual|lic|ppf|sukanya|investment)/i.test(String(value || ''));
  }

  function isInvestmentEntry(entry) {
    if (!entry) return false;
    const type = normalizeEntryType(entry);
    if (type === 'investment') return true;
    if (type === 'saving') {
      return isInvestmentCategoryText(entry.category) || isInvestmentCategoryText(entry.notes);
    }
    return isInvestmentCategoryText(entry.category) || isInvestmentCategoryText(entry.notes);
  }

  function toIsoDate(dateValue) {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    return utcDate.toISOString();
  }

  function parseExcelDateValue(dateValue) {
    if (dateValue === null || dateValue === undefined || String(dateValue).trim() === '') return null;
    if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) return dateValue;

    if (typeof dateValue === 'number' && Number.isFinite(dateValue)) {
      if (dateValue > 1000 && dateValue < 50000) {
        return new Date(Date.UTC(1899, 11, 30) + (dateValue * 86400000));
      }
      return new Date(dateValue);
    }

    const raw = String(dateValue).trim();
    if (!raw) return null;

    if (/^\d+(?:\.\d+)?$/.test(raw)) {
      const serial = Number(raw);
      if (serial > 1000 && serial < 50000) {
        return new Date(Date.UTC(1899, 11, 30) + (serial * 86400000));
      }
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function parseAmountValue(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const token = String(value).replace(/[₹,\s]/g, '');
    const match = token.match(/[-+]?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeColumnName(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function getRowValueByAliases(row, aliases) {
    if (!row || !aliases || aliases.length === 0) return undefined;
    const normalizedMap = Object.keys(row || {}).reduce((acc, key) => {
      acc[normalizeColumnName(key)] = row[key];
      return acc;
    }, {});

    for (const alias of aliases) {
      const normalizedAlias = normalizeColumnName(alias);
      if (normalizedAlias in normalizedMap) {
        const value = normalizedMap[normalizedAlias];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
    }

    return undefined;
  }

  function validateExcelImportRows(rows, options = {}) {
    const dateAliases = Array.isArray(options.dateAliases) ? options.dateAliases : [];
    const amountAliases = Array.isArray(options.amountAliases) ? options.amountAliases : [];
    const bankAliases = Array.isArray(options.bankAliases) ? options.bankAliases : [];
    const validRows = [];
    const issues = [];

    const usableRows = rows.filter(row => Object.values(row || {}).some(value => String(value ?? '').trim() !== ''));
    if (usableRows.length === 0) {
      return { validRows, issues: ['The Excel file is empty or contains only blank rows.'] };
    }

    usableRows.forEach((row, index) => {
      const dateValue = getRowValueByAliases(row, dateAliases);
      const amountValue = getRowValueByAliases(row, amountAliases);

      if (dateValue === undefined || dateValue === null || String(dateValue).trim() === '') {
        issues.push(`Row ${index + 2}: missing date value.`);
        return;
      }

      if (amountValue === undefined || amountValue === null || String(amountValue).trim() === '') {
        issues.push(`Row ${index + 2}: missing amount value.`);
        return;
      }

      const parsedDate = parseExcelDateValue(dateValue);
      const parsedAmount = parseAmountValue(amountValue);

      if (!parsedDate) {
        issues.push(`Row ${index + 2}: invalid date '${dateValue}'.`);
        return;
      }

      if (parsedAmount === null || !Number.isFinite(parsedAmount)) {
        issues.push(`Row ${index + 2}: invalid amount '${amountValue}'.`);
        return;
      }

      const normalizedAmount = Math.abs(parsedAmount);
      if (normalizedAmount <= 0) {
        issues.push(`Row ${index + 2}: amount must be greater than zero.`);
        return;
      }

      const bankValue = bankAliases
        .map(alias => getRowValueByAliases(row, [alias]))
        .find(value => value !== undefined && value !== null && String(value).trim() !== '');

      validRows.push({
        date: toIsoDate(parsedDate),
        amount: normalizedAmount,
        bank: bankValue !== undefined && bankValue !== null ? String(bankValue) : 'N/A',
        raw: row,
        rowNumber: index + 2
      });
    });

    if (issues.length > 0) {
      return { validRows: [], issues };
    }

    return { validRows, issues: [] };
  }

  window.parseExcelDateValue = parseExcelDateValue;
  window.parseAmountValue = parseAmountValue;
  window.validateExcelImportRows = validateExcelImportRows;

  function formatCurrency(amount) {
    const val = Number(amount) || 0;
    try {
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val);
    } catch {
      return `₹${val.toFixed(2)}`;
    }
  }

  function parseLocalDate(dateValue) {
    if (!dateValue) return new Date();
    if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) return dateValue;
    if (typeof dateValue === 'string') {
      const trimmed = dateValue.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        const [year, month, day] = trimmed.split('-').map(Number);
        return new Date(year, month - 1, day);
      }
      if (/^\d{4}-\d{2}$/.test(trimmed)) {
        const [year, month] = trimmed.split('-').map(Number);
        return new Date(year, month - 1, 1);
      }
    }
    const parsed = new Date(dateValue);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  function getMonthKeyFromDate(dateValue) {
    const date = parseLocalDate(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    const month = date.toLocaleString('en-US', { month: 'short' });
    return `${month}-${date.getFullYear()}`;
  }

  function isCurrentMonthEntry(dateValue) {
    const date = parseLocalDate(dateValue);
    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }

  function getElementByAnyId(...ids) {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  }

  function persistEntries(entries) {
    try {
      if (Array.isArray(entries)) localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
      console.warn('persistEntries failed', e);
    }
  }

  function readStoredEntries() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('readStoredEntries failed', e);
      return [];
    }
  }

  // --- Users DB helper (PouchDB) ---
  // Returns a PouchDB instance for users and ensures replication/sync to remote if configured.
  // This implementation parses credentials from __USERS_COUCH__ or __CONFIG__.couchAuth and sets remoteOpts.auth explicitly.
  function getUsersDB() {
    try {
      if (window.financeUsersDB) return window.financeUsersDB;
      const usersDb = new PouchDB(USERS_DB_NAME);
      window.financeUsersDB = usersDb;

      // Determine remote users URL and auth
      let remoteUsersUrl = null;
      const cfg = window.__CONFIG__ || {};
      if (typeof window.__USERS_COUCH__ === 'string' && window.__USERS_COUCH__.trim()) {
        remoteUsersUrl = window.__USERS_COUCH__.trim();
      } else if (cfg.couchHost) {
        remoteUsersUrl = `https://${cfg.couchHost}/finance-users`;
      }

      const remoteOpts = { skip_setup: true };

      // Parse credentials from URL if present and set remoteOpts.auth explicitly
      try {
        if (remoteUsersUrl) {
          try {
            const parsed = new URL(remoteUsersUrl);
            if (parsed.username || parsed.password) {
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
            // ignore parse errors and fall back to cfg.couchAuth
          }
        }
        if (!remoteOpts.auth && cfg.couchAuth && cfg.couchAuth.username && cfg.couchAuth.password) {
          remoteOpts.auth = { username: cfg.couchAuth.username, password: cfg.couchAuth.password };
        }
      } catch (e) {
        console.warn('getUsersDB credential parsing failed', e);
      }

      if (remoteUsersUrl) {
        try {
          const remote = new PouchDB(remoteUsersUrl, remoteOpts);
          // start live sync so changes replicate both ways
          usersDb.sync(remote, { live: true, retry: true })
            .on('change', info => console.debug('Users DB sync change', info))
            .on('paused', info => console.debug('Users DB sync paused', info))
            .on('active', info => console.debug('Users DB sync active', info))
            .on('denied', info => console.warn('Users DB sync denied', info))
            .on('error', err => console.error('Users DB sync error', err));
          console.debug('getUsersDB: usersDb.sync started', { remoteUsersUrl, hasAuth: !!remoteOpts.auth });
        } catch (e) {
          console.warn('Users DB live sync setup failed', e);
        }
      } else {
        console.debug('getUsersDB: no remote users URL configured; users will remain local until configured');
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

      return usersDb;
    } catch (err) {
      console.warn('getUsersDB failed', err);
      return null;
    }
  }

  // Helper: replicate.to with retries and exponential backoff
  async function replicateToRemoteWithRetries(localDb, remoteUrl, remoteOpts = {}, maxAttempts = 4) {
    if (!localDb || !remoteUrl) throw new Error('replicateToRemoteWithRetries: missing args');
    let attempt = 0;
    let lastErr = null;
    while (attempt < maxAttempts) {
      attempt++;
      try {
        console.debug(`replicateToRemoteWithRetries: attempt ${attempt} -> ${remoteUrl}`);
        await localDb.replicate.to(new PouchDB(remoteUrl, Object.assign({ skip_setup: true }, remoteOpts)));
        console.debug('replicateToRemoteWithRetries: success');
        return true;
      } catch (err) {
        lastErr = err;
        console.warn(`replicate attempt ${attempt} failed`, err);
        const waitMs = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
        await new Promise(res => setTimeout(res, waitMs));
      }
    }
    throw lastErr || new Error('replicateToRemoteWithRetries: failed after retries');
  }

  // Helper: replicate.from with retries (pull latest docs before login)
  async function replicateFromRemoteWithRetries(localDb, remoteUrl, remoteOpts = {}, maxAttempts = 3) {
    if (!localDb || !remoteUrl) throw new Error('replicateFromRemoteWithRetries: missing args');
    let attempt = 0;
    let lastErr = null;
    while (attempt < maxAttempts) {
      attempt++;
      try {
        console.debug(`replicateFromRemoteWithRetries: attempt ${attempt} -> ${remoteUrl}`);
        await localDb.replicate.from(new PouchDB(remoteUrl, Object.assign({ skip_setup: true }, remoteOpts)));
        console.debug('replicateFromRemoteWithRetries: success');
        return true;
      } catch (err) {
        lastErr = err;
        console.warn(`replicate.from attempt ${attempt} failed`, err);
        const waitMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        await new Promise(res => setTimeout(res, waitMs));
      }
    }
    throw lastErr || new Error('replicateFromRemoteWithRetries: failed after retries');
  }

  // --- Authentication helpers ---
  function simpleHash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  async function registerUser({ username, email, password }) {
    if (!username || !password) throw new Error('username and password required');
    const usersDb = getUsersDB();
    if (!usersDb) throw new Error('Users DB not available');

    const id = `user:${username.toLowerCase()}`;
    try {
      const existing = await usersDb.get(id).catch(() => null);
      if (existing) throw new Error('User already exists');

      const doc = {
        _id: id,
        username,
        email: email || '',
        passwordHash: simpleHash(password),
        createdAt: new Date().toISOString()
      };

      await usersDb.put(doc);

      // Attempt an immediate one-shot push replication to remote users DB (if configured)
      try {
        let remoteUsersUrl = null;
        const cfg = window.__CONFIG__ || {};
        if (typeof window.__USERS_COUCH__ === 'string' && window.__USERS_COUCH__.trim()) {
          remoteUsersUrl = window.__USERS_COUCH__.trim();
        } else if (cfg.couchHost) {
          remoteUsersUrl = `https://${cfg.couchHost}/finance-users`;
        }

        if (remoteUsersUrl) {
          // parse credentials from URL if present
          const remoteOpts = {};
          try {
            const parsed = new URL(remoteUsersUrl);
            if (parsed.username || parsed.password) {
              remoteOpts.auth = {
                username: decodeURIComponent(parsed.username || ''),
                password: decodeURIComponent(parsed.password || '')
              };
              parsed.username = '';
              parsed.password = '';
              remoteUsersUrl = parsed.toString();
            }
          } catch (e) {
            // ignore
          }
          if (!remoteOpts.auth && cfg.couchAuth && cfg.couchAuth.username && cfg.couchAuth.password) {
            remoteOpts.auth = { username: cfg.couchAuth.username, password: cfg.couchAuth.password };
          }

          await replicateToRemoteWithRetries(usersDb, remoteUsersUrl, remoteOpts, 4).catch(e => {
            console.warn('registerUser replicateToRemoteWithRetries failed', e);
          });
        } else {
          console.debug('registerUser: no remoteUsersUrl configured; skipping replicate.to');
        }
      } catch (repErr) {
        console.warn('User replicate.to failed', repErr);
      }

      return { ok: true, id: doc._id };
    } catch (err) {
      throw err;
    }
  }

  async function loginUser({ usernameOrEmail, password }) {
    const usersDb = getUsersDB();
    if (!usersDb) throw new Error('Users DB not available');
    const pwHash = simpleHash(password || '');
    try {
      // Before attempting local lookup, try to pull latest from remote to ensure mobile has latest user docs
      try {
        let remoteUsersUrl = null;
        const cfg = window.__CONFIG__ || {};
        if (typeof window.__USERS_COUCH__ === 'string' && window.__USERS_COUCH__.trim()) {
          remoteUsersUrl = window.__USERS_COUCH__.trim();
        } else if (cfg.couchHost) {
          remoteUsersUrl = `https://${cfg.couchHost}/finance-users`;
        }

        if (remoteUsersUrl) {
          const remoteOpts = {};
          try {
            const parsed = new URL(remoteUsersUrl);
            if (parsed.username || parsed.password) {
              remoteOpts.auth = {
                username: decodeURIComponent(parsed.username || ''),
                password: decodeURIComponent(parsed.password || '')
              };
              parsed.username = '';
              parsed.password = '';
              remoteUsersUrl = parsed.toString();
            }
          } catch (e) {
            // ignore
          }
          if (!remoteOpts.auth && cfg.couchAuth && cfg.couchAuth.username && cfg.couchAuth.password) {
            remoteOpts.auth = { username: cfg.couchAuth.username, password: cfg.couchAuth.password };
          }

          // Attempt a one-shot pull to get latest user docs before lookup
          try {
            await replicateFromRemoteWithRetries(usersDb, remoteUsersUrl, remoteOpts, 2).catch(() => null);
          } catch (e) {
            // ignore replicate errors; we'll still attempt local lookup
            console.debug('loginUser: replicateFromRemoteWithRetries failed or skipped', e);
          }
        }
      } catch (e) {
        console.debug('loginUser: pre-lookup replicate attempt failed', e);
      }

      let doc = null;

      if (usernameOrEmail && usernameOrEmail.includes('@')) {
        if (typeof usersDb.find === 'function') {
          try {
            const res = await usersDb.find({ selector: { email: usernameOrEmail } }).catch(() => null);
            if (res && res.docs && res.docs.length) doc = res.docs[0];
          } catch (e) {
            // ignore and fallback
          }
        }
        if (!doc) {
          const all = await usersDb.allDocs({ include_docs: true });
          doc = all.rows.map(r => r.doc).find(d => d.email === usernameOrEmail) || null;
        }
      } else {
        const id = `user:${(usernameOrEmail || '').toLowerCase()}`;
        doc = await usersDb.get(id).catch(() => null);
      }

      if (!doc) throw new Error('User not found');
      if (doc.passwordHash !== pwHash) throw new Error('Invalid credentials');

      const user = { username: doc.username, email: doc.email, id: doc._id };
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      window.__CURRENT_USER__ = user;
      return user;
    } catch (err) {
      throw err;
    }
  }

  function logoutUser() {
    localStorage.removeItem(USER_KEY);
    window.__CURRENT_USER__ = null;
    return true;
  }

  function getCurrentUser() {
    if (window.__CURRENT_USER__) return window.__CURRENT_USER__;
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      window.__CURRENT_USER__ = parsed;
      return parsed;
    } catch {
      return null;
    }
  }

  // Expose auth helpers globally
  window.registerUser = registerUser;
  window.loginUser = loginUser;
  window.logoutUser = logoutUser;
  window.getCurrentUser = getCurrentUser;
  window.simpleHash = simpleHash;

  // --- Helper to build API URL robustly (avoids absolute root 404 on GitHub Pages) ---
  function buildApiUrl(endpoint = 'entries') {
    const apiBase = typeof window.__API_BASE__ === 'string' ? window.__API_BASE__ : '';
    if (!apiBase) {
      return `${endpoint}`;
    }
    const base = apiBase.replace(/\/$/, '');
    if (/^https?:\/\//i.test(base) || base.startsWith('/')) {
      return `${base}/${endpoint}`.replace(/([^:]\/)\/{2,}/g, '$1/');
    }
    return `${base}/${endpoint}`.replace(/([^:]\/)\/{2,}/g, '$1/');
  }

  // --- Remote fetch helper (FastAPI) ---
  async function fetchRemoteEntries() {
    const apiUrl = buildApiUrl('entries');
    try {
      const response = await fetch(apiUrl, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`API request failed: ${response.status}`);
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn('fetchRemoteEntries failed', err);
      throw err;
    }
  }

  // --- Local (PouchDB) fetch helper ---
  async function fetchLocalEntries() {
    if (!db || typeof db.allDocs !== 'function') return [];
    try {
      const result = await db.allDocs({ include_docs: true });
      return result.rows.map(r => r.doc).filter(Boolean);
    } catch (err) {
      console.warn('fetchLocalEntries failed', err);
      return [];
    }
  }

  // --- Unified fetchEntries: prefer existing db.js implementation, then remote, then local, then cache ---
  async function fetchEntries() {
    if (typeof window.fetchEntries === 'function' && window.fetchEntries !== fetchEntries) {
      try {
        const entries = await window.fetchEntries();
        if (Array.isArray(entries)) {
          window.__LAST_ENTRIES__ = entries;
          persistEntries(entries);
        }
        return Array.isArray(entries) ? entries : [];
      } catch (err) {
        console.warn('Existing window.fetchEntries failed, falling back to internal logic', err);
      }
    }

    const apiBaseConfigured = typeof window.__API_BASE__ === 'string' && window.__API_BASE__.trim() !== '';
    if (apiBaseConfigured) {
      try {
        const remote = await fetchRemoteEntries();
        if (remote && remote.length) {
          window.__LAST_ENTRIES__ = remote;
          persistEntries(remote);
          if (db && typeof db.bulkDocs === 'function') {
            try {
              const docs = remote.map(e => Object.assign({}, e, { _id: e._id || `entry:${e.type || 'txn'}:${e.date || Date.now()}:${Math.random().toString(36).slice(2,9)}` }));
              db.bulkDocs(docs).catch(() => null);
            } catch (syncErr) {
              console.warn('PouchDB bulkDocs sync failed', syncErr);
            }
          }
          return remote;
        }
      } catch (err) {
        console.warn('Remote fetch failed, will try local sources', err);
      }
    }

    if (db && typeof db.allDocs === 'function') {
      const local = await fetchLocalEntries();
      if (local && local.length) {
        window.__LAST_ENTRIES__ = local;
        persistEntries(local);
        return local;
      }
    }

    const cached = readStoredEntries();
    if (cached && cached.length) {
      window.__LAST_ENTRIES__ = cached;
      return cached;
    }

    return [];
  }

  // --- Save to local PouchDB (used when remote save fails) ---
  async function saveLocalEntry(doc) {
    if (!db || typeof db.put !== 'function') {
      throw new Error('PouchDB is not ready yet');
    }

    try {
      const existing = await db.get(doc._id).catch(() => null);
      if (existing) doc._rev = existing._rev;
      await db.put(doc);
      return doc;
    } catch (err) {
      if (err && err.name === 'conflict') {
        const existing = await db.get(doc._id);
        doc._rev = existing._rev;
        await db.put(doc);
        return doc;
      }
      console.error('saveLocalEntry error', err);
      throw err;
    }
  }

  // --- Unified addEntry: prefer PouchDB (db.js) if available, otherwise remote API, then local fallback ---
  async function addEntry(entry) {
    if (typeof window.addEntry === 'function' && window.addEntry !== addEntry) {
      try {
        const saved = await window.addEntry(entry);
        const existing = Array.isArray(window.__LAST_ENTRIES__) ? [...window.__LAST_ENTRIES__] : [];
        window.__LAST_ENTRIES__ = [saved, ...existing];
        persistEntries(window.__LAST_ENTRIES__);
        return saved;
      } catch (err) {
        console.warn('Existing window.addEntry failed, falling back to internal addEntry', err);
      }
    }

    const apiBaseConfigured = typeof window.__API_BASE__ === 'string' && window.__API_BASE__.trim() !== '';
    const id = entry._id || `entry:${entry.type || 'txn'}:${entry.date || Date.now()}:${Math.random().toString(36).slice(2,9)}`;
    const doc = Object.assign({}, entry, { _id: id });

    if (db && typeof db.put === 'function') {
      try {
        const savedLocal = await saveLocalEntry(doc);
        const existing = Array.isArray(window.__LAST_ENTRIES__) ? [...window.__LAST_ENTRIES__] : [];
        window.__LAST_ENTRIES__ = [savedLocal, ...existing];
        persistEntries(window.__LAST_ENTRIES__);
        return savedLocal;
      } catch (err) {
        console.warn('PouchDB save failed, will try remote API', err);
      }
    }

    if (apiBaseConfigured) {
      const apiUrl = buildApiUrl('entries');
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(doc)
        });
        if (!response.ok) throw new Error(`API save failed: ${response.status}`);
        const saved = await response.json();
        const existing = Array.isArray(window.__LAST_ENTRIES__) ? [...window.__LAST_ENTRIES__] : [];
        window.__LAST_ENTRIES__ = [saved, ...existing];
        persistEntries(window.__LAST_ENTRIES__);
        if (db && typeof db.put === 'function') {
          saveLocalEntry(saved).catch(() => null);
        }
        return saved;
      } catch (err) {
        console.warn('Remote save failed, falling back to localStorage', err);
      }
    }

    try {
      const savedLocal = await saveLocalEntry(doc);
      const existing = Array.isArray(window.__LAST_ENTRIES__) ? [...window.__LAST_ENTRIES__] : [];
      window.__LAST_ENTRIES__ = [savedLocal, ...existing];
      persistEntries(window.__LAST_ENTRIES__);
      return savedLocal;
    } catch (err) {
      const existing = Array.isArray(window.__LAST_ENTRIES__) ? [...window.__LAST_ENTRIES__] : [];
      window.__LAST_ENTRIES__ = [doc, ...existing];
      persistEntries(window.__LAST_ENTRIES__);
      return doc;
    }
  }

  // --- Expose helpers only if not already provided by db.js ---
  if (!window.fetchEntries) {
    window.fetchEntries = fetchEntries;
  }
  if (!window.addEntry) {
    window.addEntry = addEntry;
  }
  window.isInvestmentEntry = isInvestmentEntry;
  window.formatCurrency = formatCurrency;

  // --- Summary cards (balance/savings/expenses) ---
  function getExpenseTotals(entries = []) {
    const isBalanceEntry = (e) => {
      const type = normalizeEntryType(e);
      const cat = String(e.category || '').toLowerCase();
      const notes = String(e.notes || '').toLowerCase();
      return type === 'balance' || type === 'income' || cat.includes('balance') || notes.includes('total balance') || notes.includes('monthly total');
    };

    const isExpenseEntry = (e) => {
      const type = normalizeEntryType(e);
      const cat = String(e.category || '').toLowerCase();
      const notes = String(e.notes || '').toLowerCase();
      return type === 'expense' || type === 'trip' || cat.includes('expense') || notes.includes('expense') || notes.includes('monthly expense');
    };

    const balanceEntries = entries.filter(isBalanceEntry);
    const currentMonthExpenseEntries = entries.filter(e => isExpenseEntry(e) && isCurrentMonthEntry(e.date));

    // Same bank-aware netting as the Expense page: entries with no bank tag
    // default to ICICI, so old (pre-bank-field) data keeps working unchanged.
    const bankOf = (e) => e.bank || 'ICICI';
    const netForBank = (bankName) => {
      const bal = balanceEntries.filter(e => bankOf(e) === bankName).reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const exp = currentMonthExpenseEntries.filter(e => bankOf(e) === bankName).reduce((s, e) => s + Math.abs(Number(e.amount) || 0), 0);
      return bal - exp;
    };

    const iciciNet = netForBank('ICICI');
    const sbiNet = netForBank('SBI');
    const bobNet = netForBank('Bank of Baroda');

    const totalExpense = currentMonthExpenseEntries.reduce((s, e) => s + Math.abs(Number(e.amount) || 0), 0);

    return {
      // Home "Balance" card: all three banks, net of each bank's expenses.
      totalBalance: iciciNet + sbiNet + bobNet,
      totalExpense,
      // Home "Savings" card: SBI + Bank of Baroda, net of their own expenses.
      totalSaving: sbiNet + bobNet,
      iciciNet,
      sbiNet,
      bobNet,
    };
  }

  function getInvestmentTotals(entries = []) {
    const investmentEntries = entries.filter(isInvestmentEntry);
    const totals = { mutualFund: 0, lic: 0, ppf: 0, sukanya: 0 };
    investmentEntries.forEach(e => {
      const cat = String(e.category || '').toLowerCase();
      const amt = Number(e.amount) || 0;
      if (cat.includes('mutual')) totals.mutualFund += amt;
      else if (cat.includes('lic')) totals.lic += amt;
      else if (cat.includes('ppf')) totals.ppf += amt;
      else if (cat.includes('sukanya')) totals.sukanya += amt;
    });
    return { total: Object.values(totals).reduce((a,b)=>a+b,0), byCategory: totals };
  }

  async function loadFinancialStats(optionalEntries) {
    try {
      const entries = Array.isArray(optionalEntries)
        ? optionalEntries
        : (Array.isArray(window.__LAST_ENTRIES__) ? window.__LAST_ENTRIES__ : await fetchEntries());

      const balanceEl = getElementByAnyId('totalBalance');
      const savingsEl = getElementByAnyId('savings');
      const expensesEl = getElementByAnyId('expenses');
      const bankEls = {
        ICICI: document.getElementById('homeIciciBalance'),
        SBI: document.getElementById('homeSbiBalance'),
        'Bank of Baroda': document.getElementById('homeBobBalance')
      };

      if (balanceEl) balanceEl.textContent = 'Loading…';
      if (savingsEl) savingsEl.textContent = 'Loading…';
      if (expensesEl) expensesEl.textContent = 'Loading…';

      if (!entries || entries.length === 0) {
        if (balanceEl) balanceEl.textContent = '₹0.00';
        if (savingsEl) savingsEl.textContent = '₹0.00';
        if (expensesEl) expensesEl.textContent = '₹0.00';
        Object.values(bankEls).forEach(el => { if (el) el.textContent = '₹0.00'; });
        return;
      }

      const expenseTotals = getExpenseTotals(entries);
      const investmentTotals = getInvestmentTotals(entries);
      // Savings card = SBI + Bank of Baroda (net of their expenses) PLUS total
      // investments (Mutual Fund + LIC + PPF + Sukanya). This is additive to
      // the bank-balance fix from before — it now also updates automatically
      // whenever an investment entry is added/changed on the Investments page.
      const savingsValue = expenseTotals.totalSaving + investmentTotals.total;

      if (balanceEl) balanceEl.textContent = formatCurrency(expenseTotals.totalBalance);
      if (expensesEl) expensesEl.textContent = formatCurrency(expenseTotals.totalExpense);
      if (savingsEl) savingsEl.textContent = formatCurrency(savingsValue);
      if (bankEls.ICICI) bankEls.ICICI.textContent = formatCurrency(expenseTotals.iciciNet);
      if (bankEls.SBI) bankEls.SBI.textContent = formatCurrency(expenseTotals.sbiNet);
      if (bankEls['Bank of Baroda']) bankEls['Bank of Baroda'].textContent = formatCurrency(expenseTotals.bobNet);

      console.debug('Financial stats updated:', {
        totalBalance: expenseTotals.totalBalance,
        totalExpense: expenseTotals.totalExpense,
        totalSaving: expenseTotals.totalSaving,
        investmentTotal: investmentTotals.total,
      });
    } catch (err) {
      console.error('Error loading financial stats:', err);
      const balanceEl = getElementByAnyId('totalBalance');
      const savingsEl = getElementByAnyId('savings');
      const expensesEl = getElementByAnyId('expenses');
      if (balanceEl) balanceEl.textContent = 'Error';
      if (savingsEl) savingsEl.textContent = 'Error';
      if (expensesEl) expensesEl.textContent = 'Error';
    }
  }

  window.loadFinancialStats = loadFinancialStats;

  // --- Charts and UI helpers (financeChart, recentActivityChart, savingsChart, last transactions) ---
  function buildYearOptions(entries = [], selectEl) {
    if (!selectEl) return;
    const years = new Set();
    (entries || []).forEach(e => {
      const d = new Date(e.date);
      if (!Number.isNaN(d.getFullYear())) years.add(d.getFullYear());
    });
    const arr = Array.from(years).sort((a, b) => b - a);
    if (!arr.length) {
      const now = new Date().getFullYear();
      arr.push(now);
    }
    selectEl.innerHTML = arr.map(y => `<option value="${y}">${y}</option>`).join('');
  }

  const HOME_BANKS = ['ICICI', 'SBI', 'Bank of Baroda'];
  const monthLabels = Array.from({ length: 12 }, (_, i) => new Date(0, i).toLocaleString('en-IN', { month: 'short' }));

  function getMonthlyBankTotals(entries = [], year, month = null) {
    const totals = Object.fromEntries(HOME_BANKS.map(bank => [bank, { balance: 0, expense: 0 }]));
    (entries || []).forEach(entry => {
      const date = new Date(entry.date);
      if (Number.isNaN(date.getTime()) || date.getFullYear() !== Number(year)) return;
      if (month !== null && date.getMonth() !== Number(month)) return;
      const bank = HOME_BANKS.includes(entry.bank) ? entry.bank : 'ICICI';
      const amount = Number(entry.amount) || 0;
      const type = normalizeEntryType(entry);
      if (type === 'balance' || type === 'income') totals[bank].balance += amount;
      if (type === 'expense' || type === 'trip') totals[bank].expense += Math.abs(amount);
    });
    return totals;
  }

  function getMonthlySeries(entries = [], year, bank = null) {
    return Array.from({ length: 12 }, (_, month) => {
      const totals = getMonthlyBankTotals(entries, year, month);
      const banks = Array.isArray(bank) ? bank : (bank ? [bank] : HOME_BANKS);
      return banks.reduce((sum, name) => sum + totals[name].balance - totals[name].expense, 0);
    });
  }

  function destroyChart(name) {
    if (window[name]) {
      try { window[name].destroy(); } catch (e) { /* ignore */ }
    }
  }

  function renderMiniTrend(canvasId, instanceName, entries, year, values, color, label) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return;
    destroyChart(instanceName);
    window[instanceName] = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: monthLabels, datasets: [{ label, data: values, borderColor: color, backgroundColor: `${color}22`, fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        scales: { x: { display: false }, y: { display: false, beginAtZero: true } }
      }
    });
  }

  function updateHomeSummaryCharts(entries = [], year) {
    const totalsByBank = HOME_BANKS.map(bank => getMonthlySeries(entries, year, bank));
    renderMiniTrend('balanceTrendChart', 'balanceTrendChartInstance', entries, year, totalsByBank[0], '#087f5b', 'ICICI');
    const balanceCanvas = document.getElementById('balanceTrendChart');
    if (balanceCanvas && window.balanceTrendChartInstance) {
      window.balanceTrendChartInstance.data.datasets = HOME_BANKS.map((bank, index) => ({
        label: bank, data: totalsByBank[index], borderColor: ['#087f5b', '#2f7fb8', '#c97a2e'][index], backgroundColor: 'transparent', fill: false, tension: 0.35, pointRadius: 0, borderWidth: 2
      }));
      window.balanceTrendChartInstance.update();
    }
    renderMiniTrend('savingsTrendChart', 'savingsTrendChartInstance', entries, year, getMonthlySeries(entries, year, 'Bank of Baroda').map((value, i) => value + getMonthlySeries(entries, year, 'SBI')[i]), '#2f7fb8', 'Savings');
    renderMiniTrend('expenseTrendChart', 'expenseTrendChartInstance', entries, year, Array.from({ length: 12 }, (_, month) => HOME_BANKS.reduce((sum, bank) => sum + getMonthlyBankTotals(entries, year, month)[bank].expense, 0)), '#d1503f', 'Expenses');
  }

  function updateFinanceChartYear(entries = [], year = (new Date()).getFullYear(), month = (new Date()).getMonth()) {
    try {
      const canvas = document.getElementById('financeChart');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const totals = getMonthlyBankTotals(entries, year, month);
      const balanceValues = HOME_BANKS.map(bank => totals[bank].balance);
      const expenseValues = HOME_BANKS.map(bank => totals[bank].expense);
      const values = [...balanceValues, ...expenseValues];
      const labels = HOME_BANKS.map(bank => `${bank} balance`).concat(HOME_BANKS.map(bank => `${bank} expense`));
      const colors = ['#087f5b', '#2f7fb8', '#c97a2e', '#66b89a', '#74aeda', '#e48b49'];
      destroyChart('financeChartInstance');

      window.financeChartInstance = new Chart(ctx, {
        type: 'pie',
        data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: 'var(--surface-raised)', borderWidth: 3 }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: context => `${context.label}: ${formatCurrency(context.raw)}` } } }
        }
      });
      const totalBalance = balanceValues.reduce((sum, value) => sum + value, 0);
      const totalExpense = expenseValues.reduce((sum, value) => sum + value, 0);
      const summary = document.getElementById('financeSummary');
      if (summary) {
        summary.innerHTML = `<div class="stat-total"><span>Total balance</span><strong>${formatCurrency(totalBalance)}</strong></div><div class="stat-total"><span>Total expense</span><strong>${formatCurrency(totalExpense)}</strong></div>${HOME_BANKS.map((bank, index) => `<div class="stat-bank"><span><i style="background:${colors[index]}"></i>${bank}</span><span>${formatCurrency(balanceValues[index])} <small>${totalBalance ? Math.round(balanceValues[index] / totalBalance * 100) : 0}% balance</small><br>${formatCurrency(expenseValues[index])} <small>${totalExpense ? Math.round(expenseValues[index] / totalExpense * 100) : 0}% expense</small></span></div>`).join('')}`;
      }
    } catch (err) {
      console.warn('updateFinanceChartYear failed', err);
    }
  }

  function renderLastTransactionsForDate(entries = [], dateISO = null) {
    const txTable = getElementByAnyId('lastTx');
    if (!txTable) return;

    const targetDate = dateISO ? new Date(dateISO) : new Date();
    if (Number.isNaN(targetDate.getTime())) {
      txTable.innerHTML = '<tr><td colspan="3">Invalid date</td></tr>';
      return;
    }
    const y = targetDate.getFullYear();
    const m = targetDate.getMonth();
    const d = targetDate.getDate();

    const filtered = (entries || []).filter(e => {
      const ed = new Date(e.date);
      if (Number.isNaN(ed.getTime())) return false;
      return ed.getFullYear() === y && ed.getMonth() === m && ed.getDate() === d;
    }).sort((a,b) => new Date(b.date) - new Date(a.date));

    if (!filtered.length) {
      txTable.innerHTML = '<tr><td colspan="3">No transactions</td></tr>';
      return;
    }

    txTable.innerHTML = filtered.map(entry => {
      const amount = Number(entry.amount) || 0;
      const label = entry.category || entry.notes || entry.type || 'Entry';
      const sign = amount < 0 ? '-' : '';
      return `<tr><td>${label}</td><td>${entry.date || ''}</td><td>${sign}${formatCurrency(Math.abs(amount))}</td></tr>`;
    }).join('');
  }

  function updateRecentActivityChart(entries = [], year = (new Date()).getFullYear()) {
    try {
      const canvas = document.getElementById('recentActivityChart');
      const totalEl = document.getElementById('monthlyExpenseTotal');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const expenseByMonth = new Array(12).fill(0);
      (entries || []).forEach(e => {
        const d = new Date(e.date);
        if (Number.isNaN(d.getTime())) return;
        if (d.getFullYear() !== Number(year)) return;
        const t = normalizeEntryType(e);
        if (t === 'expense' || t === 'trip') expenseByMonth[d.getMonth()] += Math.abs(Number(e.amount) || 0);
      });

      const monthLabels = Array.from({length:12}, (_,i) => new Date(0,i).toLocaleString('en-IN',{month:'short'}));
      const totalExpense = expenseByMonth.reduce((a,b)=>a+b,0);
      if (totalEl) totalEl.textContent = `Total monthly expense (year ${year}): ${formatCurrency(totalExpense)}`;

      if (window.recentActivityChartInstance) {
        try { window.recentActivityChartInstance.destroy(); } catch(e){/*ignore*/} 
      }

      window.recentActivityChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: monthLabels,
          datasets: [{
            label: `Monthly Expense ${year}`,
            data: expenseByMonth,
            borderColor: '#e74c3c',
            backgroundColor: 'rgba(231,76,60,0.15)',
            fill: true,
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { y: { beginAtZero: true } }
        }
      });
    } catch (err) {
      console.warn('updateRecentActivityChart failed', err);
    }
  }

  function updateSavingsChart(entries = [], year = (new Date()).getFullYear(), bank = 'All') {
    try {
      const canvas = document.getElementById('savingsChart');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const savingsByMonth = getMonthlySeries(entries, year, bank === 'All' ? ['ICICI', 'Bank of Baroda'] : bank);
      destroyChart('savingsChartInstance');

      window.savingsChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: monthLabels,
          datasets: [{
            label: `${bank === 'All' ? 'ICICI + Bank of Baroda' : bank} savings ${year}`,
            data: savingsByMonth,
            backgroundColor: '#3498db'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { y: { beginAtZero: true } }
        }
      });
    } catch (err) {
      console.warn('updateSavingsChart failed', err);
    }
  }

  // --- Initialize selectors and wire UI ---
  function initSelectorsAndUI(entries = []) {
    const lastTxDateInput = document.getElementById('lastTxDate');
    const activityYearSelector = document.getElementById('activityYear');
    const savingsYearSelector = document.getElementById('savingsYear');
    const savingsBankSelector = document.getElementById('savingsBank');
    const chartPeriodSelector = document.getElementById('chartPeriod');

    const now = new Date();
    const todayISO = now.toISOString().slice(0,10);
    if (lastTxDateInput) {
      lastTxDateInput.value = todayISO;
      lastTxDateInput.max = todayISO;
    }
    if (chartPeriodSelector) chartPeriodSelector.value = todayISO.slice(0, 7);

    const yearsSet = new Set((entries || []).map(e => {
      const d = new Date(e.date);
      return Number.isNaN(d.getFullYear()) ? null : d.getFullYear();
    }).filter(Boolean));
    const years = Array.from(yearsSet).sort((a,b)=>b-a);
    if (!years.length) years.push(now.getFullYear());

    const yearOptionsHtml = years.map(y => `<option value="${y}">${y}</option>`).join('');
    if (activityYearSelector) activityYearSelector.innerHTML = yearOptionsHtml;
    if (savingsYearSelector) savingsYearSelector.innerHTML = yearOptionsHtml;

    if (activityYearSelector && !activityYearSelector.value) activityYearSelector.value = now.getFullYear();
    if (savingsYearSelector && !savingsYearSelector.value) savingsYearSelector.value = now.getFullYear();

    function refreshAll() {
      const dateVal = lastTxDateInput ? lastTxDateInput.value : todayISO;
      renderLastTransactionsForDate(entries, dateVal);

      const actYear = activityYearSelector ? Number(activityYearSelector.value) : now.getFullYear();
      updateRecentActivityChart(entries, actYear);

      const savYear = savingsYearSelector ? Number(savingsYearSelector.value) : now.getFullYear();
      const savingsBank = savingsBankSelector ? savingsBankSelector.value : 'All';
      updateSavingsChart(entries, savYear, savingsBank);

      const period = chartPeriodSelector && chartPeriodSelector.value ? chartPeriodSelector.value : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const [chartYear, chartMonth] = period.split('-').map(Number);
      updateFinanceChartYear(entries, chartYear, chartMonth - 1);
      updateHomeSummaryCharts(entries, chartYear);
    }

    if (lastTxDateInput) lastTxDateInput.addEventListener('change', refreshAll);
    if (activityYearSelector) activityYearSelector.addEventListener('change', refreshAll);
    if (savingsYearSelector) savingsYearSelector.addEventListener('change', refreshAll);
    if (savingsBankSelector) savingsBankSelector.addEventListener('change', refreshAll);
    if (chartPeriodSelector) chartPeriodSelector.addEventListener('change', refreshAll);

    refreshAll();

    const topbarRight = document.getElementById('topbarRight') || getElementByAnyId('topbarRight', 'topbar-right');
    const currentUser = getCurrentUser();
    if (topbarRight && currentUser) {
      const badge = document.createElement('div');
      badge.className = 'user-badge';
      badge.style.display = 'flex';
      badge.style.alignItems = 'center';
      badge.style.gap = '8px';
      badge.innerHTML = `<span class="name" style="font-weight:600;color:#ecf0f1">${currentUser.username}</span><a class="logout-link" href="frontend/pages/logout.html" style="color:#e74c3c;text-decoration:none">Logout</a>`;
      topbarRight.appendChild(badge);
    }
  }

  // --- Run once after window load ---
  window.addEventListener('load', async () => {
    try {
      const requireLogin = (typeof window.__REQUIRE_LOGIN__ === 'boolean') ? window.__REQUIRE_LOGIN__ : true;
      const currentUser = getCurrentUser();
      if (requireLogin && !currentUser) {
        if (!/login\.html$/i.test(window.location.pathname)) {
          const base = (window.location.pathname || '').replace(/\/[^/]*$/, '/');
          window.location.href = base + 'frontend/pages/login.html';
          return;
        }
      }

      const entries = await fetchEntries();
      if (Array.isArray(entries) && entries.length) {
        window.__LAST_ENTRIES__ = entries;
        persistEntries(entries);
      } else {
        window.__LAST_ENTRIES__ = readStoredEntries();
      }
      await loadFinancialStats(window.__LAST_ENTRIES__ || []);
      initSelectorsAndUI(window.__LAST_ENTRIES__ || []);
    } catch (err) {
      console.warn('Initial load failed', err);
      const cached = readStoredEntries();
      window.__LAST_ENTRIES__ = cached;
      await loadFinancialStats(cached);
      initSelectorsAndUI(cached);
    }
  });

  // --- DOMContentLoaded: render a short preview of last transactions ---
  document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    const txTable = getElementByAnyId('lastTx');
    if (!txTable) return;
    const entries = Array.isArray(window.__LAST_ENTRIES__) ? window.__LAST_ENTRIES__ : await fetchEntries().catch(() => []);
    if (!entries || !entries.length) {
      txTable.innerHTML = '<tr><td colspan="3">No transactions</td></tr>';
      return;
    }
    const preview = entries
      .filter(e => ['balance','expense','trip','investment','saving'].includes(normalizeEntryType(e)) || isInvestmentEntry(e))
      .sort((a,b) => new Date(b.date) - new Date(a.date))
      .slice(0, 6)
      .map(entry => {
        const amount = Number(entry.amount) || 0;
        const label = entry.category || entry.notes || entry.type || 'Entry';
        const sign = amount < 0 ? '-' : '';
        return `<tr><td>${label}</td><td>${entry.date || ''}</td><td>${sign}${formatCurrency(Math.abs(amount))}</td></tr>`;
      }).join('');
    txTable.innerHTML = preview;
  });

  // Expose for debugging
  window._app_helpers = {
    getUsersDB,
    replicateToRemoteWithRetries,
    replicateFromRemoteWithRetries,
    saveLocalEntry,
    fetchEntries,
    addEntry
  };

})();
