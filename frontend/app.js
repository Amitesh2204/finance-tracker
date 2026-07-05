// PouchDB offline-first logic (optional)
const db = new PouchDB('finance');

// Backend API base (FastAPI)
const API_BASE = window.__API_BASE__ || '/';
const REMOTE_COUCH = window.__REMOTE_COUCH__ || null;

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

async function addEntry(entry) {
  const id = entry._id || `entry:${entry.type||'txn'}:${entry.date||Date.now()}:${Math.random().toString(36).slice(2,9)}`;
  const doc = Object.assign({}, entry, {_id: id});

  // Save locally first so the entry appears immediately.
  await saveLocalEntry(doc);

  if (!isOnline()) {
    return doc;
  }

  try {
    const res = await fetch(`${API_BASE}entries`, {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(doc)
    });
    if (!res.ok) throw new Error('API returned ' + res.status);
    const remoteDoc = await res.json();
    if (remoteDoc._id && remoteDoc._rev) {
      doc._rev = remoteDoc._rev;
      await saveLocalEntry(doc);
    }
    return remoteDoc;
  } catch (err) {
    console.warn('REST API failed, keeping local copy', err);
    return doc;
  }
}

function initSyncToCouch(remote) {
  if (!remote) return null;

  if (!isOnline()) {
    console.log('Offline: remote CouchDB sync will start when online');
    return null;
  }

  const sync = db.sync(remote, { live: true, retry: true })
    .on('change', info => console.log('sync change', info))
    .on('paused', err => console.log('sync paused', err))
    .on('active', () => console.log('sync active'))
    .on('denied', err => console.error('sync denied', err))
    .on('complete', info => console.log('sync complete', info))
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
  const remoteCouch = window.__REMOTE_COUCH__ || null; // e.g. set via HTML or deployment config
  let syncHandler = initSyncToCouch(remoteCouch);

  window.addEventListener('online', () => {
    console.log('Network online: attempting remote CouchDB sync');
    if (!syncHandler) {
      syncHandler = initSyncToCouch(remoteCouch);
    }
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
