// expense.js - Expense dashboard totals, charts, and yearly summary
// Requires Chart.js and chartjs-plugin-datalabels (loaded in expense.html)

Chart.register(ChartDataLabels);

document.addEventListener('DOMContentLoaded', async () => {
  // Top bank balance elements
  const iciciEl = document.getElementById('iciciBalance');
  const sbiEl = document.getElementById('sbiBalance');
  const bobEl = document.getElementById('bobBalance');

  // Forms and selectors
  const balanceForm = document.getElementById('balanceForm');
  const balanceAmountInput = document.getElementById('balanceAmount');
  const balanceMonthInput = document.getElementById('balanceMonth');
  const balanceBankSelect = document.getElementById('balanceBank');

  const yearlyTableBody = document.querySelector('#yearlyExpenseTable tbody');
  const expenseYearSelect = document.getElementById('expenseYearSelect');
  const dailyMonthYearSelect = document.getElementById('dailyMonthYearSelect');
  const yearlyExpenseSelect = document.getElementById('yearlyExpenseSelect');
  const yearlyBankSelect = document.getElementById('yearlyBankSelect');

  const dailyLegendEl = document.getElementById('dailyLegend');

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  let monthlyData = {}; // keyed by "Mon-YYYY" -> { balance: number, expense: number, daily: [entries], byBank: { bankName: {balance, expense, daily}} }
  let allEntries = [];

  function formatINR(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(amount) || 0);
  }

  function getMonthYearKey(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.toLocaleString('default',{month:'short'})}-${date.getFullYear()}`;
  }

  // Update the three bank totals at top
  function updateBankTotals() {
    const iciciTotal = computeBankTotal('ICICI');
    const sbiTotal = computeBankTotal('SBI');
    const bobTotal = computeBankTotal('Bank of Baroda');

    if (iciciEl) iciciEl.textContent = formatINR(iciciTotal);
    if (sbiEl) sbiEl.textContent = formatINR(sbiTotal);
    if (bobEl) bobEl.textContent = formatINR(bobTotal);
  }

  function computeBankTotal(bankName) {
    // Sum all balance entries that have bank === bankName
    let sum = 0;
    allEntries.forEach(e => {
      if (String(e.type || '').toLowerCase() === 'balance') {
        const b = e.bank || 'All';
        if (bankName === 'All' || b === bankName) {
          sum += Number(e.amount) || 0;
        }
      }
    });
    return sum;
  }

  // Monthly bar chart (monthlyExpenseChart) with visible data labels (large, high contrast)
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
        plugins: {
          datalabels: {
            color: '#ffffff',
            anchor: 'end',
            align: 'end',
            font: { weight: '700', size: 13 },
            formatter: (value) => value ? formatINR(value) : ''
          },
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => formatINR(ctx.parsed.y)
            }
          }
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => formatINR(v) } }
        }
      },
      plugins: [ChartDataLabels]
    });
  }

  // Daily pie chart showing percentages only; legend built beside chart
  function renderDailyExpenseChart(selectedMonthYear) {
    const canvas = document.getElementById('dailyExpenseChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (window.dailyExpenseChart && typeof window.dailyExpenseChart.destroy === 'function') {
      window.dailyExpenseChart.destroy();
    }

    const dailyEntries = monthlyData[selectedMonthYear]?.daily || [];

    // Group by category (use provided categories list to ensure consistent legend order)
    const categories = ['School Fees','Rent','Food & Fruit','Vegetables','Electricity','Doctor Fees','Medicine & Tests','Loan','Saving','Clothes','BC','Other'];
    const categoryTotals = {};
    categories.forEach(c => categoryTotals[c] = 0);

    dailyEntries.forEach(entry => {
      const category = entry.category || entry.notes || 'Other';
      const matched = categories.includes(category) ? category : 'Other';
      categoryTotals[matched] = (categoryTotals[matched] || 0) + (Number(entry.amount) || 0);
    });

    const labels = [];
    const amounts = [];
    const colors = [
      '#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#e67e22','#1abc9c','#34495e','#f1c40f','#d35400','#7f8c8d','#95a5a6'
    ];

    categories.forEach((cat, idx) => {
      const amt = categoryTotals[cat] || 0;
      if (amt > 0) {
        labels.push(cat);
        amounts.push(amt);
      }
    });

    // Build legend (color swatches + label + percentage)
    const total = amounts.reduce((s,a)=>s+a,0);
    dailyLegendEl.innerHTML = '';
    labels.forEach((lbl, i) => {
      const pct = total ? ((amounts[i] / total) * 100).toFixed(1) + '%' : '0%';
      const swatch = document.createElement('div');
      swatch.className = 'legend-item';
      swatch.innerHTML = `<span class="legend-swatch" style="background:${colors[i % colors.length]}"></span><span>${lbl} — ${pct}</span>`;
      dailyLegendEl.appendChild(swatch);
    });
    if (!labels.length) {
      dailyLegendEl.innerHTML = '<div style="color:#95a5a6">No categories for selected month</div>';
    }

    window.dailyExpenseChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data: amounts,
          backgroundColor: colors.slice(0, labels.length)
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }, // we show custom legend
          datalabels: {
            color: '#fff',
            formatter: (value, ctx) => {
              const dataset = ctx.chart.data.datasets[0].data;
              const total = dataset.reduce((s, v) => s + v, 0);
              return total ? ( (value / total * 100).toFixed(1) + '%' ) : '';
            },
            font: { weight: '600', size: 12 }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ${formatINR(ctx.parsed)}`
            }
          }
        }
      },
      plugins: [ChartDataLabels]
    });
  }

  // Yearly table rendering with bank filter
  function renderYearlyTable(selectedYear, bankFilter = 'All') {
    const rows = monthNames.map(month => {
      const key = `${month}-${selectedYear}`;
      const values = monthlyData[key] || { balance: 0, expense: 0, byBank: {} };
      let balance = 0, expense = 0;
      if (bankFilter === 'All') {
        balance = values.balance || 0;
        expense = values.expense || 0;
      } else {
        const b = values.byBank && values.byBank[bankFilter];
        balance = b ? (b.balance || 0) : 0;
        expense = b ? (b.expense || 0) : 0;
      }
      const saving = (Number(balance) || 0) - (Number(expense) || 0);
      return `
        <tr>
          <td>${month}</td>
          <td>${formatINR(balance || 0)}</td>
          <td>${formatINR(expense || 0)}</td>
          <td>${formatINR(saving)}</td>
        </tr>
      `;
    }).join('');

    yearlyTableBody.innerHTML = rows || '<tr><td colspan="4">No data yet</td></tr>';
  }

  // Build monthlyData from entries
  async function loadEntries() {
    if (typeof window.fetchEntries !== 'function') {
      console.error('fetchEntries is not defined. Ensure db.js is loaded before expense.js');
      return;
    }

    const entries = await window.fetchEntries().catch(() => []);
    allEntries = entries || [];

    monthlyData = {};

    // Initialize monthlyData and accumulate
    allEntries.forEach(entry => {
      const key = getMonthYearKey(entry.date);
      if (!key) return;
      monthlyData[key] = monthlyData[key] || { balance: 0, expense: 0, daily: [], byBank: {} };

      const bank = entry.bank || 'All';

      // Ensure byBank bucket
      monthlyData[key].byBank[bank] = monthlyData[key].byBank[bank] || { balance: 0, expense: 0, daily: [] };

      const t = String(entry.type || '').toLowerCase();
      const amt = Number(entry.amount) || 0;

      if (t === 'balance' || t === 'income') {
        monthlyData[key].balance += amt;
        monthlyData[key].byBank[bank].balance += amt;
      } else if (t === 'expense' || t === 'trip') {
        monthlyData[key].expense += amt;
        monthlyData[key].byBank[bank].expense += amt;
        // store daily entry with category and bank
        const dailyEntry = { date: entry.date, amount: amt, category: entry.category || entry.notes || 'Other', bank };
        monthlyData[key].daily.push(dailyEntry);
        monthlyData[key].byBank[bank].daily.push(dailyEntry);
      }
    });

    // Populate year selectors
    const years = Array.from(new Set(Object.keys(monthlyData).map(k => k.split('-')[1]))).sort((a,b)=>b-a);
    if (!years.length) years.push(String(new Date().getFullYear()));

    expenseYearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    yearlyExpenseSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');

    // Populate month-year options for daily selector
    const monthYearValues = Object.keys(monthlyData).sort((a,b) => {
      const da = new Date(a.split('-')[1], new Date(`${a.split('-')[0]} 1`).getMonth());
      const db = new Date(b.split('-')[1], new Date(`${b.split('-')[0]} 1`).getMonth());
      return db - da;
    });
    dailyMonthYearSelect.innerHTML = monthYearValues.map(m => `<option value="${m}">${m}</option>`).join('');
    if (!monthYearValues.length) dailyMonthYearSelect.innerHTML = '<option value="">No data</option>';

    // Default selections
    const defaultYear = years[0];
    const defaultMonthYear = monthYearValues[0] || `${monthNames[new Date().getMonth()]}-${new Date().getFullYear()}`;

    expenseYearSelect.value = defaultYear;
    yearlyExpenseSelect.value = defaultYear;
    dailyMonthYearSelect.value = defaultMonthYear;

    // Update bank totals and charts/tables
    updateBankTotals();
    renderMonthlyExpenseChart(defaultYear);
    renderDailyExpenseChart(defaultMonthYear);
    renderYearlyTable(defaultYear, yearlyBankSelect.value || 'All');
  }

  // Add balance form handler (stores a balance entry with optional bank and month)
  if (balanceForm) {
    balanceForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const amount = parseFloat(balanceAmountInput.value);
      if (Number.isNaN(amount) || amount <= 0) return;

      // If user provided a month, use first day of that month; else use now
      let date = new Date().toISOString();
      if (balanceMonthInput && balanceMonthInput.value) {
        const [y, m] = balanceMonthInput.value.split('-');
        date = new Date(Number(y), Number(m) - 1, 1).toISOString();
      }

      const bank = balanceBankSelect ? balanceBankSelect.value : 'Other';

      const entry = {
        type: 'balance',
        amount,
        date,
        bank,
        notes: 'Monthly total balance'
      };

      if (typeof window.addEntry === 'function') {
        await window.addEntry(entry);
        await loadEntries();
      }

      balanceForm.reset();
    });
  }

  // Selector change handlers
  if (expenseYearSelect) {
    expenseYearSelect.addEventListener('change', () => {
      renderMonthlyExpenseChart(expenseYearSelect.value);
    });
  }

  if (dailyMonthYearSelect) {
    dailyMonthYearSelect.addEventListener('change', () => {
      const val = dailyMonthYearSelect.value;
      if (!val) return;
      renderDailyExpenseChart(val);
    });
  }

  if (yearlyExpenseSelect) {
    yearlyExpenseSelect.addEventListener('change', () => {
      renderYearlyTable(yearlyExpenseSelect.value, yearlyBankSelect.value || 'All');
    });
  }

  if (yearlyBankSelect) {
    yearlyBankSelect.addEventListener('change', () => {
      renderYearlyTable(yearlyExpenseSelect.value || expenseYearSelect.value, yearlyBankSelect.value || 'All');
    });
  }

  // Initial load
  await loadEntries();
});
