// expense.js - Expense page with totals, graphs, and yearly summary
// NOTE: Requires db.js to be loaded first

document.addEventListener('DOMContentLoaded', async () => {
  const balanceCard = document.getElementById('totalBalance');
  const expenseCard = document.getElementById('totalExpense');
  const savingCard = document.getElementById('totalSaving');
  const yearlyTableBody = document.querySelector('#yearlyExpenseTable tbody');
  const expenseYearSelect = document.getElementById('expenseYearSelect');
  const dailyMonthYearSelect = document.getElementById('dailyMonthYearSelect');
  const yearlyExpenseSelect = document.getElementById('yearlyExpenseSelect');

  let totalBalance = 0;
  let totalExpense = 0;
  let totalSaving = 0;
  let monthlyData = {}; // { "Aug-2026": { balance: X, expense: Y, daily: [{date, amount}]} }

  function formatINR(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
  }

  function updateCards() {
    balanceCard.textContent = formatINR(totalBalance);
    expenseCard.textContent = formatINR(totalExpense);
    savingCard.textContent = formatINR(totalSaving);
  }

  // --- Monthly Expense Chart ---
  function renderMonthlyExpenseChart(selectedYear) {
    const canvas = document.getElementById('monthlyExpenseChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (window.monthlyExpenseChart && typeof window.monthlyExpenseChart.destroy === 'function') {
      window.monthlyExpenseChart.destroy();
    }

    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const expenseData = months.map(m => {
      const key = `${m}-${selectedYear}`;
      return monthlyData[key]?.expense || 0;
    });

    window.monthlyExpenseChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          { label: 'Monthly Expense', data: expenseData, backgroundColor: '#e74c3c' }
        ]
      },
      options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
  }

  // --- Daily Expense Chart ---
  function renderDailyExpenseChart(selectedMonthYear) {
    const canvas = document.getElementById('dailyExpenseChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (window.dailyExpenseChart && typeof window.dailyExpenseChart.destroy === 'function') {
      window.dailyExpenseChart.destroy();
    }

    const dailyEntries = monthlyData[selectedMonthYear]?.daily || [];
    const labels = dailyEntries.map(e => new Date(e.date).getDate());
    const amounts = dailyEntries.map(e => e.amount);

    window.dailyExpenseChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Daily Expense', data: amounts, borderColor: '#e67e22', backgroundColor: 'rgba(230,126,34,0.2)', fill: true, tension: 0.4 }
        ]
      },
      options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
  }

  // --- Yearly Expense Table ---
  function renderYearlyTable(selectedYear) {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    yearlyTableBody.innerHTML = months.map(m => {
        const key = `${m}-${selectedYear}`;
        const d = monthlyData[key] || { balance:0, expense:0 };
        const saving = d.balance - d.expense;
        return `<tr>
        <td>${m}</td>
        <td>${formatINR(d.balance || 0)}</td>
        <td>${formatINR(d.expense || 0)}</td>
        <td>${formatINR(saving)}</td>
        </tr>`;
    }).join('');
 }


  // --- Load Entries ---
  async function loadEntries() {
    const entries = await window.fetchEntries().catch(() => []);
    const expenseEntries = entries.filter(e => e.type === 'expense');
    const balanceEntries = entries.filter(e => e.type === 'balance');

    totalBalance = 0;
    totalExpense = 0;
    totalSaving = 0;
    monthlyData = {};

    // Balance entries
    balanceEntries.forEach(e => {
      const d = new Date(e.date);
      const month = d.toLocaleString('default',{month:'short'});
      const year = d.getFullYear();
      const key = `${month}-${year}`;
      monthlyData[key] = monthlyData[key] || { balance:0, expense:0, daily:[] };
      monthlyData[key].balance += Number(e.amount) || 0;
      totalBalance += Number(e.amount) || 0;
    });

    // Expense entries
    expenseEntries.forEach(e => {
      const d = new Date(e.date);
      const month = d.toLocaleString('default',{month:'short'});
      const year = d.getFullYear();
      const key = `${month}-${year}`;
      monthlyData[key] = monthlyData[key] || { balance:0, expense:0, daily:[] };
      monthlyData[key].expense += Number(e.amount) || 0;
      monthlyData[key].daily.push({ date: e.date, amount: Number(e.amount) || 0 });
      totalExpense += Number(e.amount) || 0;
    });

    totalSaving = totalBalance - totalExpense;
    updateCards();

    // Populate selectors
    const years = [...new Set([...balanceEntries, ...expenseEntries].map(e => new Date(e.date).getFullYear()))];
    expenseYearSelect.innerHTML = '';
    yearlyExpenseSelect.innerHTML = '';
    if (years.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No data';
      expenseYearSelect.appendChild(opt);
      yearlyExpenseSelect.appendChild(opt.cloneNode(true));
    } else {
      years.sort().forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        expenseYearSelect.appendChild(opt);
        yearlyExpenseSelect.appendChild(opt.cloneNode(true));
      });
    }

    const months = [...new Set(expenseEntries.map(e => {
      const d = new Date(e.date);
      return `${d.toLocaleString('default',{month:'short'})}-${d.getFullYear()}`;
    }))];
    dailyMonthYearSelect.innerHTML = '';
    if (months.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No data';
      dailyMonthYearSelect.appendChild(opt);
    } else {
      months.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        dailyMonthYearSelect.appendChild(opt);
      });
    }

    // Render charts and table
    renderMonthlyExpenseChart(expenseYearSelect.value || new Date().getFullYear());
    renderDailyExpenseChart(dailyMonthYearSelect.value || null);
    renderYearlyTable(yearlyExpenseSelect.value || new Date().getFullYear());
  }

  // --- Handle Balance Form ---
  document.getElementById('balanceForm').addEventListener('submit', async e => {
    e.preventDefault();
    const amt = parseFloat(document.getElementById('balanceAmount').value);
    if (isNaN(amt) || amt <= 0) return;

    const d = new Date();
    const entry = {
      type: 'balance',
      amount: amt,
      currency: 'INR',
      date: d.toISOString(),
      notes: `Monthly balance for ${d.toLocaleString('default',{month:'short'})}-${d.getFullYear()}`
    };
    await window.addEntry(entry);
    await loadEntries();

    e.target.reset();
  });

  // --- Handle Trip Expense Form ---
  document.getElementById('tripExpenseForm').addEventListener('submit', async e => {
    e.preventDefault();
    const amt = parseFloat(document.getElementById('tripAmount').value);
    if (isNaN(amt) || amt <= 0) return;

    const d = new Date();
    const entry = {
        type: 'expense',
        category: 'Trip',
        amount: amt,
        currency: 'INR',
        date: d.toISOString(),
        notes: `Trip expense for ${d.toLocaleString('default',{month:'short'})}-${d.getFullYear()}`
    };
    await window.addEntry(entry);
    await loadEntries();

    e.target.reset();
});


  // --- Dropdown change events ---
  expenseYearSelect.addEventListener('change', () => {
    renderMonthlyExpenseChart(expenseYearSelect.value);
  });

  dailyMonthYearSelect.addEventListener('change', () => {
    renderDailyExpenseChart(dailyMonthYearSelect.value);
  });

  yearlyExpenseSelect.addEventListener('change', () => {
    renderYearlyTable(yearlyExpenseSelect.value);
  });

  // Initial load
  loadEntries();
});
