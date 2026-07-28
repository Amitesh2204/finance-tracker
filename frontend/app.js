// --- Direct replication with CouchDB ---
const db = new PouchDB('finance');

// Use Cloudflare tunnel or CouchDB URL
const COUCHDB_URL = 'https://my-finance-tracker.duckdns.org/finance';

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

// --- Utility functions ---
async function fetchEntries() {
  const localEntries = await db.allDocs({ include_docs: true })
    .then(r => r.rows.map(r => r.doc));
  console.debug("Fetched entries from local DB:", localEntries.map(e => ({ id: e._id, rev: e._rev })));
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
    await db.put(doc);
    console.debug("Saved doc successfully:", doc._id);
  } catch (err) {
    if (err.name === 'conflict') {
      const existing = await db.get(doc._id);
      doc._rev = existing._rev;
      await db.put(doc);
      console.debug(`Conflict resolved for ${doc._id}`);
    } else {
      console.error(`Error saving doc ${doc._id}`, err);
      throw err;
    }
  }
  return doc;
}

async function addEntry(entry) {
  const id = entry._id || `entry:${entry.type || 'txn'}:${entry.date || Date.now()}:${Math.random().toString(36).slice(2,9)}`;
  const doc = Object.assign({}, entry, { _id: id });
  await saveLocalEntry(doc);
  return doc; // replication will push it to CouchDB automatically
}

// --- UI bindings ---
document.addEventListener('DOMContentLoaded', async () => {
  window.financeDB = db;
  window.fetchEntries = fetchEntries;
  window.addEntry = addEntry;

  const txTable = document.getElementById('recentTx');
  if (txTable) {
    const entries = await fetchEntries().catch(() => []);
    if (entries && entries.length) {
      txTable.innerHTML = entries.slice(0, 6).map(e =>
        `<tr><td>${e.notes || e.type || 'Entry'}</td><td>${e.date}</td><td>${e.amount < 0 ? '-' : ''}$${Math.abs(e.amount).toFixed(2)}</td></tr>`
      ).join('');
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
