// --- Use shared PouchDB instance from db.js ---
const db = window.financeDB || null;

// --- Utility functions ---
function isMutualFundEntry(entry) {
  if (!entry || entry?.type !== 'investment') return false;
  const category = String(entry?.category || '').toLowerCase();
  const notes = String(entry?.notes || '').toLowerCase();
  return category === 'mutual fund' || category.includes('mutual') || notes.includes('mutual fund') || notes.includes('mutual');
}

function getMutualFundSummary(entries = []) {
  const mutualFundEntries = (entries || []).filter(isMutualFundEntry);
  const summary = { invested: 0, growth: 0, combined: 0, byYear: {} };

  mutualFundEntries.forEach(entry => {
    const amount = Number(entry?.amount) || 0;
    const notes = String(entry?.notes || '').toLowerCase();
    const isProfit = entry?.subtype === 'profit' || notes.includes('profit');

    if (isProfit) summary.growth += amount;
    else summary.invested += amount;

    const date = new Date(entry?.date);
    if (Number.isNaN(date.getTime())) return;

    const year = date.getFullYear();
    if (!summary.byYear[year]) summary.byYear[year] = { invested: 0, growth: 0, combined: 0 };

    if (isProfit) summary.byYear[year].growth += amount;
    else summary.byYear[year].invested += amount;

    summary.byYear[year].combined = summary.byYear[year].invested + summary.byYear[year].growth;
  });

  summary.combined = summary.invested + summary.growth;
  return summary;
}

