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
  const categorySelect = document.getElementById('expenseCategorySelect');
  const categoryTotalEl = document.getElementById('categoryTotal');
  const savingEls = {
    ICICI: document.getElementById('iciciSaving'),
    SBI: document.getElementById('sbiSaving'),
    'Bank of Baroda': document.getElementById('bobSaving')
  };
  // Per-bank monthly expense labels shown under each bank's balance card
  // (same underlying entries the Monthly Expense page's "Total Monthly
  // Expense" card uses, filtered to the current bank + month).
  const bankExpenseEls = {
    ICICI: document.getElementById('iciciMonthlyExpense'),
    SBI: document.getElementById('sbiMonthlyExpense'),
    'Bank of Baroda': document.getElementById('bobMonthlyExpense')
  };
  const yearBadgeEls = document.querySelectorAll('.expense-card-year');

  // Forms and selectors
  const balanceForm = document.getElementById('balanceForm');
  const balanceAmountInput = document.getElementById('balanceAmount');
  const balanceMonthInput = document.getElementById('balanceMonth');
  const balanceBankSelect = document.getElementById('balanceBank');
  const balanceCategorySelect = document.getElementById('balanceCategory');

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

  function parseLocalDateValue(dateValue) {
    if (!dateValue) return new Date();
    if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) return dateValue;
    if (typeof dateValue === 'string') {
      const trimmed = dateValue.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        const [year, month, day] = trimmed.split('-').map(Number);
        return new Date(year, month - 1, day);
      }
      if (/^\d{4}-\d{2}$/.test(trimmed)) {
        const [year, month] = trimmed.split('-').map(Number);
        return new Date(year, month - 1, 1);
      }
    }
    const parsed = new Date(dateValue);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  function getMonthYearKey(dateValue) {
    const date = parseLocalDateValue(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    return `${monthNames[date.getMonth()]}-${date.getFullYear()}`;
  }

  function formatLocalDateInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
    // Each bank card now shows its NET balance (money added minus that bank's own
    // expenses), so an expense tagged to a bank visibly reduces that bank's card.
    const iciciNet = computeBankTotal('ICICI');
    const sbiNet = computeBankTotal('SBI');
    const bobNet = computeBankTotal('Bank of Baroda');

    const totalExpense = computeTotalExpense();
    const iciciMonthlyExpense = computeCurrentMonthBankExpense('ICICI');
    const sbiMonthlyExpense = computeCurrentMonthBankExpense('SBI');
    const bobMonthlyExpense = computeCurrentMonthBankExpense('Bank of Baroda');
    // Total Monthly Saving = ICICI + SBI + Bank of Baroda Total Balance (the
    // three top cards), all three banks included.
    const totalSaving = iciciNet + sbiNet + bobNet;

    if (iciciEl) iciciEl.textContent = formatINR(iciciNet);
    if (sbiEl) sbiEl.textContent = formatINR(sbiNet);
    if (bobEl) bobEl.textContent = formatINR(bobNet);
    if (totalExpenseEl) totalExpenseEl.textContent = formatINR(totalExpense);
    if (totalSavingEl) totalSavingEl.textContent = formatINR(totalSaving);
    // Per-bank saving = that bank's Total Balance card minus that bank's
    // Monthly Expense card (per updated spec).
    if (savingEls.ICICI) savingEls.ICICI.textContent = formatINR(iciciNet - iciciMonthlyExpense);
    if (savingEls.SBI) savingEls.SBI.textContent = formatINR(sbiNet - sbiMonthlyExpense);
    if (savingEls['Bank of Baroda']) savingEls['Bank of Baroda'].textContent = formatINR(bobNet - bobMonthlyExpense);
    if (bankExpenseEls.ICICI) bankExpenseEls.ICICI.textContent = formatINR(iciciMonthlyExpense);
    if (bankExpenseEls.SBI) bankExpenseEls.SBI.textContent = formatINR(sbiMonthlyExpense);
    if (bankExpenseEls['Bank of Baroda']) bankExpenseEls['Bank of Baroda'].textContent = formatINR(bobMonthlyExpense);
    yearBadgeEls.forEach(el => { el.textContent = new Date().getFullYear(); });
    updateCategoryTotal();
  }

  // Current month's expense total for a single bank (mirrors the per-bank
  // math already used on the Monthly Expense page's "Total Monthly Expense" card).
  function computeCurrentMonthBankExpense(bankName) {
    const now = new Date();
    return allEntries.reduce((sum, entry) => {
      const date = parseLocalDateValue(entry.date);
      if ((entry.bank || 'ICICI') !== bankName || date.getFullYear() !== now.getFullYear() || date.getMonth() !== now.getMonth()) return sum;
      const type = String(entry.type || '').toLowerCase();
      if (type === 'expense' || type === 'trip') return sum + (Number(entry.amount) || 0);
      return sum;
    }, 0);
  }

  // Net balance for a bank: sum of its "balance" entries minus sum of its
  // "expense"/"trip" entries. Entries with no bank tag default to ICICI, same
  // as elsewhere in this file, so old data keeps behaving exactly as before.
  function computeBankTotal(bankName) {
    let balanceSum = 0;
    let expenseSum = 0;
    allEntries.forEach(e => {
      const t = String(e.type || '').toLowerCase();
      const b = e.bank || 'ICICI';
      if (bankName !== 'All' && b !== bankName) return;
      if (t === 'balance') balanceSum += Number(e.amount) || 0;
      else if (t === 'expense' || t === 'trip') expenseSum += Number(e.amount) || 0;
    });
    return balanceSum - expenseSum;
  }

  function computeMonthlyBankSaving(bankName) {
    const now = new Date();
    return allEntries.reduce((sum, entry) => {
      const date = parseLocalDateValue(entry.date);
      if ((entry.bank || 'ICICI') !== bankName || date.getFullYear() !== now.getFullYear() || date.getMonth() !== now.getMonth()) return sum;
      const type = String(entry.type || '').toLowerCase();
      const amount = Number(entry.amount) || 0;
      if (type === 'balance' || type === 'income') return sum + amount;
      if (type === 'expense' || type === 'trip') return sum - amount;
      return sum;
    }, 0);
  }

  function updateCategoryTotal() {
    if (!categoryTotalEl) return;
    const selected = categorySelect ? categorySelect.value : 'Other';
    const now = new Date();
    const total = allEntries.reduce((sum, entry) => {
      const date = parseLocalDateValue(entry.date);
      const type = String(entry.type || '').toLowerCase();
      if (date.getFullYear() !== now.getFullYear() || date.getMonth() !== now.getMonth()) return sum;
      const rawCategory = String(entry.category || entry.notes || '').toLowerCase();
      const category = rawCategory.includes('salary') ? 'Salary' : normalizeCategory(entry.category || entry.notes || 'Other');
      const isSelectedSalary = selected === 'Salary' && (type === 'income' || category === 'Salary');
      const isSelectedExpense = selected !== 'Salary' && type === 'expense' && category === selected;
      return isSelectedSalary || isSelectedExpense ? sum + (Number(entry.amount) || 0) : sum;
    }, 0);
    categoryTotalEl.textContent = formatINR(total);
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
    const now = new Date();
    let sum = 0;
    allEntries.forEach(e => {
      const d = parseLocalDateValue(e.date);
      const isExpense = String(e.type || '').toLowerCase() === 'expense' || String(e.type || '').toLowerCase() === 'trip';
      if (!isExpense) return;
      if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) return;
      sum += Number(e.amount) || 0;
    });
    return sum;
  }

  // Monthly bar chart (monthlyExpenseChart) with a single set of value labels
  // drawn by ChartDataLabels (a second custom plugin used to draw the same
  // total a second time, causing the duplicate-amount bug above each bar).
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
    const mutedColor = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#6d7f79';
    // Headroom above the tallest bar so its label never gets clipped by the
    // chart's top edge (previously the label for the tallest bar could be
    // cut off since the y-axis max matched the bar height almost exactly).
    const maxValue = Math.max(0, ...expenseData);
    const suggestedMax = maxValue > 0 ? maxValue * 1.2 : undefined;

    window.monthlyExpenseChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: monthNames,
        datasets: [{
          label: 'Monthly Expense',
          data: expenseData,
          backgroundColor: '#c94b3c',
          borderColor: '#9f3028',
          borderWidth: 1,
          borderRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { top: 24, bottom: 8 }
        },
        plugins: {
          datalabels: {
            // Fixed-contrast pill (white text on a dark chip) instead of a
            // theme color, so the total is readable above every bar in both
            // light mode and the custom/dark theme, regardless of what the
            // page's --text variable currently resolves to.
            color: '#ffffff',
            backgroundColor: 'rgba(23, 28, 26, 0.78)',
            borderRadius: 4,
            padding: { top: 3, bottom: 3, left: 6, right: 6 },
            anchor: 'end',
            align: 'top',
            offset: 4,
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
          x: { ticks: { color: mutedColor, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
          y: { beginAtZero: true, suggestedMax, ticks: { color: mutedColor, callback: v => formatINR(v) }, grid: { color: `${mutedColor}33` } }
        }
      },
      plugins: [ChartDataLabels]
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
            textStrokeColor: 'rgba(0,0,0,0.45)',
            textStrokeWidth: 2,
            formatter: (value, ctx) => {
              const dataset = ctx.chart.data.datasets[0].data;
              const total = dataset.reduce((s, v) => s + v, 0);
              if (!total) return '';
              const pct = (value / total) * 100;
              // Slices under ~4% are too thin to fit a readable label and
              // just overlap each other; their exact percentage is still
              // shown in the legend and tooltip, so hide the in-slice text.
              if (pct < 4) return '';
              return pct.toFixed(1) + '%';
            },
            font: { weight: '700', size: 12 }
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
    const supportedBanks = ['ICICI', 'SBI', 'Bank of Baroda'];
    // Total Balance column mirrors the top card section's Total Balance
    // figures (same net balance shown on the ICICI/SBI/Bank of Baroda cards),
    // so it's a single constant applied to every month row - not a
    // month-specific sum of that month's balance entries.
    const cardBalances = {
      ICICI: computeBankTotal('ICICI'),
      SBI: computeBankTotal('SBI'),
      'Bank of Baroda': computeBankTotal('Bank of Baroda')
    };
    const cardTotalBalance = bankFilter === 'All'
      ? supportedBanks.reduce((sum, bank) => sum + cardBalances[bank], 0)
      : (cardBalances[bankFilter] || 0);

    const rows = monthNames.map(month => {
      const key = `${month}-${selectedYear}`;
      const values = monthlyData[key] || { expense: 0, byBank: {} };
      let expense = 0;
      if (bankFilter === 'All') {
        expense = supportedBanks.reduce((sum, bank) => sum + (values.byBank?.[bank]?.expense || 0), 0);
      } else {
        const b = values.byBank && values.byBank[bankFilter];
        expense = b ? (b.expense || 0) : 0;
      }
      const balance = cardTotalBalance;
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
      const entryDate = parseLocalDateValue(entry.date || formatLocalDateInput(new Date()));
      const key = getMonthYearKey(entryDate);
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

      // If user provided a month, use the first day of that month; else use now.
      // Store a local date string so month keys don't shift in timezone-sensitive browsers.
      let date = formatLocalDateInput(new Date());
      if (balanceMonthInput && balanceMonthInput.value) {
        const [y, m] = balanceMonthInput.value.split('-');
        date = formatLocalDateInput(new Date(Number(y), Number(m) - 1, 1));
      }

      const bank = balanceBankSelect ? balanceBankSelect.value : 'Other';
      const category = balanceCategorySelect ? balanceCategorySelect.value : 'Other';

      const entry = {
        type: 'balance',
        amount,
        date,
        bank,
        category,
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

  if (categorySelect) categorySelect.addEventListener('change', updateCategoryTotal);

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
