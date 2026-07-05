// PouchDB offline-first logic (optional)
const db = new PouchDB('finance');

// Backend API base (FastAPI)
const API_BASE = window.__API_BASE__ || '/';

async function fetchEntries() {
  try {
    const res = await fetch(`${API_BASE}entries`);
    if (!res.ok) throw new Error('API unavailable');
    return await res.json();
  } catch (err) {
    console.warn('REST API failed, falling back to local DB', err);
    return db.allDocs({include_docs:true}).then(r => r.rows.map(r=>r.doc));
  }
}

async function addEntry(entry) {
  // Try REST API first
  try {
    const res = await fetch(`${API_BASE}entries`, {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(entry)
    });
    if (!res.ok) throw new Error('API returned ' + res.status);
    return await res.json();
  } catch (err) {
    // Fallback to local PouchDB
    const id = entry._id || `entry:${entry.type||'txn'}:${entry.date||Date.now()}:${Math.random().toString(36).slice(2,9)}`;
    const doc = Object.assign({}, entry, {_id: id});
    return db.put(doc).then(()=>doc);
  }
}

function initSyncToCouch(remote) {
  if (!remote) return;
  db.sync(remote, { live: true, retry: true })
    .on('change', info => console.log('sync change', info))
    .on('paused', err => console.log('sync paused', err))
    .on('active', () => console.log('sync active'))
    .on('denied', err => console.error('sync denied', err))
    .on('complete', info => console.log('sync complete', info))
    .on('error', err => console.error('sync error', err));
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
  const remoteCouch = window.__REMOTE_COUCH__ || null; // e.g. set via HTML or deployment config
  initSyncToCouch(remoteCouch);
});