// --- Helper: safe DOM query for multiple possible IDs ---
function getElementByAnyId(...ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

// --- Local sync helper: persist remote entries into local PouchDB for offline persistence ---
async function syncEntriesToLocal(entries = []) {
  if (!db || typeof db.bulkDocs !== 'function') return;
  try {
    // Normalize docs: ensure _id exists and avoid overwriting _rev
    const docs = entries.map(e => {
      const doc = Object.assign({}, e);
      if (!doc._id) {
        // create stable id if not present
        doc._id = doc._id || `entry:${doc.type || 'txn'}:${doc.date || Date.now()}:${Math.random().toString(36).slice(2,9)}`;
      }
      // Remove any transient fields that PouchDB may not accept (optional)
      return doc;
    });

    // Use bulkDocs with new_edits=false to preserve remote _rev if present, but only if _rev exists.
    // If _rev not present, allow new_edits true (default).
    // We'll attempt bulkDocs and ignore conflicts.
    await db.bulkDocs(docs).catch(err => {
      // If conflict or other error, try upserting individually
      if (err && err.status === 409) {
        // ignore; conflicts expected if docs already exist
        return;
      }
      // fallback: upsert each doc
      return Promise.all(docs.map(async d => {
        try {
          const existing = await db.get(d._id).catch(() => null);
          if (existing) {
            d._rev = existing._rev;
          }
          return db.put(d).catch(() => null);
        } catch (e) {
          return null;
        }
      }));
    });
  } catch (err) {
    console.warn('syncEntriesToLocal failed', err);
  }
}

// --- Fetch entries (remote first, fallback to local PouchDB) ---
async function fetchEntries() {
  const apiBase = window.__API_BASE__ || '';
  const apiUrl = `${apiBase}/entries`.replace(/([^:]\/)\/{2,}/g, '$1/');

  try {
    const response = await fetch(apiUrl, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`API request failed: ${response.status}`);
    const data = await response.json();
    const entries = Array.isArray(data) ? data : [];
    console.debug('Fetched entries from API:', entries.length);

    // cache for reuse during this page lifecycle
    if (entries.length) {
      window.__LAST_ENTRIES__ = entries;
      // Persist remote entries into local PouchDB so data remains available after refresh
      // Do this asynchronously but don't block returning entries
      syncEntriesToLocal(entries).catch(err => console.warn('syncEntriesToLocal error', err));
    }
    return entries;
  } catch (err) {
    console.warn('Falling back to local PouchDB:', err);
    if (!db || typeof db.allDocs !== 'function') return [];
    try {
      const localEntries = await db.allDocs({ include_docs: true }).then(r => r.rows.map(r => r.doc));
      console.debug('Fetched entries from local DB:', localEntries.map(e => ({ id: e._id, rev: e._rev })));
      // cache local entries as well
      window.__LAST_ENTRIES__ = localEntries;
      return localEntries;
    } catch (localErr) {
      console.error('Error reading local PouchDB:', localErr);
      return [];
    }
  }
}

// --- Save to local PouchDB (used when remote save fails) ---
async function saveLocalEntry(doc) {
  if (!db || typeof db.get !== 'function' || typeof db.put !== 'function') {
    throw new Error('PouchDB is not ready yet');
  }

  try {
    if (!doc._rev) {
      const existing = await db.get(doc._id).catch(() => null);
      if (existing) {
        doc._rev = existing._rev;
        console.debug(`Merged remote doc ${doc._id} with local rev ${doc._rev}`);
      }
    }
    await db.put(doc);
    console.debug('Saved doc successfully:', doc._id);
  } catch (err) {
    if (err && err.name === 'conflict') {
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

// --- Add entry (try remote, fallback to local) ---
async function addEntry(entry) {
  const apiBase = window.__API_BASE__ || '';
  const apiUrl = `${apiBase}/entries`.replace(/([^:]\/)\/{2,}/g, '$1/');
  const id = entry._id || `entry:${entry.type || 'txn'}:${entry.date || Date.now()}:${Math.random().toString(36).slice(2,9)}`;
  const doc = Object.assign({}, entry, { _id: id });

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(doc)
    });
    if (!response.ok) throw new Error(`API save failed: ${response.status}`);
    const saved = await response.json();
    // update in-memory cache
    window.__LAST_ENTRIES__ = Array.isArray(window.__LAST_ENTRIES__) ? [saved, ...window.__LAST_ENTRIES__] : [saved];
    // persist saved remote entry locally
    if (db && typeof db.put === 'function') {
      saveLocalEntry(saved).catch(err => console.warn('saveLocalEntry after remote save failed', err));
    }
    return saved;
  } catch (err) {
    console.warn('Falling back to local PouchDB save:', err);
    const savedLocal = await saveLocalEntry(doc);
    // update in-memory cache
    window.__LAST_ENTRIES__ = Array.isArray(window.__LAST_ENTRIES__) ? [savedLocal, ...window.__LAST_ENTRIES__] : [savedLocal];
    return savedLocal;
  }
}

// expose for debugging / other modules
window.fetchEntries = fetchEntries;
window.addEntry = addEntry;
window.getMutualFundSummary = getMutualFundSummary;
window.isMutualFundEntry = isMutualFundEntry;

// --- Financial Statistics (global function) ---
// Accepts optionalEntries to avoid duplicate network calls
async function loadFinancialStats(optionalEntries) {
  try {
    const entries = Array.isArray(optionalEntries)
      ? optionalEntries
      : (Array.isArray(window.__LAST_ENTRIES__) ? window.__LAST_ENTRIES__ : await fetchEntries());

    // Query DOM elements here (ensure they exist at call time)
    const balanceEl = getElementByAnyId('totalBalance', 'balanceValue');
    const savingsEl = getElementByAnyId('savings', 'savingsValue');
    const expensesEl = getElementByAnyId('expenses', 'expensesValue');

    // Show loading placeholders if elements exist
    if (balanceEl) balanceEl.textContent = 'Loading…';
    if (savingsEl) savingsEl.textContent = 'Loading…';
    if (expensesEl) expensesEl.textContent = 'Loading…';

    if (!entries || entries.length === 0) {
      console.warn('No entries found for financial stats');
      if (balanceEl) balanceEl.textContent = 'No data';
      if (savingsEl) savingsEl.textContent = 'No data';
      if (expensesEl) expensesEl.textContent = 'No data';
      return;
    }

    // --- Balance (sum of entries with type 'balance') ---
    const balanceEntries = entries.filter(e => String(e.type || '').toLowerCase() === 'balance');
    const totalBalance = balanceEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    // --- Expenses (sum of entries with type 'expense' or 'trip') ---
    const expenseEntries = entries.filter(e => {
      const type = String(e.type || '').toLowerCase();
      return type === 'expense' || type === 'trip';
    });
    const totalExpense = expenseEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    // --- Savings (sum of investment entries for Mutual Fund, LIC, PPF, Sukanya) ---
    const investmentEntries = entries.filter(e => String(e.type || '').toLowerCase() === 'investment');
    const relevantInvestments = investmentEntries.filter(e => {
      const cat = String(e.category || '').toLowerCase();
      return cat.includes('mutual') || cat.includes('lic') || cat.includes('ppf') || cat.includes('sukanya');
    });
    const totalInvestments = relevantInvestments.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    // Format values (Intl with fallback)
    const fmt = (v) => {
      try {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v);
      } catch {
        return `₹${Number(v).toFixed(2)}`;
      }
    };

    if (balanceEl) balanceEl.textContent = fmt(totalBalance);
    if (expensesEl) expensesEl.textContent = fmt(totalExpense);
    if (savingsEl) savingsEl.textContent = fmt(totalInvestments);

    console.debug('Financial stats updated:', { totalBalance, totalExpense, totalInvestments });
  } catch (err) {
    console.error('Error loading financial stats:', err);
    // If DOM elements exist, show an error state
    const balanceEl = getElementByAnyId('totalBalance', 'balanceValue');
    const savingsEl = getElementByAnyId('savings', 'savingsValue');
    const expensesEl = getElementByAnyId('expenses', 'expensesValue');
    if (balanceEl) balanceEl.textContent = 'Error';
    if (savingsEl) savingsEl.textContent = 'Error';
    if (expensesEl) expensesEl.textContent = 'Error';
  }
}

