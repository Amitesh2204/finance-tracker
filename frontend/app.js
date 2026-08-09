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

async function fetchEntries() {
  const apiBase = window.__API_BASE__ || '';
  const apiUrl = `${apiBase}/entries`.replace(/([^:]\/)\/{2,}/g, '$1/');

  try {
    const response = await fetch(apiUrl, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`API request failed: ${response.status}`);
    const data = await response.json();
    console.debug('Fetched entries from API:', Array.isArray(data) ? data.length : 0);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('Falling back to local PouchDB:', err);
    if (!db || typeof db.allDocs !== 'function') return [];
    try {
      const localEntries = await db.allDocs({ include_docs: true }).then(r => r.rows.map(r => r.doc));
      console.debug('Fetched entries from local DB:', localEntries.map(e => ({ id: e._id, rev: e._rev })));
      return localEntries;
    } catch (localErr) {
      console.error('Error reading local PouchDB:', localErr);
      return [];
    }
  }
}

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
    return await response.json();
  } catch (err) {
    console.warn('Falling back to local PouchDB save:', err);
    await saveLocalEntry(doc);
    return doc;
  }
}

window.fetchEntries = fetchEntries;
window.addEntry = addEntry;
window.getMutualFundSummary = getMutualFundSummary;
window.isMutualFundEntry = isMutualFundEntry;

// --- Financial Statistics (global function, safe to call from anywhere) ---
/**
 * loadFinancialStats(optionalEntries)
 * If optionalEntries is provided (array), it will be used instead of calling fetchEntries again.
 */
async function loadFinancialStats(optionalEntries) {
  try {
    const entries = Array.isArray(optionalEntries) ? optionalEntries : await fetchEntries();
    if (!entries || entries.length === 0) {
      console.warn('No entries found for financial stats');
      const bEl = document.getElementById('totalBalance');
      const sEl = document.getElementById('savings');
      const eEl = document.getElementById('expenses');
      if (bEl) bEl.textContent = 'No data';
      if (sEl) sEl.textContent = 'No data';
      if (eEl) eEl.textContent = 'No data';
      return;
    }

    // Query DOM elements here to ensure they exist
    const balanceEl = document.getElementById('totalBalance');
    const savingsEl = document.getElementById('savings');
    const expensesEl = document.getElementById('expenses');

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

    // Format values (fallback to simple number if Intl not available)
    const fmt = (v) => {
      try {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v);
      } catch {
        return `₹${v.toFixed(2)}`;
      }
    };

    if (balanceEl) balanceEl.textContent = fmt(totalBalance);
    if (expensesEl) expensesEl.textContent = fmt(totalExpense);
    if (savingsEl) savingsEl.textContent = fmt(totalInvestments);

    console.debug('Financial stats updated:', { totalBalance, totalExpense, totalInvestments });
  } catch (err) {
    console.error('Error loading financial stats:', err);
  }
}

// --- Ensure stats update after window load (entries fetched once here) ---
window.addEventListener('load', async () => {
  try {
    const entries = await fetchEntries();
    if (Array.isArray(entries) && entries.length) {
      window.__LAST_ENTRIES__ = entries;
    }
    // Call stats update with fetched entries to avoid duplicate network calls
    await loadFinancialStats(window.__LAST_ENTRIES__ || []);
  } catch (err) {
    console.warn('Initial entry load failed', err);
    // Still attempt to run stats (will fallback to local DB inside fetchEntries)
    await loadFinancialStats();
  }
});

// --- UI bindings (DOM ready) ---
document.addEventListener('DOMContentLoaded', async () => {
  // Recent transactions table (id: recentTx)
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
    const entries = await fetchEntries().catch(() => []);
    const investments = entries.filter(entry => String(entry.type || '').toLowerCase() === 'investment');
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
      // refresh investments and stats after save
      await loadInvestments();
      await loadFinancialStats();
      investmentForm.reset();
      console.log('Investment saved', saved);
    });
  }
});
