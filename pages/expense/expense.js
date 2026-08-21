// expense.js - Expense dashboard totals, charts, and yearly summary (final)
// Requires Chart.js and chartjs-plugin-datalabels (loaded in expense.html)

Chart.register(ChartDataLabels);

// Canonical categories and colors (kept local to this file)
const EXPENSE_CATEGORIES = [
  'School Fees','Rent','Food & Fruit','Vegetables','Electricity',
  'Doctor Fees','Medicine & Tests','Loan','Saving','Clothes','BC','Other'
];

const CATEGORY_COLORS = {
  'School Fees': '#8e44ad',
  'Rent': '#2ecc71',
  'Food & Fruit': '#f39c12',
  'Vegetables': '#27ae60',
  'Electricity': '#f1c40f',
  'Doctor Fees': '#3498db',
  'Medicine & Tests': '#e67e22',
  'Loan': '#34495e',
  'Saving': '#1abc9c',
  'Clothes': '#d35400',
  'BC': '#7f8c8d',
  'Other': '#95a5a6'
};

document.addEventListener('DOMContentLoaded', async () => {
  // Top bank balance elements
  const iciciEl = document.getElementById('iciciBalance');
  const sbiEl = document.getElementById('sbiBalance');
  const bobEl = document.getElementById('bobBalance');
  const totalExpenseEl = document.getElementById('totalExpense');
  const totalSavingEl = document.getElementById('totalSaving');

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

  // monthlyData keyed by "Mon-YYYY" -> { balance: number, expense: number, daily: [entries], byBank: { bankName: {balance, expense, daily}} }
  let monthlyData = {};
  let allEntries = [];

  // For daily chart interactivity: keep original totals per category for the currently selected month-year
  let originalCategoryTotals = {};
  let activeCategories = new Set(); // when empty => all active

  function formatINR(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(amount) || 0);
  }

  function getMonthYearKey(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.toLocaleString('default',{month:'short'})}-${date.getFullYear()}`;
  }

  // Normalize category names to canonical list
  function normalizeCategory(raw) {
    if (!raw) return 'Other';
    const trimmed = String(raw).trim();
    if (EXPENSE_CATEGORIES.includes(trimmed)) return trimmed;
    const lower = trimmed.toLowerCase();
    if (lower.includes('veg') || lower.includes('vegetable')) return 'Vegetables';
    if (lower.includes('food') || lower.includes('fruit') || lower.includes('dining')) return 'Food & Fruit';
    if (lower.includes('rent')) return 'Rent';
    if (lower.includes('school') || lower.includes('tuition') || lower.includes('fees')) return 'School Fees';
    if (lower.includes('electric')) return 'Electricity';
    if (lower.includes('doctor') || lower.includes('clinic') || lower.includes('hospital')) return 'Doctor Fees';
    if (lower.includes('medicine') || lower.includes('test')) return 'Medicine & Tests';
    if (lower.includes('loan')) return 'Loan';
    if (lower.includes('save') || lower.includes('saving')) return 'Saving';
    if (lower.includes('cloth') || lower.includes('apparel')) return 'Clothes';
    if (lower === 'balance' || lower === 'bc') return 'BC';
    return 'Other';
  }

  // Update the three bank totals at top and overall totals
  function updateBankTotalsAndTotals() {
    const iciciTotal = computeBankTotal('ICICI');
    const sbiTotal = computeBankTotal('SBI');
    const bobTotal = computeBankTotal('Bank of Baroda');

    const totalExpense = computeTotalExpense();
    const totalBalance = computeTotalBalance();
    const totalSaving = totalBalance - totalExpense;

    if (iciciEl) iciciEl.textContent = formatINR(iciciTotal);
    if (sbiEl) sbiEl.textContent = formatINR(sbiTotal);
    if (bobEl) bobEl.textContent = formatINR(bobTotal);
    if (totalExpenseEl) totalExpenseEl.textContent = formatINR(totalExpense);
    if (totalSavingEl) totalSavingEl.textContent = formatINR(totalSaving);
  }

  function computeBankTotal(bankName) {
    // Sum all balance entries that have bank === bankName
    let sum = 0;
    allEntries.forEach(e => {
      if (String(e.type || '').toLowerCase() === 'balance') {
        const b = e.bank || 'ICICI'; // default to ICICI if missing
        if (bankName === 'All' || b === bankName) {
          sum += Number(e.amount) || 0;
        }
      }
    });
    return sum;
  }

  function computeTotalBalance() {
    let sum = 0;
    allEntries.forEach(e => {
      if (String(e.type || '').toLowerCase() === 'balance') {
        sum += Number(e.amount) || 0;
      }
    });
    return sum;
  }

  function computeTotalExpense() {
    let sum = 0;
    allEntries.forEach(e => {
      if (String(e.type || '').toLowerCase() === 'expense' || String(e.type || '').toLowerCase() === 'trip') {
        sum += Number(e.amount) || 0;
      }
    });
    return sum;
  }

  // Custom Chart.js plugin to draw totals on top of bars (used for monthly bar chart)
  const drawBarTotalsPlugin = {
    id: 'drawBarTotals',
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      chart.data.datasets.forEach((dataset, dsIndex) => {
        const meta = chart.getDatasetMeta(dsIndex);
        meta.data.forEach((bar, index) => {
          const value = dataset.data[index] || 0;
          if (value === 0) return;
          const x = bar.x;
          const y = bar.y - 8; // slightly above bar
          ctx.save();
          ctx.fillStyle = '#ffffff';
          ctx.font = '700 12px Inter, system-ui, Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(formatINR(value), x, y);
          ctx.restore();
        });
      });
    }
  };

  // Monthly bar chart (monthlyExpenseChart) with visible data labels and totals on top
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
        layout: {
          padding: { top: 12, bottom: 8 }
        },
        plugins: {
          datalabels: {
            color: '#ffffff',
            anchor: 'end',
            align: 'start',
            offset: -6,
            clamp: true,
            font: { weight: '800', size: 11 },
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
      plugins: [ChartDataLabels, drawBarTotalsPlugin]
    });
  }

  // Daily pie chart showing percentages only; legend built beside chart
  // This version always shows all categories in the legend (0% if none) and supports click-to-filter
  function renderDailyExpenseChart(selectedMonthYear) {
    const canvas = document.getElementById('dailyExpenseChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (window.dailyExpenseChart && typeof window.dailyExpenseChart.destroy === 'function') {
      window.dailyExpenseChart.destroy();
    }

    const dailyEntries = monthlyData[selectedMonthYear]?.daily || [];

    // Initialize totals for all categories (so legend always shows all)
    const categoryTotals = {};
    EXPENSE_CATEGORIES.forEach(c => categoryTotals[c] = 0);

    dailyEntries.forEach(entry => {
      // normalize category names to canonical set
      const cat = normalizeCategory(entry.category || entry.notes || 'Other');
      categoryTotals[cat] = (categoryTotals[cat] || 0) + (Number(entry.amount) || 0);
    });

    // Save original totals for interactivity
    originalCategoryTotals = Object.assign({}, categoryTotals);
    // If activeCategories is empty, treat as all active
    if (activeCategories.size === 0) EXPENSE_CATEGORIES.forEach(c => activeCategories.add(c));

    // Build labels and amounts (all categories included)
    const labels = EXPENSE_CATEGORIES.slice();
    const amounts = labels.map(l => originalCategoryTotals[l] || 0);
    const bgColors = labels.map(l => CATEGORY_COLORS[l] || '#95a5a6');

    // Build legend (color swatches + label + percentage) and attach click handlers
    const total = amounts.reduce((s,a)=>s+a,0);
    dailyLegendEl.innerHTML = '';
    labels.forEach((lbl, i) => {
      const amt = originalCategoryTotals[lbl] || 0;
      const pct = total ? ((amt / total) * 100).toFixed(1) + '%' : '0%';
      const swatch = document.createElement('div');
      swatch.className = 'legend-item';
      if (!activeCategories.has(lbl)) swatch.classList.add('inactive');
      swatch.dataset.category = lbl;
      swatch.innerHTML = `<span class="legend-swatch" style="background:${bgColors[i]}"></span><span class="legend-label">${lbl} — ${pct}</span>`;
      swatch.addEventListener('click', () => {
        // Toggle category active state
        if (activeCategories.has(lbl)) {
          activeCategories.delete(lbl);
        } else {
          activeCategories.add(lbl);
        }
        // If none selected, reset to all selected
        if (activeCategories.size === 0) EXPENSE_CATEGORIES.forEach(c => activeCategories.add(c));
        // Update legend visuals
        Array.from(dailyLegendEl.children).forEach(child => {
          const cat = child.dataset.category;
          if (!activeCategories.has(cat)) child.classList.add('inactive'); else child.classList.remove('inactive');
        });
        // Recompute filtered data and update chart
        updateDailyChartFromActive(EXPENSE_CATEGORIES, originalCategoryTotals, CATEGORY_COLORS);
      });
      dailyLegendEl.appendChild(swatch);
    });

    // Create chart with all categories (Chart.js will hide zero slices)
    window.dailyExpenseChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data: amounts,
          backgroundColor: bgColors
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }, // custom legend used
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

    // Ensure initial active state is reflected in chart
    updateDailyChartFromActive(EXPENSE_CATEGORIES, originalCategoryTotals, CATEGORY_COLORS);
  }

  // Helper to update the pie chart based on activeCategories
  function updateDailyChartFromActive(categories, totals, colorsMap) {
    if (!window.dailyExpenseChart) return;
    const data = [];
    const labels = [];
    const bg = [];
    categories.forEach(cat => {
      if (activeCategories.has(cat)) {
        labels.push(cat);
        data.push(totals[cat] || 0);
        bg.push(colorsMap[cat] || '#95a5a6');
      }
    });
    // If all categories are active (or none filtered), show all categories to preserve legend mapping
    if (activeCategories.size === categories.length) {
      window.dailyExpenseChart.data.labels = categories;
      window.dailyExpenseChart.data.datasets[0].data = categories.map(c => totals[c] || 0);
      window.dailyExpenseChart.data.datasets[0].backgroundColor = categories.map(c => colorsMap[c] || '#95a5a6');
    } else {
      window.dailyExpenseChart.data.labels = labels;
      window.dailyExpenseChart.data.datasets[0].data = data;
      window.dailyExpenseChart.data.datasets[0].backgroundColor = bg;
    }
    window.dailyExpenseChart.update();
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

    // Initialize monthlyData and accumulate
    allEntries.forEach(entry => {
      // default bank to ICICI if missing (so existing expenses are deducted from ICICI)
      const bank = entry.bank || 'ICICI';
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
        // store daily entry with normalized category and bank
        const dailyEntry = {
          date: entry.date || new Date().toISOString(),
          amount: amt,
          category: normalizeCategory(entry.category || entry.notes || 'Other'),
          bank
        };
        monthlyData[key].daily.push(dailyEntry);
        monthlyData[key].byBank[bank].daily.push(dailyEntry);
      }
    });

    // Populate year selectors
    const years = Array.from(new Set(Object.keys(monthlyData).map(k => k.split('-')[1]))).sort((a,b)=>b-a);
    if (!years.length) years.push(String(new Date().getFullYear()));

    if (expenseYearSelect) expenseYearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    if (yearlyExpenseSelect) yearlyExpenseSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');

    // Populate month-year options for daily selector
    const monthYearValues = Object.keys(monthlyData).sort((a,b) => {
      const da = new Date(a.split('-')[1], new Date(`${a.split('-')[0]} 1`).getMonth());
      const db = new Date(b.split('-')[1], new Date(`${b.split('-')[0]} 1`).getMonth());
      return db - da;
    });
    if (dailyMonthYearSelect) {
      dailyMonthYearSelect.innerHTML = monthYearValues.map(m => `<option value="${m}">${m}</option>`).join('');
      if (!monthYearValues.length) dailyMonthYearSelect.innerHTML = '<option value="">No data</option>';
    }

    // Default selections
    const defaultYear = years[0];
    const defaultMonthYear = monthYearValues[0] || `${monthNames[new Date().getMonth()]}-${new Date().getFullYear()}`;

    if (expenseYearSelect) expenseYearSelect.value = defaultYear;
    if (yearlyExpenseSelect) yearlyExpenseSelect.value = defaultYear;
    if (dailyMonthYearSelect) dailyMonthYearSelect.value = defaultMonthYear;

    // Update bank totals and charts/tables
    updateBankTotalsAndTotals();
    renderMonthlyExpenseChart(defaultYear);
    renderDailyExpenseChart(defaultMonthYear);
    renderYearlyTable(defaultYear, yearlyBankSelect ? yearlyBankSelect.value || 'All' : 'All');
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
      // Reset active categories to all when month changes
      activeCategories = new Set();
      renderDailyExpenseChart(val);
    });
  }

  if (yearlyExpenseSelect) {
    yearlyExpenseSelect.addEventListener('change', () => {
      renderYearlyTable(yearlyExpenseSelect.value, yearlyBankSelect ? yearlyBankSelect.value || 'All' : 'All');
    });
  }

  if (yearlyBankSelect) {
    yearlyBankSelect.addEventListener('change', () => {
      renderYearlyTable(yearlyExpenseSelect ? yearlyExpenseSelect.value || expenseYearSelect.value : expenseYearSelect.value, yearlyBankSelect.value || 'All');
    });
  }

  // Initial load
  await loadEntries();
});