// --- Run once after window load: fetch entries and update stats ---
// This ensures fetchEntries runs early and loadFinancialStats uses cached entries
window.addEventListener('load', async () => {
  try {
    // fetchEntries will populate window.__LAST_ENTRIES__ on success or fallback to local DB
    const entries = await fetchEntries();
    if (Array.isArray(entries) && entries.length) {
      window.__LAST_ENTRIES__ = entries;
    }
    // Use cached entries to avoid duplicate network calls
    await loadFinancialStats(window.__LAST_ENTRIES__ || []);
  } catch (err) {
    console.warn('Initial entry load failed', err);
    // attempt to run stats anyway (fetchEntries inside will fallback)
    await loadFinancialStats();
  }
});

// --- UI bindings (DOMContentLoaded) ---
document.addEventListener('DOMContentLoaded', async () => {
  // Recent transactions table: support both possible IDs (recentTx or lastTx)
  const txTable = getElementByAnyId('recentTx', 'lastTx');
  if (txTable) {
    const entries = Array.isArray(window.__LAST_ENTRIES__) ? window.__LAST_ENTRIES__ : await fetchEntries().catch(() => []);
    if (entries && entries.length) {
      txTable.innerHTML = entries.slice(0, 6).map(e =>
        `<tr><td>${e.notes || e.type || 'Entry'}</td><td>${e.date || ''}</td><td>${(Number(e.amount) < 0 ? '-' : '')}$${Math.abs(Number(e.amount) || 0).toFixed(2)}</td></tr>`
      ).join('');
    } else {
      txTable.innerHTML = '<tr><td colspan="3">No transactions</td></tr>';
    }
  }

  // Investments UI
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
    const entries = Array.isArray(window.__LAST_ENTRIES__) ? window.__LAST_ENTRIES__ : await fetchEntries().catch(() => []);
    const investments = entries.filter(entry => String(entry.type || '').toLowerCase() === 'investment');
    console.log(`Loaded ${investments.length} investments`, investments);
    renderInvestments(investments);
  }

  if (investmentForm) {
    // initial load
    loadInvestments();
    investmentForm.addEventListener('submit', async event => {
      event.preventDefault();
      const type = document.getElementById('investmentType').value;
      const amount = parseFloat(document.getElementById('investmentAmount').value);
      if (Number.isNaN(amount) || amount <= 0) return;

      const entry = { type: 'investment', category: type, amount, date: new Date().toISOString(), notes: `Investment: ${type}` };
      const saved = await addEntry(entry);
      // refresh investments and stats after save using cached entries
      await loadInvestments();
      await loadFinancialStats(window.__LAST_ENTRIES__ || []);
      investmentForm.reset();
      console.log('Investment saved', saved);
    });
  }
});
