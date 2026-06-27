// script.js
// IndexedDB wrapper for savings/expenses
const DB_NAME = 'savings_tracker';
const DB_VERSION = 1;
const STORE_NAME = 'entries';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function addEntry(entry) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).add(entry);
  return tx.complete;
}

async function getAllEntries() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// UI logic
const form = document.getElementById('entry-form');
const historyList = document.getElementById('history-list');
const savingsChartCtx = document.getElementById('savingsChart').getContext('2d');
const expensesChartCtx = document.getElementById('expensesChart').getContext('2d');
let savingsChart, expensesChart;

form.onsubmit = async (e) => {
  e.preventDefault();
  const entry = {
    type: document.getElementById('type').value,
    amount: parseFloat(document.getElementById('amount').value),
    date: document.getElementById('date').value
  };
  await addEntry(entry);
  form.reset();
  render();
};

async function render() {
  const entries = await getAllEntries();
  renderHistory(entries);
  renderCharts(entries);
}

function renderHistory(entries) {
  historyList.innerHTML = '';
  entries.sort((a, b) => new Date(b.date) - new Date(a.date));
  for (const entry of entries) {
    const li = document.createElement('li');
    li.textContent = `${entry.date}: ${entry.type.replace('_', ' ')} - ₹${entry.amount}`;
    historyList.appendChild(li);
  }
}

function renderCharts(entries) {
  // Savings chart
  const savingsTypes = ['mutual_fund', 'lic', 'bank_deposit', 'sukanya_yojana'];
  const savingsData = savingsTypes.map(type =>
    entries.filter(e => e.type === type).reduce((sum, e) => sum + e.amount, 0)
  );
  if (savingsChart) savingsChart.destroy();
  savingsChart = new Chart(savingsChartCtx, {
    type: 'bar',
    data: {
      labels: ['Mutual Fund', 'LIC', 'Bank Deposit', 'Sukanya Yojana'],
      datasets: [{
        label: 'Total Savings',
        data: savingsData,
        backgroundColor: ['#1976d2', '#388e3c', '#fbc02d', '#d32f2f']
      }]
    },
    options: {responsive: true}
  });
  // Expenses chart (monthly)
  const expenses = entries.filter(e => e.type === 'expense');
  const monthly = {};
  for (const e of expenses) {
    const month = e.date.slice(0,7);
    monthly[month] = (monthly[month] || 0) + e.amount;
  }
  if (expensesChart) expensesChart.destroy();
  expensesChart = new Chart(expensesChartCtx, {
    type: 'line',
    data: {
      labels: Object.keys(monthly),
      datasets: [{
        label: 'Monthly Expenses',
        data: Object.values(monthly),
        borderColor: '#d32f2f',
        fill: false
      }]
    },
    options: {responsive: true}
  });
}

window.onload = render;
