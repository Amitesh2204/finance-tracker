// expense.js - Expense dashboard totals, charts, and yearly summary

document.addEventListener('DOMContentLoaded', async () => {
  const balanceCard = document.getElementById('totalBalance');
  const expenseCard = document.getElementById('totalExpense');
  const savingCard = document.getElementById('totalSaving');
  const yearlyTableBody = document.querySelector('#yearlyExpenseTable tbody');
  const expenseYearSelect = document.getElementById('expenseYearSelect');
  const dailyMonthYearSelect = document.getElementById('dailyMonthYearSelect');
  const yearlyExpenseSelect = document.getElementById('yearlyExpenseSelect');

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let totalBalance = 0;
  let totalExpense = 0;
  let totalSaving = 0;
  let monthlyData = {};

  function formatINR(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(amount) || 0);
  }

  function updateCards() {
    balanceCard.textContent = formatINR(totalBalance);
    expenseCard.textContent = formatINR(totalExpense);
    savingCard.textContent = formatINR(totalSaving);
  }

  function getMonthYearKey(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.toLocaleString('default', { month: 'short' })}-${date.getFullYear()}`;
  }

  function renderMonthlyExpenseChart(selectedYear) {
    const canvas = document.getElementById('monthlyExpenseChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const ctx = canvas.getContext('2d');
    if (window.monthlyExpenseChart && typeof window.monthlyExpenseChart.destroy === 'function') {
      window.monthlyExpenseChart.destroy();
    }

    const expenseData = monthNames.map(month => {
      const key = `${month}-${selectedYear}`;
      return monthlyData[key]?.expense || 0;
    });

    window.monthlyExpenseChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: monthNames,
        datasets: [{
          label: 'Monthly Expense',
          data: expenseData,
          backgroundColor: '#e74c3c'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  function renderDailyExpenseChart(selectedMonthYear) {
    const canvas = document.getElementById('dailyExpenseChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const ctx = canvas.getContext('2d');
    if (window.dailyExpenseChart && typeof window.dailyExpenseChart.destroy === 'function') {
      window.dailyExpenseChart.destroy();
    }

    const dailyEntries = monthlyData[selectedMonthYear]?.daily || [];
    const labels = dailyEntries.map(entry => new Date(entry.date).getDate());
    const amounts = dailyEntries.map(entry => Number(entry.amount) || 0);

    window.dailyExpenseChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Daily Expense',
          data: amounts,
          borderColor: '#e67e22',
          backgroundColor: 'rgba(230,126,34,0.2)',
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

  function renderYearlyTable(selectedYear) {
    const rows = monthNames.map(month => {
      const key = `${month}-${selectedYear}`;
      const values = monthlyData[key] || { balance: 0, expense: 0 };
      const saving = (Number(values.balance) || 0) - (Number(values.expense) || 0);

      return `
        <tr>
          <td>${month}</td>
          <td>${formatINR(values.balance || 0)}</td>
          <td>${formatINR(values.expense || 0)}</td>
          <td>${formatINR(saving)}</td>
        </tr>
      `;
    }).join('');

    yearlyTableBody.innerHTML = rows || '<tr><td colspan="4">No data yet</td></tr>';
  }

  function populateYearSelect(selectEl, values) {
    selectEl.innerHTML = '';
    if (!values.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No data';
      selectEl.appendChild(opt);
      return;
    }

    values.sort((a, b) => a - b).forEach(value => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
      selectEl.appendChild(opt);
    });
  }

  function populateMonthYearSelect(selectEl, values) {
    selectEl.innerHTML = '';
    if (!values.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No data';
      selectEl.appendChild(opt);
      return;
    }

    values.forEach(value => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
      selectEl.appendChild(opt);
    });
  }

  async function loadEntries() {
    if (typeof window.fetchEntries !== 'function') {
      console.error('fetchEntries is not defined. Ensure db.js is loaded before expense.js');
      return;
    }

    const entries = await window.fetchEntries().catch(() => []);
    const balanceEntries = entries.filter(entry => String(entry.type || '').toLowerCase() === 'balance');
    const monthlyExpenseEntries = entries.filter(entry => String(entry.type || '').toLowerCase() === 'expense');
    const tripEntries = entries.filter(entry => String(entry.type || '').toLowerCase() === 'trip');
    const allExpenseEntries = [...monthlyExpenseEntries, ...tripEntries];

    totalBalance = 0;
    totalExpense = 0;
    totalSaving = 0;
    monthlyData = {};

    balanceEntries.forEach(entry => {
      const amount = Number(entry.amount) || 0;
      const key = getMonthYearKey(entry.date);
      if (!key) return;

      monthlyData[key] = monthlyData[key] || { balance: 0, expense: 0, daily: [] };
      monthlyData[key].balance += amount;
      totalBalance += amount;
    });

    monthlyExpenseEntries.forEach(entry => {
      const amount = Number(entry.amount) || 0;
      const key = getMonthYearKey(entry.date);
      if (!key) return;

      monthlyData[key] = monthlyData[key] || { balance: 0, expense: 0, daily: [] };
      monthlyData[key].expense += amount;
      monthlyData[key].daily.push({ date: entry.date, amount });
      totalExpense += amount;
    });

    tripEntries.forEach(entry => {
      const amount = Number(entry.amount) || 0;
      const key = getMonthYearKey(entry.date);
      if (!key) return;

      monthlyData[key] = monthlyData[key] || { balance: 0, expense: 0, daily: [] };
      monthlyData[key].expense += amount;
      totalExpense += amount;
    });

    totalSaving = totalBalance - totalExpense;
    updateCards();

    const years = [...new Set([
      ...balanceEntries.map(entry => new Date(entry.date).getFullYear()),
      ...allExpenseEntries.map(entry => new Date(entry.date).getFullYear())
    ])].filter(Boolean);

    populateYearSelect(expenseYearSelect, years);
    populateYearSelect(yearlyExpenseSelect, years);

    const monthYearValues = [...new Set(monthlyExpenseEntries
      .map(entry => getMonthYearKey(entry.date))
      .filter(Boolean))];
    populateMonthYearSelect(dailyMonthYearSelect, monthYearValues);

    const defaultYear = expenseYearSelect.value || years[years.length - 1] || new Date().getFullYear();
    const defaultMonthYear = dailyMonthYearSelect.value || monthYearValues[0] || '';

    expenseYearSelect.value = defaultYear;
    yearlyExpenseSelect.value = defaultYear;
    dailyMonthYearSelect.value = defaultMonthYear;

    renderMonthlyExpenseChart(defaultYear);
    renderDailyExpenseChart(defaultMonthYear);
    renderYearlyTable(defaultYear);
  }

  document.getElementById('balanceForm').addEventListener('submit', async event => {
    event.preventDefault();
    const amount = parseFloat(document.getElementById('balanceAmount').value);
    if (Number.isNaN(amount) || amount <= 0) return;

    const entry = {
      type: 'balance',
      amount,
      currency: 'INR',
      date: new Date().toISOString(),
      notes: 'Monthly total balance'
    };

    if (typeof window.addEntry === 'function') {
      await window.addEntry(entry);
      await loadEntries();
    }

    event.target.reset();
  });

  expenseYearSelect.addEventListener('change', () => {
    renderMonthlyExpenseChart(expenseYearSelect.value);
  });

  dailyMonthYearSelect.addEventListener('change', () => {
    renderDailyExpenseChart(dailyMonthYearSelect.value);
  });

  yearlyExpenseSelect.addEventListener('change', () => {
    renderYearlyTable(yearlyExpenseSelect.value);
  });

  loadEntries();
});
