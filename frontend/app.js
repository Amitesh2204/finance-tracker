// --- Use shared PouchDB instance from db.js ---
const db = window.financeDB || null;
const STORAGE_KEY = 'finance-tracker:last-entries';

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

function normalizeEntryType(entry) {
  return String(entry?.type || '').trim().toLowerCase();
}

function formatCurrency(amount) {
  const val = Number(amount) || 0;
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val);
  } catch {
    return `₹${val.toFixed(2)}`;
  }
}

function persistEntries(entries) {
  try {
    if (Array.isArray(entries)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    }
  } catch (err) {
    console.warn('Unable to cache finance entries locally:', err);
  }
}

function readStoredEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Unable to read cached finance entries:', err);
    return [];
  }
}

function getExpenseTotals(entries = []) {
  const balanceEntries = entries.filter(e => normalizeEntryType(e) === 'balance');
  const expenseEntries = entries.filter(e => ['expense', 'trip'].includes(normalizeEntryType(e)));

  const totalBalance = balanceEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const totalExpense = expenseEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  return {
    totalBalance,
    totalExpense,
    totalSaving: totalBalance - totalExpense,
  };
}

function getInvestmentTotals(entries = []) {
  const investmentEntries = entries.filter(e => normalizeEntryType(e) === 'investment');
  const totals = {
    mutualFund: 0,
    lic: 0,
    ppf: 0,
    sukanya: 0,
  };

  investmentEntries.forEach(e => {
    const cat = String(e.category || '').trim().toLowerCase();
    const amount = Number(e.amount) || 0;

    if (cat.includes('mutual')) totals.mutualFund += amount;
    else if (cat.includes('lic')) totals.lic += amount;
    else if (cat.includes('ppf')) totals.ppf += amount;
    else if (cat.includes('sukanya')) totals.sukanya += amount;
  });

  return {
    total: Object.values(totals).reduce((sum, value) => sum + value, 0),
    byCategory: totals,
  };
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
    const docs = entries.map(e => {
      const doc = Object.assign({}, e);
      if (!doc._id) {
        doc._id = `entry:${doc.type || 'txn'}:${doc.date || Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
      }
      return doc;
    });

    await db.bulkDocs(docs).catch(err => {
      if (err && err.status === 409) {
        return;
      }
      return Promise.all(docs.map(async d => {
        try {
          const existing = await db.get(d._id).catch(() => null);
          if (existing) d._rev = existing._rev;
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

// --- Fetch entries (remote first, fallback to local PouchDB and persisted cache) ---
async function fetchEntries() {
  const apiBase = window.__API_BASE__ || '';
  const apiUrl = `${apiBase}/entries`.replace(/([^:]\/)\/{2,}/g, '$1/');

  try {
    const response = await fetch(apiUrl, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`API request failed: ${response.status}`);
    const data = await response.json();
    const entries = Array.isArray(data) ? data : [];

    if (entries.length) {
      persistEntries(entries);
      window.__LAST_ENTRIES__ = entries;
      syncEntriesToLocal(entries).catch(err => console.warn('syncEntriesToLocal error', err));
    }
    return entries;
  } catch (err) {
    let entries = [];

    if (db && typeof db.allDocs === 'function') {
      try {
        entries = await db.allDocs({ include_docs: true }).then(r => r.rows.map(r => r.doc).filter(Boolean));
      } catch (localErr) {
        console.warn('Error reading local PouchDB:', localErr);
      }
    }

    if (!entries.length) {
      entries = readStoredEntries();
    }

    if (entries.length) {
      persistEntries(entries);
      window.__LAST_ENTRIES__ = entries;
    }

    return entries;
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
      }
    }
    await db.put(doc);
  } catch (err) {
    if (err && err.name === 'conflict') {
      const existing = await db.get(doc._id);
      doc._rev = existing._rev;
      await db.put(doc);
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
  const id = entry._id || `entry:${entry.type || 'txn'}:${entry.date || Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
  const doc = Object.assign({}, entry, { _id: id });

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
      saveLocalEntry(saved).catch(err => console.warn('saveLocalEntry after remote save failed', err));
    }
    return saved;
  } catch (err) {
    const savedLocal = await saveLocalEntry(doc);
    const existing = Array.isArray(window.__LAST_ENTRIES__) ? [...window.__LAST_ENTRIES__] : [];
    window.__LAST_ENTRIES__ = [savedLocal, ...existing];
    persistEntries(window.__LAST_ENTRIES__);
    return savedLocal;
  }
}

// expose for debugging / other modules
window.fetchEntries = fetchEntries;
window.addEntry = addEntry;
window.getMutualFundSummary = getMutualFundSummary;
window.isMutualFundEntry = isMutualFundEntry;
window.formatCurrency = formatCurrency;
window.getExpenseTotals = getExpenseTotals;
window.getInvestmentTotals = getInvestmentTotals;

// --- Financial Statistics (global function) ---
async function loadFinancialStats(optionalEntries) {
  try {
    const entries = Array.isArray(optionalEntries)
      ? optionalEntries
      : (Array.isArray(window.__LAST_ENTRIES__) ? window.__LAST_ENTRIES__ : await fetchEntries());

    const balanceEl = getElementByAnyId('totalBalance', 'balanceValue');
    const savingsEl = getElementByAnyId('savings', 'savingsValue');
    const expensesEl = getElementByAnyId('expenses', 'expensesValue');

    if (balanceEl) balanceEl.textContent = 'Loading…';
    if (savingsEl) savingsEl.textContent = 'Loading…';
    if (expensesEl) expensesEl.textContent = 'Loading…';

    if (!entries || entries.length === 0) {
      if (balanceEl) balanceEl.textContent = '₹0.00';
      if (savingsEl) savingsEl.textContent = '₹0.00';
      if (expensesEl) expensesEl.textContent = '₹0.00';
      return;
    }

    const expenseTotals = getExpenseTotals(entries);
    const investmentTotals = getInvestmentTotals(entries);
    const fallbackSavings = expenseTotals.totalSaving || 0;
    const savingsValue = investmentTotals.total > 0 ? investmentTotals.total : fallbackSavings;

    if (balanceEl) balanceEl.textContent = formatCurrency(expenseTotals.totalBalance);
    if (expensesEl) expensesEl.textContent = formatCurrency(expenseTotals.totalExpense);
    if (savingsEl) savingsEl.textContent = formatCurrency(savingsValue);

    console.debug('Financial stats updated:', {
      totalBalance: expenseTotals.totalBalance,
      totalExpense: expenseTotals.totalExpense,
      totalSaving: expenseTotals.totalSaving,
      investmentTotal: investmentTotals.total,
    });
  } catch (err) {
    console.error('Error loading financial stats:', err);
    const balanceEl = getElementByAnyId('totalBalance', 'balanceValue');
    const savingsEl = getElementByAnyId('savings', 'savingsValue');
    const expensesEl = getElementByAnyId('expenses', 'expensesValue');
    if (balanceEl) balanceEl.textContent = 'Error';
    if (savingsEl) savingsEl.textContent = 'Error';
    if (expensesEl) expensesEl.textContent = 'Error';
  }
}

window.addEventListener('load', async () => {
  try {
    const entries = await fetchEntries();
    if (Array.isArray(entries) && entries.length) {
      window.__LAST_ENTRIES__ = entries;
      persistEntries(entries);
    } else {
      window.__LAST_ENTRIES__ = readStoredEntries();
    }
    await loadFinancialStats(window.__LAST_ENTRIES__ || []);
  } catch (err) {
    console.warn('Initial entry load failed', err);
    await loadFinancialStats(readStoredEntries());
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  const txTable = getElementByAnyId('recentTx', 'lastTx');
  if (txTable) {
    const entries = Array.isArray(window.__LAST_ENTRIES__) ? [...window.__LAST_ENTRIES__] : await fetchEntries().catch(() => []);

    if (entries && entries.length) {
      const validEntries = entries
        .filter(entry => ['balance', 'expense', 'trip', 'investment'].includes(normalizeEntryType(entry)))
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
        .slice(0, 6);

      txTable.innerHTML = validEntries.map(entry => {
        const amount = Number(entry.amount) || 0;
        const label = entry.notes || entry.category || entry.type || 'Entry';
        const sign = amount < 0 ? '-' : '';
        return `<tr><td>${label}</td><td>${entry.date || ''}</td><td>${sign}${formatCurrency(Math.abs(amount))}</td></tr>`;
      }).join('');
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
    const entries = Array.isArray(window.__LAST_ENTRIES__) ? [...window.__LAST_ENTRIES__] : await fetchEntries().catch(() => []);
    const investments = entries.filter(entry => String(entry.type || '').toLowerCase() === 'investment');
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
      await loadInvestments();
      await loadFinancialStats(window.__LAST_ENTRIES__ || []);
      investmentForm.reset();
      console.log('Investment saved', saved);
    });
  }
});
