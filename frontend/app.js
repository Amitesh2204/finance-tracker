// --- Use shared PouchDB instance from db.js ---
const db = window.financeDB || null;
const STORAGE_KEY = 'finance-tracker:last-entries';

// --- Utility functions ---
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

// --- Helper to build API URL robustly (avoids absolute root 404 on GitHub Pages) ---
function buildApiUrl(endpoint = 'entries') {
  // Allow callers to set window.__API_BASE__ explicitly (absolute or relative).
  // If not set or empty, use a relative path (no leading slash) to avoid hitting site root.
  const apiBase = typeof window.__API_BASE__ === 'string' ? window.__API_BASE__ : '';
  if (!apiBase) {
    // relative path: "entries"
    return `${endpoint}`;
  }
  // remove trailing slash if present
  const base = apiBase.replace(/\/$/, '');
  // if base looks like an absolute URL (starts with http or /), keep it
  if (/^https?:\/\//i.test(base) || base.startsWith('/')) {
    return `${base}/${endpoint}`.replace(/([^:]\/)\/{2,}/g, '$1/');
  }
  // otherwise treat as relative base
  return `${base}/${endpoint}`.replace(/([^:]\/)\/{2,}/g, '$1/');
}

// --- Fetch entries (remote first, fallback to local PouchDB and localStorage) ---
async function fetchEntries() {
  const apiUrl = buildApiUrl('entries');

  try {
    const response = await fetch(apiUrl, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`API request failed: ${response.status}`);
    const data = await response.json();
    const entries = Array.isArray(data) ? data : [];
    if (entries.length) {
      window.__LAST_ENTRIES__ = entries;
      persistEntries(entries);
      // attempt to sync to local PouchDB asynchronously if available
      if (db && typeof db.bulkDocs === 'function') {
        try {
          const docs = entries.map(e => Object.assign({}, e, { _id: e._id || `entry:${e.type || 'txn'}:${e.date || Date.now()}:${Math.random().toString(36).slice(2,9)}` }));
          await db.bulkDocs(docs).catch(() => null);
        } catch (err) {
          // ignore sync errors
        }
      }
    }
    return entries;
  } catch (err) {
    console.warn('Remote fetch failed, falling back to local:', err);
    // try PouchDB
    if (db && typeof db.allDocs === 'function') {
      try {
        const localEntries = await db.allDocs({ include_docs: true }).then(r => r.rows.map(r => r.doc).filter(Boolean));
        if (localEntries.length) {
          window.__LAST_ENTRIES__ = localEntries;
          persistEntries(localEntries);
          return localEntries;
        }
      } catch (e) {
        console.warn('PouchDB read failed', e);
      }
    }
    // fallback to localStorage
    const cached = readStoredEntries();
    if (cached.length) {
      window.__LAST_ENTRIES__ = cached;
      return cached;
    }
    return [];
  }
}

// --- Save local entry (PouchDB) ---
async function saveLocalEntry(doc) {
  if (!db || typeof db.put !== 'function') throw new Error('PouchDB not ready');
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
    throw err;
  }
}

// --- Add entry (remote then fallback local) ---
async function addEntry(entry) {
  const apiUrl = buildApiUrl('entries');
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
    // update cache
    window.__LAST_ENTRIES__ = Array.isArray(window.__LAST_ENTRIES__) ? [saved, ...window.__LAST_ENTRIES__] : [saved];
    persistEntries(window.__LAST_ENTRIES__);
    // persist locally
    if (db && typeof db.put === 'function') saveLocalEntry(saved).catch(() => null);
    return saved;
  } catch (err) {
    // fallback to local
    const savedLocal = await saveLocalEntry(doc);
    window.__LAST_ENTRIES__ = Array.isArray(window.__LAST_ENTRIES__) ? [savedLocal, ...window.__LAST_ENTRIES__] : [savedLocal];
    persistEntries(window.__LAST_ENTRIES__);
    return savedLocal;
  }
}

