// expense.js - Expense dashboard totals, charts, and yearly summary

document.addEventListener('DOMContentLoaded', async () => {
  const balanceCard = document.getElementById('totalBalance');
  const expenseCard = document.getElementById('totalExpense');
  const savingCard = document.getElementById('totalSaving');
  const yearlyTableBody = document.querySelector('#yearlyExpenseTable tbody');
  const expenseYearSelect = document.getElementById('expenseYearSelect');
  const dailyMonthYearSelect = document.getElementById('dailyMonthYearSelect');
  const yearlyExpenseSelect = document.getElementById('yearlyExpenseSelect');

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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
    return `${date.toLocaleString('default',{month:'short'})}-${date.getFullYear()}`;
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

  // Pie chart for category-wise monthly spending
  function renderDailyExpenseChart(selectedMonthYear) {
  const canvas = document.getElementById('dailyExpenseChart');
  if (!canvas || typeof Chart === 'undefined') return;

  const ctx = canvas.getContext('2d');
  if (window.dailyExpenseChart && typeof window.dailyExpenseChart.destroy === 'function') {
    window.dailyExpenseChart.destroy();
  }

  const dailyEntries = monthlyData[selectedMonthYear]?.daily || [];

  // Group by category (Monthly + Trip expenses)
  const categoryTotals = {};
  dailyEntries.forEach(entry => {
    const category = entry.category || 'Expense';
    categoryTotals[category] = (categoryTotals[category] || 0) + (Number(entry.amount) || 0);
  });

  const labels = Object.keys(categoryTotals);
  const amounts = Object.values(categoryTotals);

  window.dailyExpenseChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data: amounts,
        backgroundColor: ['#e74c3c','#3498db','#2ecc71','#9b59b6','#f1c40f']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        datalabels: {
          color: '#fff',
          formatter: (value, context) => {
            const dataset = context.chart.data.datasets[0].data;
            const total = dataset.reduce((sum, v) => sum + v, 0);
            const percentage = total ? (value / total * 100).toFixed(1) + '%' : '';
            return percentage;
          }
        }
      }
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

    allExpenseEntries.forEach(entry => {
      const amount = Number(entry.amount) || 0;
      const key = getMonthYearKey(entry.date);
      if (!key) return;

      monthlyData[key] = monthlyData[key] || { balance: 0, expense: 0, daily: [] };
      monthlyData[key].expense += amount;
      monthlyData[key].daily.push({ date: entry.date, amount, category: entry.category });
      totalExpense += amount;
    });

    totalSaving = totalBalance - totalExpense;
    updateCards();

    const years = [...new Set([
      ...balanceEntries.map(entry => new Date(entry.date).getFullYear()),
      ...allExpenseEntries.map(entry => new Date(entry.date).getFullYear())
    ])].filter(Boolean);

    expenseYearSelect.innerHTML = '';
    yearlyExpenseSelect.innerHTML = '';
    if (!years.length) {
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

    const monthYearValues = [...new Set(allExpenseEntries
      .map(entry => getMonthYearKey(entry.date))
      .filter(Boolean))];
    dailyMonthYearSelect.innerHTML = '';
    if (!monthYearValues.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No data';
      dailyMonthYearSelect.appendChild(opt);
    } else {
      monthYearValues.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        dailyMonthYearSelect.appendChild(opt);
      });
    }

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
