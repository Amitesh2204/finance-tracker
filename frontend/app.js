// PouchDB offline-first logic (optional)
const db = new PouchDB('finance');

const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const queryApi = urlParams?.get('api') || urlParams?.get('api_base') || urlParams?.get('API_BASE');
const queryRemote = urlParams?.get('remote') || urlParams?.get('remote_couch') || urlParams?.get('REMOTE_COUCH');

const storedApi = typeof window !== 'undefined' ? window.localStorage.getItem('finance_api_base') : null;
const storedRemote = typeof window !== 'undefined' ? window.localStorage.getItem('finance_remote_couch') : null;

function saveRemoteConfig(apiBase, remoteCouch) {
  if (typeof window !== 'undefined') {
    if (apiBase) window.localStorage.setItem('finance_api_base', apiBase);
    if (remoteCouch) window.localStorage.setItem('finance_remote_couch', remoteCouch);
  }
}

if (queryApi && typeof window !== 'undefined') {
  saveRemoteConfig(queryApi, storedRemote);
}
if (queryRemote && typeof window !== 'undefined') {
  saveRemoteConfig(storedApi, queryRemote);
}

const isGitHubPages = currentOrigin.includes('github.io');
const defaultApiBase = isGitHubPages ? null : `${currentOrigin.replace(/\/$/, '')}/`;
const defaultRemoteCouch = isGitHubPages ? null : `${currentOrigin.replace(/\/$/, '')}/finance`;

// Backend API base (FastAPI)
const API_BASE = window.__API_BASE__ || queryApi || storedApi || defaultApiBase;
const REMOTE_COUCH = window.__REMOTE_COUCH__ || queryRemote || storedRemote || defaultRemoteCouch;
const hasRemoteApi = Boolean(API_BASE);
const hasRemoteCouch = Boolean(REMOTE_COUCH);
let refreshInvestmentsCallback = () => {};

console.log('API_BASE=', API_BASE, 'REMOTE_COUCH=', REMOTE_COUCH, 'hasRemoteApi=', hasRemoteApi, 'hasRemoteCouch=', hasRemoteCouch);

function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

function mergeEntries(remoteEntries, localEntries) {
  const merged = {};
  localEntries.forEach(entry => {
    if (entry._id) merged[entry._id] = entry;
  });
  remoteEntries.forEach(entry => {
    if (entry._id) merged[entry._id] = entry;
  });
  return Object.values(merged).sort((a,b) => new Date(b.date) - new Date(a.date));
}

async function fetchEntries() {
  const localEntries = await db.allDocs({include_docs:true}).then(r => r.rows.map(r=>r.doc));
  if (!isOnline()) {
    return localEntries;
  }

  try {
    await syncPendingEntries();
    const res = await fetch(`${API_BASE}entries`);
    if (!res.ok) throw new Error('API unavailable');
    const remoteEntries = await res.json();
    return mergeEntries(remoteEntries, localEntries);
  } catch (err) {
    console.warn('REST API failed, falling back to local DB', err);
    return localEntries;
  }
}

async function saveLocalEntry(doc) {
  try {
    await db.put(doc);
  } catch (err) {
    if (err.name === 'conflict') {
      const existing = await db.get(doc._id);
      doc._rev = existing._rev;
      await db.put(doc);
    } else {
      throw err;
    }
  }
  return doc;
}

async function sendEntryToApi(doc) {
  const payload = Object.assign({}, doc);
  if (payload._rev === undefined) {
    delete payload._rev;
  }

  const res = await fetch(`${API_BASE}entries`, {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
  });

  if (res.ok) {
    const remoteDoc = await res.json();
    return Object.assign({}, remoteDoc, {synced: true});
  }

  if (res.status === 409 && payload._id) {
    const existing = await fetch(`${API_BASE}entries/${encodeURIComponent(payload._id)}`);
    if (existing.ok) {
      const remoteDoc = await existing.json();
      return Object.assign({}, remoteDoc, {synced: true});
    }
  }

  throw new Error(`API returned ${res.status}`);
}

async function syncPendingEntries() {
  if (!isOnline()) return 0;

  const localEntries = await db.allDocs({include_docs:true}).then(r => r.rows.map(r => r.doc));
  const pending = localEntries.filter(entry => entry.type === 'investment' && entry.synced !== true);
  let syncedCount = 0;

  for (const entry of pending) {
    try {
      const remoteDoc = await sendEntryToApi(entry);
      await saveLocalEntry(Object.assign({}, entry, remoteDoc));
      syncedCount += 1;
      console.log('Synced local entry to backend', remoteDoc._id);
    } catch (err) {
      console.warn('Failed to sync local entry', entry._id, err);
    }
  }

  return syncedCount;
}