// expose
window.fetchEntries = fetchEntries;
window.addEntry = addEntry;
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
  const expenseEntries = entries.filter(isExpenseEntry);

  const totalBalance = balanceEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalExpense = expenseEntries.reduce((s, e) => s + Math.abs(Number(e.amount) || 0), 0);

  return { totalBalance, totalExpense, totalSaving: totalBalance - totalExpense };
}

function getInvestmentTotals(entries = []) {
  const investmentEntries = entries.filter(e => normalizeEntryType(e) === 'investment');
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
    const savingsValue = investmentTotals.total > 0 ? investmentTotals.total : expenseTotals.totalSaving;

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
    const balanceEl = getElementByAnyId('totalBalance');
    const savingsEl = getElementByAnyId('savings');
    const expensesEl = getElementByAnyId('expenses');
    if (balanceEl) balanceEl.textContent = 'Error';
    if (savingsEl) savingsEl.textContent = 'Error';
    if (expensesEl) expensesEl.textContent = 'Error';
  }
}

// make loadFinancialStats available globally for debugging or manual calls
window.loadFinancialStats = loadFinancialStats;

// --- Last Transaction rendering (date selector) ---
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

// --- Recent Activities (line chart of monthly expenses) ---
function updateRecentActivityChart(entries = [], year = (new Date()).getFullYear()) {
  const canvas = document.getElementById('recentActivityChart');
  const totalEl = document.getElementById('monthlyExpenseTotal');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

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
}

