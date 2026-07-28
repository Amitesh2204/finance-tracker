// PouchDB offline-first logic
const db = new PouchDB('finance');

// --- Direct replication with CouchDB ---
const COUCHDB_URL = 'http://127.0.0.1:5984/finance'; // adjust to your CouchDB URL or Cloudflare tunnel
db.sync(COUCHDB_URL, {
  live: true,
  retry: true
}).on('change', info => {
  console.log('Replication change:', info);
}).on('paused', err => {
  console.log('Replication paused', err || '');
}).on('active', () => {
  console.log('Replication resumed');
}).on('error', err => {
  console.error('Replication error:', err);
});

const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const queryApi = urlParams?.get('api') || urlParams?.get('api_base') || urlParams?.get('API_BASE');
const storedApi = typeof window !== 'undefined' ? window.localStorage.getItem('finance_api_base') : null;

function saveRemoteConfig(apiBase) {
  if (typeof window !== 'undefined') {
    if (apiBase) window.localStorage.setItem('finance_api_base', apiBase);
  }
}
if (queryApi && typeof window !== 'undefined') saveRemoteConfig(queryApi);

const isGitHubPages = currentOrigin.includes('github.io');
const defaultApiBase = isGitHubPages ? null : `${currentOrigin.replace(/\/$/, '')}/`;

const API_BASE = (window.__API_BASE__ || queryApi || storedApi || defaultApiBase || '').replace(/\/?$/, '/');
let refreshInvestmentsCallback = () => {};

console.log('API_BASE=', API_BASE);

function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

function mergeEntries(remoteEntries, localEntries) {
  const merged = {};
  localEntries.forEach(entry => { if (entry._id) merged[entry._id] = entry; });
  remoteEntries.forEach(entry => { if (entry._id) merged[entry._id] = entry; });
  return Object.values(merged).sort((a,b) => new Date(b.date) - new Date(a.date));
}

async function fetchEntries() {
  // With replication, local DB is always kept in sync
  const localEntries = await db.allDocs({include_docs:true}).then(r => r.rows.map(r=>r.doc));
  console.debug("Fetched entries from local DB:", localEntries.map(e => ({id: e._id, rev: e._rev})));
  return localEntries;
}

  try {
    await syncPendingEntries();
    const res = await fetch(`${API_BASE}entries`);
    if (!res.ok) throw new Error('API unavailable');
    const remoteEntries = await res.json();
    // ADD THIS DEBUG LINE
    console.debug("Remote entries received:", remoteEntries.map(e => ({id: e._id, rev: e._rev})));
    console.debug(`Fetched ${remoteEntries.length} remote entries from API`);

    for (const entry of remoteEntries) {
      if (entry._id) {
        console.debug("Attempting to save remote entry:", entry._id, "rev:", entry._rev);
        try { await saveLocalEntry(entry); }
        catch (err) { console.warn('Failed to save remote entry locally', entry._id, err); }
      }
    }

    return mergeEntries(remoteEntries, localEntries);
  } catch (err) {
    console.warn('REST API failed, falling back to local DB', err);
    return localEntries;
  }

async function saveLocalEntry(doc) {
  try {
    if (!doc._rev) {
      const existing = await db.get(doc._id).catch(() => null);
      if (existing) {
        doc._rev = existing._rev;
        console.debug(`Merged remote doc ${doc._id} with local rev ${doc._rev}`);
      }
    }
    console.debug("Saving doc locally:", doc._id, "rev:", doc._rev);
    await db.put(doc);
    console.debug("Saved doc successfully:", doc._id, "rev:", doc._rev);
  } catch (err) {
    if (err.name === 'conflict') {
      const existing = await db.get(doc._id);
      doc._rev = existing._rev;
      await db.put(doc);
      console.debug(`Conflict resolved for ${doc._id} with rev ${doc._rev}`);
    } else {
      console.error(`Error saving doc ${doc._id}`, err);
      throw err;
    }
  }
  return doc;
}

async function addEntry(entry) {
  const id = entry._id || `entry:${entry.type||'txn'}:${entry.date||Date.now()}:${Math.random().toString(36).slice(2,9)}`;
  const doc = Object.assign({}, entry, {_id: id});
  await saveLocalEntry(doc);
  return doc; // replication will push it to CouchDB automatically
}

  if (!isOnline()) return doc;

  try {
    const remoteDoc = await sendEntryToApi(doc);
    const merged = Object.assign({}, doc, remoteDoc, {synced: true});
    await saveLocalEntry(merged);
    return merged;
  } catch (err) {
    console.warn('REST API failed, keeping local copy', err);
    return doc;
  }

// Simple UI bindings and population
document.addEventListener('DOMContentLoaded', async () => {
  window.financeDB = db;
  window.fetchEntries = fetchEntries;
  window.addEntry = addEntry;
  window.syncPendingEntries = syncPendingEntries;

  const txTable = document.getElementById('recentTx');
  if (txTable) {
    const entries = await fetchEntries().catch(()=>[]);
    if (entries && entries.length) {
      txTable.innerHTML = entries.slice(0,6).map(e=>`<tr><td>${e.notes||e.type||'Entry'}</td><td>${e.date}</td><td>${e.amount<0?'-':''}$${Math.abs(e.amount).toFixed(2)}</td></tr>`).join('');
    } else {
      txTable.innerHTML = '<tr><td colspan="3">No transactions</td></tr>';
    }
  }

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
      return `<tr><td>${entry.category || entry.type || 'Investment'}</td><td>${amount}</td><td>${new Date(entry.date).toLocaleString()}</td></tr>`;
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
    await syncPendingEntries();
    loadInvestments();

    investmentForm.addEventListener('submit', async event => {
      event.preventDefault();
      const type = document.getElementById('investmentType').value;
      const amount = parseFloat(document.getElementById('investmentAmount').value);
      if (Number.isNaN(amount) || amount <= 0) return;

      const entry = { type: 'investment', category: type, amount, date: new Date().toISOString(), notes: `Investment: ${type}` };
      const saved = await addEntry(entry);
      loadInvestments();
      investmentForm.reset();
      console.log('Investment saved', saved);
    });
  }


});
