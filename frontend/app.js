// --- Use shared PouchDB instance from db.js ---
const db = window.financeDB || null;

// --- Utility functions ---
function isMutualFundEntry(entry) {
  if (!entry || entry?.type !== 'investment') {
    return false;
  }

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

    if (isProfit) {
      summary.growth += amount;
    } else {
      summary.invested += amount;
    }

    const date = new Date(entry?.date);
    if (Number.isNaN(date.getTime())) {
      return;
    }

    const year = date.getFullYear();
    if (!summary.byYear[year]) {
      summary.byYear[year] = { invested: 0, growth: 0, combined: 0 };
    }

    if (isProfit) {
      summary.byYear[year].growth += amount;
    } else {
      summary.byYear[year].invested += amount;
    }

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
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }
    const data = await response.json();
    console.debug('Fetched entries from API:', data.length);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('Falling back to local PouchDB:', err);
    if (!db || typeof db.allDocs !== 'function') {
      return [];
    }

    const localEntries = await db.allDocs({ include_docs: true })
      .then(r => r.rows.map(r => r.doc));
    console.debug('Fetched entries from local DB:', localEntries.map(e => ({ id: e._id, rev: e._rev })));
    return localEntries;
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
    if (!response.ok) {
      throw new Error(`API save failed: ${response.status}`);
    }
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

window.addEventListener('load', async () => {
  try {
    const entries = await fetchEntries();
    if (Array.isArray(entries) && entries.length) {
      window.__LAST_ENTRIES__ = entries;
    }
  } catch (err) {
    console.warn('Initial entry load failed', err);
  }
});

// --- UI bindings ---
document.addEventListener('DOMContentLoaded', async () => {

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
   // --- Financial Statistics summary cards ---
  const balanceEl = document.getElementById('totalBalance');
  const savingsEl = document.getElementById('savings');
  const expensesEl = document.getElementById('expenses');

async function loadFinancialStats() {
  try {
    const entries = await fetchEntries();
    if (!entries || entries.length === 0) {
      console.warn("No entries found for financial stats");
      return;
    }

    // Expense totals
    const balanceEntries = entries.filter(e => String(e.type || '').toLowerCase() === 'balance');
    const expenseEntries = entries.filter(e => {
      const type = String(e.type || '').toLowerCase();
      return type === 'expense' || type === 'trip';
    });

    const totalBalance = balanceEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const totalExpense = expenseEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const totalSaving = Math.max(totalBalance - totalExpense, 0); // prevent negative values

    // Investment totals (Mutual Fund + LIC + PPF + Sukanya Yojana)
    const investmentEntries = entries.filter(e => String(e.type || '').toLowerCase() === 'investment');
    const relevantInvestments = investmentEntries.filter(e => {
      const cat = String(e.category || '').toLowerCase();
      return cat.includes('mutual') || cat.includes('lic') || cat.includes('ppf') || cat.includes('sukanya');
    });
    const totalInvestments = relevantInvestments.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    // Update UI
    if (balanceEl) balanceEl.textContent = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(totalBalance);
    if (expensesEl) expensesEl.textContent = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(totalExpense);
    if (savingsEl) savingsEl.textContent = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(totalInvestments);

    console.debug("Financial stats updated:", { totalBalance, totalExpense, totalSaving, totalInvestments });
  } catch (err) {
    console.error("Error loading financial stats:", err);
  }
}

  loadFinancialStats();

});