// --- Monthly savings bar chart (derived from balance - expense per month) ---
function updateSavingsChart(entries = [], year = (new Date()).getFullYear()) {
  const canvas = document.getElementById('savingsChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const balanceByMonth = new Array(12).fill(0);
  const expenseByMonth = new Array(12).fill(0);

  (entries || []).forEach(e => {
    const d = new Date(e.date);
    if (Number.isNaN(d.getTime())) return;
    if (d.getFullYear() !== Number(year)) return;
    const t = normalizeEntryType(e);
    if (t === 'balance' || t === 'income') balanceByMonth[d.getMonth()] += Number(e.amount) || 0;
    if (t === 'expense' || t === 'trip') expenseByMonth[d.getMonth()] += Math.abs(Number(e.amount) || 0);
  });

  const savingsByMonth = balanceByMonth.map((b,i) => b - expenseByMonth[i]);
  const monthLabels = Array.from({length:12}, (_,i) => new Date(0,i).toLocaleString('en-IN',{month:'short'}));

  if (window.savingsChartInstance) {
    try { window.savingsChartInstance.destroy(); } catch(e){/*ignore*/}
  }

  window.savingsChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: monthLabels,
      datasets: [{
        label: `Monthly Savings ${year}`,
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
}

// --- Initialize selectors and wire UI ---
function initSelectorsAndUI(entries = []) {
  const lastTxDateInput = document.getElementById('lastTxDate');
  const activityYearSelector = document.getElementById('activityYear');
  const savingsYearSelector = document.getElementById('savingsYear');
  const chartYearSelector = document.getElementById('chartYear');

  const now = new Date();
  const todayISO = now.toISOString().slice(0,10);
  if (lastTxDateInput) {
    lastTxDateInput.value = todayISO;
    lastTxDateInput.max = todayISO;
  }

  // build year options from entries
  const yearsSet = new Set((entries || []).map(e => {
    const d = new Date(e.date);
    return Number.isNaN(d.getFullYear()) ? null : d.getFullYear();
  }).filter(Boolean));
  const years = Array.from(yearsSet).sort((a,b)=>b-a);
  if (!years.length) years.push(now.getFullYear());

  const yearOptionsHtml = years.map(y => `<option value="${y}">${y}</option>`).join('');
  if (activityYearSelector) activityYearSelector.innerHTML = yearOptionsHtml;
  if (savingsYearSelector) savingsYearSelector.innerHTML = yearOptionsHtml;
  if (chartYearSelector) chartYearSelector.innerHTML = yearOptionsHtml;

  // defaults
  if (activityYearSelector && !activityYearSelector.value) activityYearSelector.value = now.getFullYear();
  if (savingsYearSelector && !savingsYearSelector.value) savingsYearSelector.value = now.getFullYear();
  if (chartYearSelector && !chartYearSelector.value) chartYearSelector.value = now.getFullYear();

  function refreshAll() {
    const dateVal = lastTxDateInput ? lastTxDateInput.value : todayISO;
    renderLastTransactionsForDate(entries, dateVal);

    const actYear = activityYearSelector ? Number(activityYearSelector.value) : now.getFullYear();
    updateRecentActivityChart(entries, actYear);

    const savYear = savingsYearSelector ? Number(savingsYearSelector.value) : now.getFullYear();
    updateSavingsChart(entries, savYear);

    // update financeChart (year-wise income/expense) if chartYearSelector exists
    if (chartYearSelector) {
      const chartYear = Number(chartYearSelector.value);
      updateFinanceChartYear(entries, chartYear);
    }
  }

  if (lastTxDateInput) lastTxDateInput.addEventListener('change', refreshAll);
  if (activityYearSelector) activityYearSelector.addEventListener('change', refreshAll);
  if (savingsYearSelector) savingsYearSelector.addEventListener('change', refreshAll);
  if (chartYearSelector) chartYearSelector.addEventListener('change', refreshAll);

  // initial render
  refreshAll();
}

// --- Finance chart (year-wise, each bar = month) ---
function updateFinanceChartYear(entries = [], year = (new Date()).getFullYear()) {
  const canvas = document.getElementById('financeChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const incomeByMonth = new Array(12).fill(0);
  const expenseByMonth = new Array(12).fill(0);

  (entries || []).forEach(e => {
    const d = new Date(e.date);
    if (Number.isNaN(d.getTime())) return;
    if (d.getFullYear() !== Number(year)) return;
    const m = d.getMonth();
    const amt = Number(e.amount) || 0;
    const type = normalizeEntryType(e);
    if (type === 'balance' || type === 'income') incomeByMonth[m] += amt;
    if (type === 'expense' || type === 'trip') expenseByMonth[m] += Math.abs(amt);
  });

  const monthLabels = Array.from({ length: 12 }, (_, i) => new Date(0, i).toLocaleString('en-IN', { month: 'short' }));

  if (window.financeChartInstance) {
    try { window.financeChartInstance.destroy(); } catch (e) { /* ignore */ }
  }

  window.financeChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: monthLabels,
      datasets: [
        {
          label: 'Income',
          data: incomeByMonth,
          backgroundColor: '#1abc9c'
        },
        {
          label: 'Expense',
          data: expenseByMonth,
          backgroundColor: '#e74c3c'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

// --- Run once after window load ---
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
    initSelectorsAndUI(window.__LAST_ENTRIES__ || []);
  } catch (err) {
    console.warn('Initial load failed', err);
    const cached = readStoredEntries();
    window.__LAST_ENTRIES__ = cached;
    await loadFinancialStats(cached);
    initSelectorsAndUI(cached);
  }
});

// --- DOMContentLoaded: render a short preview of last transactions (keeps previous behavior) ---
document.addEventListener('DOMContentLoaded', async () => {
  const txTable = getElementByAnyId('lastTx');
  if (!txTable) return;
  const entries = Array.isArray(window.__LAST_ENTRIES__) ? window.__LAST_ENTRIES__ : await fetchEntries().catch(() => []);
  if (!entries || !entries.length) {
    txTable.innerHTML = '<tr><td colspan="3">No transactions</td></tr>';
    return;
  }
  const preview = entries
    .filter(e => ['balance','expense','trip','investment'].includes(normalizeEntryType(e)))
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
