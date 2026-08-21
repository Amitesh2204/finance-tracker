// expense.js - Expense dashboard totals, charts, and yearly summary
// Requires Chart.js and chartjs-plugin-datalabels (loaded in expense.html)

Chart.register(ChartDataLabels);

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const iciciEl = document.getElementById('iciciBalance');
  const sbiEl = document.getElementById('sbiBalance');
  const bobEl = document.getElementById('bobBalance');
  const totalExpenseEl = document.getElementById('totalExpense');
  const totalSavingEl = document.getElementById('totalSaving');

  const balanceForm = document.getElementById('balanceForm');
  const balanceAmountInput = document.getElementById('balanceAmount');
  const balanceMonthInput = document.getElementById('balanceMonth');
  const balanceBankSelect = document.getElementById('balanceBankSelect');

  const yearlyTableBody = document.querySelector('#yearlyExpenseTable tbody');
  const expenseYearSelect = document.getElementById('expenseYearSelect');
  const dailyMonthYearSelect = document.getElementById('dailyMonthYearSelect');
  const yearlyExpenseSelect = document.getElementById('yearlyExpenseSelect');
  const yearlyBankSelect = document.getElementById('yearlyBankSelect');

  const dailyLegendEl = document.getElementById('dailyLegend');

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Data structures
  let monthlyData = {}; // keyed by "Mon-YYYY" -> { balance, expense, daily:[], byBank: { bankName: {balance, expense, daily:[]} } }
  let allEntries = [];

  function formatINR(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(amount) || 0);
  }

  function getMonthYearKey(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.toLocaleString('default',{month:'short'})}-${date.getFullYear()}`;
  }

  // Totals and bank computations
  function computeTotalBalance() {
    return allEntries.reduce((s, e) => s + ((String(e.type || '').toLowerCase() === 'balance') ? (Number(e.amount) || 0) : 0), 0);
  }
  function computeTotalExpense() {
    return allEntries.reduce((s, e) => s + ((['expense','trip'].includes(String(e.type || '').toLowerCase())) ? (Number(e.amount) || 0) : 0), 0);
  }
  function computeBankTotal(bankName) {
    return allEntries.reduce((s, e) => {
      if (String(e.type || '').toLowerCase() === 'balance') {
        const b = e.bank || 'ICICI';
        if (bankName === 'All' || b === bankName) return s + (Number(e.amount) || 0);
      }
      return s;
    }, 0);
  }

  function updateBankTotalsAndTotals() {
    if (iciciEl) iciciEl.textContent = formatINR(computeBankTotal('ICICI'));
    if (sbiEl) sbiEl.textContent = formatINR(computeBankTotal('SBI'));
    if (bobEl) bobEl.textContent = formatINR(computeBankTotal('Bank of Baroda'));
    if (totalExpenseEl) totalExpenseEl.textContent = formatINR(computeTotalExpense());
    if (totalSavingEl) totalSavingEl.textContent = formatINR(computeTotalBalance() - computeTotalExpense());
  }

  // Charts
  let monthlyExpenseChart = null;
  let dailyExpenseChart = null;

  function renderMonthlyExpenseChart(selectedYear) {
    const canvas = document.getElementById('monthlyExpenseChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (monthlyExpenseChart && typeof monthlyExpenseChart.destroy === 'function') monthlyExpenseChart.destroy();

    const data = monthNames.map(m => monthlyData[`${m}-${selectedYear}`]?.expense || 0);

    monthlyExpenseChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: monthNames,
        datasets: [{ label: 'Monthly Expense', data, backgroundColor: '#e74c3c' }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          datalabels: {
            color: '#fff',
            anchor: 'end',
            align: 'end',
            font: { weight: '800', size: 14 },
            formatter: v => v ? formatINR(v) : ''
          },
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => formatINR(ctx.parsed.y) } }
        },
        scales: { y: { beginAtZero: true, ticks: { callback: v => formatINR(v) } } }
      },
      plugins: [ChartDataLabels]
    });
  }

  function renderDailyExpenseChart(selectedMonthYear) {
    const canvas = document.getElementById('dailyExpenseChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (dailyExpenseChart && typeof dailyExpenseChart.destroy === 'function') dailyExpenseChart.destroy();

    const categories = ['School Fees','Rent','Food & Fruit','Vegetables','Electricity','Doctor Fees','Medicine & Tests','Loan','Saving','Clothes','BC','Other'];
    const colors = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#e67e22','#1abc9c','#34495e','#f1c40f','#d35400','#7f8c8d','#95a5a6'];

    const dailyEntries = monthlyData[selectedMonthYear]?.daily || [];
    const totals = categories.reduce((acc, c) => { acc[c] = 0; return acc; }, {});
    dailyEntries.forEach(e => {
      const cat = e.category || e.notes || 'Other';
      totals[categories.includes(cat) ? cat : 'Other'] += Number(e.amount) || 0;
    });

    const labels = [];
    const amounts = [];
    const usedColors = [];
    categories.forEach((c, i) => {
      if (totals[c] > 0) {
        labels.push(c);
        amounts.push(totals[c]);
        usedColors.push(colors[i % colors.length]);
      }
    });

    // Build legend
    const total = amounts.reduce((s, v) => s + v, 0);
    dailyLegendEl.innerHTML = '';
    if (labels.length) {
      labels.forEach((lbl, i) => {
        const pct = total ? ((amounts[i] / total) * 100).toFixed(1) + '%' : '0%';
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `<span class="legend-swatch" style="background:${usedColors[i]}"></span><span>${lbl} — ${pct}</span>`;
        dailyLegendEl.appendChild(item);
      });
    } else {
      dailyLegendEl.innerHTML = '<div style="color:#95a5a6">No categories for selected month</div>';
    }

    dailyExpenseChart = new Chart(ctx, {
      type: 'pie',
      data: { labels, datasets: [{ data: amounts, backgroundColor: usedColors }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          datalabels: {
            color: '#fff',
            formatter: (value, ctx) => {
              const ds = ctx.chart.data.datasets[0].data;
              const t = ds.reduce((s, v) => s + v, 0);
              return t ? ((value / t * 100).toFixed(1) + '%') : '';
            },
            font: { weight: '600', size: 12 }
          },
          tooltip: { callbacks: { label: ctx => `${ctx.label}: ${formatINR(ctx.parsed)}` } }
        }
      },
      plugins: [ChartDataLabels]
    });
  }

  // Yearly table
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
      return `<tr><td>${month}</td><td>${formatINR(balance)}</td><td>${formatINR(expense)}</td><td>${formatINR(saving)}</td></tr>`;
    }).join('');
    if (yearlyTableBody) yearlyTableBody.innerHTML = rows || '<tr><td colspan="4">No data yet</td></tr>';
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

    allEntries.forEach(entry => {
      const bank = entry.bank || 'ICICI'; // default to ICICI for legacy entries
      const key = getMonthYearKey(entry.date || new Date().toISOString());
      if (!key) return;
      monthlyData[key] = monthlyData[key] || { balance: 0, expense: 0, daily: [], byBank: {} };
      monthlyData[key].byBank[bank] = monthlyData[key].byBank[bank] || { balance: 0, expense: 0, daily: [] };

      const t = String(entry.type || '').toLowerCase();
      const amt = Number(entry.amount) || 0;

      if (t === 'balance' || t === 'income') {
        monthlyData[key].balance += amt;
        monthlyData[key].byBank[bank].balance += amt;
      } else if (t === 'expense' || t === 'trip') {
        monthlyData[key].expense += amt;
        monthlyData[key].byBank[bank].expense += amt;
        const dailyEntry = { date: entry.date || new Date().toISOString(), amount: amt, category: entry.category || entry.notes || 'Other', bank };
        monthlyData[key].daily.push(dailyEntry);
        monthlyData[key].byBank[bank].daily.push(dailyEntry);
      }
    });

    // Populate selectors
    const years = Array.from(new Set(Object.keys(monthlyData).map(k => k.split('-')[1]))).sort((a,b)=>b-a);
    if (!years.length) years.push(String(new Date().getFullYear()));
    if (expenseYearSelect) expenseYearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    if (yearlyExpenseSelect) yearlyExpenseSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');

    const monthYearValues = Object.keys(monthlyData).sort((a,b) => {
      const da = new Date(a.split('-')[1], new Date(`${a.split('-')[0]} 1`).getMonth());
      const db = new Date(b.split('-')[1], new Date(`${b.split('-')[0]} 1`).getMonth());
      return db - da;
    });
    if (dailyMonthYearSelect) {
      dailyMonthYearSelect.innerHTML = monthYearValues.map(m => `<option value="${m}">${m}</option>`).join('');
      if (!monthYearValues.length) dailyMonthYearSelect.innerHTML = '<option value="">No data</option>';
    }

    const defaultYear = years[0];
    const defaultMonthYear = monthYearValues[0] || `${monthNames[new Date().getMonth()]}-${new Date().getFullYear()}`;

    if (expenseYearSelect) expenseYearSelect.value = defaultYear;
    if (yearlyExpenseSelect) yearlyExpenseSelect.value = defaultYear;
    if (dailyMonthYearSelect) dailyMonthYearSelect.value = defaultMonthYear;

    updateBankTotalsAndTotals();
    renderMonthlyExpenseChart(defaultYear);
    renderDailyExpenseChart(defaultMonthYear);
    renderYearlyTable(defaultYear, yearlyBankSelect ? yearlyBankSelect.value || 'All' : 'All');
  }

  // Add balance handler
  if (balanceForm) {
    balanceForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const amount = parseFloat(balanceAmountInput.value);
      if (Number.isNaN(amount) || amount <= 0) return;
      let date = new Date().toISOString();
      if (balanceMonthInput && balanceMonthInput.value) {
        const [y, m] = balanceMonthInput.value.split('-');
        date = new Date(Number(y), Number(m) - 1, 1).toISOString();
      }
      const bank = balanceBankSelect ? balanceBankSelect.value : 'Other';
      const entry = { type: 'balance', amount, date, bank, notes: 'Monthly total balance' };
      if (typeof window.addEntry === 'function') {
        await window.addEntry(entry);
        await loadEntries();
      }
      balanceForm.reset();
    });
  }

  // Selectors change handlers
  if (expenseYearSelect) expenseYearSelect.addEventListener('change', () => renderMonthlyExpenseChart(expenseYearSelect.value));
  if (dailyMonthYearSelect) dailyMonthYearSelect.addEventListener('change', () => {
    const v = dailyMonthYearSelect.value; if (!v) return; renderDailyExpenseChart(v);
  });
  if (yearlyExpenseSelect) yearlyExpenseSelect.addEventListener('change', () => renderYearlyTable(yearlyExpenseSelect.value, yearlyBankSelect ? yearlyBankSelect.value || 'All' : 'All'));
  if (yearlyBankSelect) yearlyBankSelect.addEventListener('change', () => renderYearlyTable(yearlyExpenseSelect ? yearlyExpenseSelect.value || expenseYearSelect.value : expenseYearSelect.value, yearlyBankSelect.value || 'All'));

  // Initial load
  await loadEntries();
});