async function addEntry(entry) {
  const id = entry._id || `entry:${entry.type||'txn'}:${entry.date||Date.now()}:${Math.random().toString(36).slice(2,9)}`;
  const doc = Object.assign({}, entry, {_id: id, synced: false});

  // Save locally first so the entry appears immediately.
  await saveLocalEntry(doc);

  if (!isOnline()) {
    return doc;
  }

  try {
    const remoteDoc = await sendEntryToApi(doc);
    const merged = Object.assign({}, doc, remoteDoc, {synced: true});
    await saveLocalEntry(merged);
    return merged;
  } catch (err) {
    console.warn('REST API failed, keeping local copy', err);
    return doc;
  }
}

function initSyncToCouch(remote, refreshCallback = () => {}) {
  if (!remote) return null;

  if (!isOnline()) {
    console.log('Offline: remote CouchDB sync will start when online');
    return null;
  }

  const sync = db.sync(remote, { live: true, retry: true })
    .on('change', info => {
      console.log('sync change', info);
      refreshCallback();
    })
    .on('paused', err => {
      if (err) console.warn('sync paused', err);
      else console.log('sync paused (up-to-date)');
    })
    .on('active', () => {
      console.log('sync active');
      refreshCallback();
    })
    .on('denied', err => console.error('sync denied', err))
    .on('complete', info => {
      console.log('sync complete', info);
      refreshCallback();
    })
    .on('error', err => console.error('sync error', err));

  return sync;
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service worker registered', reg.scope))
      .catch(err => console.warn('Service worker registration failed', err));
  });
}

// Simple UI bindings and population
document.addEventListener('DOMContentLoaded', async () => {
  // Expose for debugging
  window.financeDB = db;
  window.fetchEntries = fetchEntries;
  window.addEntry = addEntry;

  // Try to load recent transactions into UI table if present
  const txTable = document.getElementById('recentTx');
  if (txTable) {
    const entries = await fetchEntries().catch(()=>[]);
    if (entries && entries.length) {
      txTable.innerHTML = entries.slice(0,6).map(e=>`<tr><td>${e.notes||e.type||'Entry'}</td><td>${e.date}</td><td>${e.amount<0?'-':''}$${Math.abs(e.amount).toFixed(2)}</td></tr>`).join('');
    } else {
      txTable.innerHTML = '<tr><td colspan="3">No transactions</td></tr>';
    }
  }

  // Optional: initialize sync to a CouchDB remote if configured
  const remoteCouch = REMOTE_COUCH;
  let syncHandler = null;

  window.addEventListener('online', async () => {
    console.log('Network online: attempting remote CouchDB sync');
    if (!syncHandler) {
      syncHandler = initSyncToCouch(remoteCouch, refreshInvestmentsCallback);
    }
    await syncPendingEntries();
    loadInvestments();
  });

  window.addEventListener('offline', () => {
    console.log('Network offline: using local PouchDB only');
  });

  const investmentForm = document.getElementById('investmentForm');
  const investmentTableBody = document.querySelector('#investmentsTable tbody');

  function renderInvestments(entries) {
    if (!investmentTableBody) return;
    if (!entries || entries.length === 0) {
      investmentTableBody.innerHTML = '<tr><td colspan="3">No investments yet</td></tr>';
      return;
    }

    investmentTableBody.innerHTML = entries.map(entry => {
      const amount = typeof entry.amount === 'number' ? entry.amount.toFixed(2) : entry.amount;
      return `
        <tr>
          <td>${entry.category || entry.type || 'Investment'}</td>
          <td>${amount}</td>
          <td>${new Date(entry.date).toLocaleString()}</td>
        </tr>
      `;
    }).join('');
  }

  async function loadInvestments() {
    const entries = await fetchEntries().catch(() => []);
    const investments = entries.filter(entry => entry.type === 'investment');
    console.log(`Loaded ${investments.length} investments`, investments);
    renderInvestments(investments);
  }

  if (investmentForm) {
    refreshInvestmentsCallback = loadInvestments;
    syncHandler = initSyncToCouch(remoteCouch, refreshInvestmentsCallback);
    await syncPendingEntries();
    loadInvestments();

    investmentForm.addEventListener('submit', async event => {
      event.preventDefault();
      const type = document.getElementById('investmentType').value;
      const amount = parseFloat(document.getElementById('investmentAmount').value);
      if (Number.isNaN(amount) || amount <= 0) return;

      const entry = {
        type: 'investment',
        category: type,
        amount,
        date: new Date().toISOString(),
        notes: `Investment: ${type}`
      };

      const saved = await addEntry(entry);
      loadInvestments();
      investmentForm.reset();
      console.log('Investment saved', saved);
    });
  }
});
