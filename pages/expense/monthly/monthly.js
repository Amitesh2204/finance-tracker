// monthly.js - Monthly page logic, charts, and daily items (final)
// This file preserves existing behavior and ensures categories map to canonical set
// Requires Chart.js and chartjs-plugin-datalabels (loaded in monthly HTML)

document.addEventListener('DOMContentLoaded', async () => {
  const totalExpenseEl = document.getElementById('totalMonthlyExpense');
  const highestMonthEl = document.getElementById('highestExpenseMonth');
  const averageExpenseEl = document.getElementById('averageExpense');
  const monthSelect = document.getElementById('expenseMonthSelect');
  const expenseYearSelect = document.getElementById('expenseYearSelect');
  const dailyMonthSelect = document.getElementById('dailyMonthSelect');
  const chartTotalEl = document.getElementById('monthlyChartTotal');
  const expenseCardYearEl = document.getElementById('expenseCardYear');
  const highestCardYearEl = document.getElementById('highestCardYear');
  const averageCardYearEl = document.getElementById('averageCardYear');
  const tableBody = document.querySelector('#monthlyExpenseTable tbody');
  const dailyItemsTbody = document.querySelector('#dailyItemsTable tbody');
  const yearSelect = document.getElementById('summaryYearSelect'); // new year selector for summary table
  const daySelect = document.getElementById('dayFilterSelect'); // new day selector to filter daily items

  let expenseEntries = [];
  let monthlyData = {};
  let monthlyBankData = {};

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

  function formatINR(value) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value) || 0);
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
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${monthNames[date.getMonth()]}-${date.getFullYear()}`;
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

  function renderSummary(values) {
    const year = Number(expenseYearSelect && expenseYearSelect.value) || new Date().getFullYear();
    const monthIndex = monthSelect ? Number(monthSelect.value) : new Date().getMonth();

    const currentMonthTotal = expenseEntries.reduce((sum, entry) => {
      const date = parseLocalDateValue(entry.date);
      if (date.getFullYear() !== year || date.getMonth() !== monthIndex) return sum;
      return sum + (Number(entry.amount) || 0);
    }, 0);

    const yearValues = Object.fromEntries(Object.entries(values).filter(([key]) => key.endsWith(`-${year}`)));
    const total = Object.values(yearValues).reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    const highest = Object.entries(yearValues).reduce((best, [key, item]) => {
      if ((Number(item.total) || 0) > (best?.amount || 0)) {
        return { key, amount: Number(item.total) || 0 };
      }
      return best;
    }, null);

    const selectedBankTotals = monthlyBankData[`${year}-${monthIndex}`] || {};
    if (totalExpenseEl) totalExpenseEl.textContent = formatINR(currentMonthTotal);
    if (highestMonthEl) highestMonthEl.textContent = highest ? highest.key : '—';
    if (averageExpenseEl) averageExpenseEl.textContent = formatINR(total && yearValues ? total / Object.keys(yearValues).length : 0);
    if (expenseCardYearEl) expenseCardYearEl.textContent = year;
    if (highestCardYearEl) highestCardYearEl.textContent = year;
    if (averageCardYearEl) averageCardYearEl.textContent = year;
    [['ICICI', 'monthlyIciciExpense'], ['SBI', 'monthlySbiExpense'], ['Bank of Baroda', 'monthlyBobExpense']].forEach(([bank, id]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = formatINR(selectedBankTotals[bank] || 0);
    });
  }

  function daysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  function renderDailyChart(selectedMonthYear) {
    const canvas = document.getElementById('monthlyExpenseChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const ctx = canvas.getContext('2d');
    if (window.monthlyExpenseChart && typeof window.monthlyExpenseChart.destroy === 'function') {
      window.monthlyExpenseChart.destroy();
    }

    // Determine year and month index from selectedMonthYear (format: "Mon-YYYY")
    const [monShort, yearStr] = selectedMonthYear.split('-');
    const monthIndex = new Date(`${monShort} 1, ${yearStr}`).getMonth();
    const year = Number(yearStr);
    const daysCount = daysInMonth(year, monthIndex);

    // Aggregate totals per day
    const totalsByDay = new Array(daysCount).fill(0);
    expenseEntries.forEach(entry => {
      const d = parseLocalDateValue(entry.date);
      if (d.getFullYear() !== year || d.getMonth() !== monthIndex) return;
      const day = d.getDate();
      totalsByDay[day - 1] += Number(entry.amount) || 0;
    });

    const labels = Array.from({ length: daysCount }, (_, i) => String(i + 1));
    const chartTotal = totalsByDay.reduce((sum, amount) => sum + amount, 0);
    if (chartTotalEl) chartTotalEl.textContent = `Total for ${selectedMonthYear}: ${formatINR(chartTotal)}`;
    const dataset = {
      label: `Total per day (${selectedMonthYear})`,
      data: totalsByDay,
      backgroundColor: 'rgba(47, 127, 184, .14)',
      borderColor: '#1e5e91',
      pointBackgroundColor: totalsByDay.map(value => value >= chartTotal * 0.75 ? '#b8322b' : (value >= chartTotal * 0.35 ? '#d97724' : '#2f7fb8')),
      pointBorderColor: totalsByDay.map(value => value >= chartTotal * 0.75 ? '#8f211d' : (value >= chartTotal * 0.35 ? '#a65318' : '#1e5e91')),
      pointRadius: 3,
      pointHoverRadius: 6,
      borderWidth: 3,
      fill: true,
      tension: .25,
      cubicInterpolationMode: 'monotone'
    };

    window.monthlyExpenseChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [dataset]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => formatINR(ctx.parsed.y)
            }
          }
        },
        scales: {
          x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#6d7f79', maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
          y: { beginAtZero: true, ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#6d7f79', callback: v => formatINR(v) } }
        }
      },
    });
  }

  function renderBankExpenseCharts(selectedYear) {
    const banks = [
      ['ICICI', 'monthlyIciciChart', '#087f5b'],
      ['SBI', 'monthlySbiChart', '#2f7fb8'],
      ['Bank of Baroda', 'monthlyBobChart', '#c46632']
    ];
    banks.forEach(([bank, canvasId, color]) => {
      const canvas = document.getElementById(canvasId);
      if (!canvas || typeof Chart === 'undefined') return;
      const instanceName = `${canvasId}Instance`;
      if (window[instanceName]) window[instanceName].destroy();
      const values = Array.from({ length: 12 }, (_, month) => (monthlyBankData[`${selectedYear}-${month}`] || {})[bank] || 0);
      window[instanceName] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], datasets: [{ data: values, borderColor: color, backgroundColor: `${color}22`, fill: true, tension: .35, pointRadius: 2, pointBackgroundColor: color, borderWidth: 3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: context => formatINR(context.raw) } } }, scales: { x: { display: true, ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#6d7f79', font: { size: 8 }, maxRotation: 0, autoSkip: false } }, y: { display: false, beginAtZero: true } } }
      });
    });
  }

  function renderTable(selectedYear) {
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const rows = monthNames.map(month => {
      const key = `${month}-${selectedYear}`;
      const value = monthlyData[key] || { total: 0, days: 0 };
      const averagePerDay = value.days ? (Number(value.total) / Number(value.days)) || 0 : 0;

      const isHighest = value.total > 0 && value.total === Math.max(...monthNames.map(monthName => (monthlyData[`${monthName}-${selectedYear}`] || { total: 0 }).total));
      return `
        <tr class="${isHighest ? 'highest-expense-row' : ''}">
          <td>${month}</td>
          <td>${formatINR(value.total || 0)}</td>
          <td>${formatINR(averagePerDay)}</td>
        </tr>
      `;
    }).join('');

    if (tableBody) tableBody.innerHTML = rows || '<tr><td colspan="3">No data yet</td></tr>';
  }

  function renderDailyItems(selectedMonthYear, selectedDay = null) {
    if (!dailyItemsTbody) return;
    const [monShort, yearStr] = selectedMonthYear.split('-');
    const monthIndex = new Date(`${monShort} 1, ${yearStr}`).getMonth();
    const year = Number(yearStr);

    const filtered = expenseEntries
      .filter(e => {
        const d = parseLocalDateValue(e.date);
        if (d.getFullYear() !== year || d.getMonth() !== monthIndex) return false;
        if (selectedDay) return d.getDate() === Number(selectedDay);
        return true;
      })
      .sort((a,b) => new Date(a.date) - new Date(b.date));

    if (!filtered.length) {
      dailyItemsTbody.innerHTML = '<tr><td colspan="6">No purchases for selected month/day</td></tr>';
      return;
    }

    const rows = filtered.map(e => {
      const name = e.name || 'Item';
      const cat = normalizeCategory(e.category || e.notes || 'Expense');
      const bank = e.bank || 'ICICI';
      const amt = Number(e.amount) || 0;
      const dateStr = new Date(e.date).toLocaleDateString();
      const payment = e.paymentMethod || e.paymentType || 'Bhim';
      const categoryClass = `category-${cat.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      return `<tr class="${categoryClass}"><td>${name}</td><td>${cat}</td><td>${bank}</td><td>${dateStr}</td><td>${formatINR(amt)}</td><td>${payment}</td></tr>`;
    }).join('');

    dailyItemsTbody.innerHTML = rows;
  }

  async function loadEntries() {
    if (typeof window.fetchEntries !== 'function') {
      console.error('fetchEntries is not defined');
      return;
    }

    const entries = await window.fetchEntries().catch(() => []);
    // keep all expense entries (type 'expense')
    expenseEntries = entries.filter(entry => String(entry.type || '').toLowerCase() === 'expense');

    // Normalize categories in expenseEntries to canonical set for consistency across pages
    expenseEntries = expenseEntries.map(e => {
      return Object.assign({}, e, { category: normalizeCategory(e.category || e.notes || 'Other') });
    });

    // Build monthlyData
    monthlyData = {};
    monthlyBankData = {};
    expenseEntries.forEach(entry => {
      const amount = Number(entry.amount) || 0;
      const key = getMonthYearKey(parseLocalDateValue(entry.date));
      if (!key) return;
      monthlyData[key] = monthlyData[key] || { total: 0, days: 0 };
      monthlyData[key].total += amount;
      monthlyData[key].days += 1;
      const date = parseLocalDateValue(entry.date);
      const bank = entry.bank || 'ICICI';
      const bankKey = `${date.getFullYear()}-${date.getMonth()}`;
      monthlyBankData[bankKey] = monthlyBankData[bankKey] || { ICICI: 0, SBI: 0, 'Bank of Baroda': 0 };
      if (Object.prototype.hasOwnProperty.call(monthlyBankData[bankKey], bank)) monthlyBankData[bankKey][bank] += amount;
    });

    // Default to current month-year
    const now = new Date();
    const defaultMonthYear = `${now.toLocaleString('default',{month:'short'})}-${now.getFullYear()}`;

    // Populate distinct month and year selectors from the available data.
    const months = Object.keys(monthlyData).sort((a,b) => {
      const [ma, ya] = a.split('-'); const [mb, yb] = b.split('-');
      const da = new Date(`${ma} 1, ${ya}`), db = new Date(`${mb} 1, ${yb}`);
      return db - da;
    });
    // ensure current month present
    if (!months.includes(defaultMonthYear)) months.unshift(defaultMonthYear);

    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    if (monthSelect) {
      monthSelect.innerHTML = monthNames.map((name, index) => `<option value="${index}">${name}</option>`).join('');
      monthSelect.value = String(now.getMonth());
    }

    // populate yearSelect for summary table
    if (yearSelect) {
      const years = Array.from(new Set(Object.keys(monthlyData).map(k => k.split('-')[1]))).sort((a,b) => b - a);
      if (!years.length) years.push(String(now.getFullYear()));
      if (!years.includes(String(now.getFullYear()))) years.unshift(String(now.getFullYear()));
      yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join(''); 
      const defaultYear = years.includes(String(now.getFullYear())) ? String(now.getFullYear()) : years[0];
      yearSelect.value = defaultYear;
      if (expenseYearSelect) {
        expenseYearSelect.innerHTML = yearSelect.innerHTML;
        expenseYearSelect.value = defaultYear;
      }
    }

    // populate daySelect (will be updated on month change)
    populateDaySelectFromMonth(now.getFullYear(), now.getMonth(), now.getDate());
    if (dailyMonthSelect) {
      dailyMonthSelect.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      dailyMonthSelect.max = dailyMonthSelect.value;
    }

    renderSummary(monthlyData);
    renderBankExpenseCharts(now.getFullYear());
    renderDailyChart(defaultMonthYear);
    renderTable(now.getFullYear());
    renderDailyItems(defaultMonthYear, now.getDate());
  }

  // Form handling: add name and subcategory logic
  const form = document.getElementById('monthlyExpenseForm');
  const categorySelect = document.getElementById('monthlyExpenseCategory');
  const subcategorySelect = document.getElementById('monthlyExpenseSubcategory');
  const customWrapper = document.getElementById('customCategoryWrapper');
  const customInput = document.getElementById('customCategoryInput');
  const nameInput = document.getElementById('monthlyExpenseName');
  const paymentSelect = document.getElementById('monthlyExpensePayment');

  // When subcategory selected, mark main category as 'custom' and populate custom input
  if (subcategorySelect) {
    subcategorySelect.addEventListener('change', () => {
      const val = subcategorySelect.value;
      if (val && val !== 'none') {
        categorySelect.value = 'custom';
        if (customWrapper) customWrapper.style.display = 'block';
        if (customInput) customInput.value = val;
      }
    });
  }

  // When main category changes, show/hide custom wrapper
  if (categorySelect) {
    categorySelect.addEventListener('change', () => {
      if (categorySelect.value === 'custom') {
        if (customWrapper) customWrapper.style.display = 'block';
      } else {
        if (customWrapper) customWrapper.style.display = 'none';
        if (customInput) customInput.value = '';
        // reset subcategory to none
        if (subcategorySelect) subcategorySelect.value = 'none';
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const amount = parseFloat(document.getElementById('monthlyExpenseAmount').value);
      const date = document.getElementById('monthlyExpenseDate').value || new Date().toISOString();
      const bankSelect = document.getElementById('monthlyExpenseBank');
      const bank = bankSelect ? bankSelect.value : 'ICICI';
      const paymentMethod = paymentSelect ? paymentSelect.value : 'Bhim';
      const name = (nameInput && nameInput.value) ? nameInput.value.trim() : '';
      let category = categorySelect ? categorySelect.value : 'Other';
      if (category === 'custom') {
        category = (customInput && customInput.value.trim()) ? customInput.value.trim() : 'Custom';
      }

      if (Number.isNaN(amount) || amount <= 0) return;

      const entry = {
        type: 'expense',
        name: name || 'Item',
        category: normalizeCategory(category),
        amount,
        date,
        bank,
        paymentMethod,
        notes: 'Monthly expense'
      };

      if (typeof window.addEntry === 'function') {
        await window.addEntry(entry);
        await loadEntries();
      }

      event.target.reset();
      if (bankSelect) bankSelect.value = 'ICICI';
      if (paymentSelect) paymentSelect.value = 'Bhim';
      if (customWrapper) customWrapper.style.display = 'none';
      if (subcategorySelect) subcategorySelect.value = 'none';
    });
  }

  // Separate month and year dropdown handlers.
  function populateDaySelectFromMonth(year, monthIndex, selectedDay = null) {
    if (!daySelect) return;
    const daysCount = daysInMonth(year, monthIndex);
    const options = ['<option value="all">All days</option>']
      .concat(Array.from({ length: daysCount }, (_, i) => `<option value="${i+1}">${i+1}</option>`))
      .join('');
    daySelect.innerHTML = options;
    daySelect.value = selectedDay ? String(selectedDay) : 'all';
    const dailySection = document.getElementById('dailyItemsSection');
    if (dailySection) dailySection.classList.toggle('all-days-view', !selectedDay);
  }

  if (monthSelect) {
    monthSelect.addEventListener('change', () => {
      if (!monthSelect.value) return;
      const year = expenseYearSelect ? expenseYearSelect.value : String(new Date().getFullYear());
      const month = String(Number(monthSelect.value) + 1).padStart(2, '0');
      const monthName = new Date(`${year}-${month}-01`).toLocaleString('default',{month:'short'});
      const selectedMonthYear = `${monthName}-${year}`;
      if (dailyMonthSelect) dailyMonthSelect.value = `${year}-${month}`;
      renderDailyChart(selectedMonthYear);
      renderSummary(monthlyData);
      renderTable(year);
      renderDailyItems(selectedMonthYear, null);
      // update day selector
      populateDaySelectFromMonth(Number(year), Number(month) - 1);
    });
  }

  if (expenseYearSelect) {
    expenseYearSelect.addEventListener('change', () => {
      const year = expenseYearSelect.value;
      const month = monthSelect ? monthSelect.value : String(new Date().getMonth());
      const monthName = new Date(Number(year), Number(month), 1).toLocaleString('default', { month: 'short' });
      const selectedMonthYear = `${monthName}-${year}`;
      if (dailyMonthSelect) dailyMonthSelect.value = `${year}-${String(Number(month) + 1).padStart(2, '0')}`;
      renderDailyChart(selectedMonthYear);
      renderSummary(monthlyData);
      renderBankExpenseCharts(Number(year));
      renderDailyItems(selectedMonthYear, null);
      populateDaySelectFromMonth(Number(year), Number(month));
    });
  }

  // yearSelect change handler for summary table
  if (yearSelect) {
    yearSelect.addEventListener('change', () => {
      const y = yearSelect.value;
      renderTable(y);
    });
  }

  // daySelect change handler to filter daily items
  if (daySelect) {
    daySelect.addEventListener('change', () => {
      const monthVal = monthSelect && monthSelect.value !== '' ? monthSelect.value : null;
      if (!monthVal) return;
      const year = expenseYearSelect ? expenseYearSelect.value : String(new Date().getFullYear());
      const month = String(Number(monthVal) + 1).padStart(2, '0');
      const monthName = new Date(`${year}-${month}-01`).toLocaleString('default',{month:'short'});
      const selectedMonthYear = `${monthName}-${year}`;
      const dayVal = daySelect.value === 'all' ? null : daySelect.value;
      const dailySection = document.getElementById('dailyItemsSection');
      if (dailySection) dailySection.classList.toggle('all-days-view', !dayVal);
      renderDailyItems(selectedMonthYear, dayVal);
    });
  }

  if (dailyMonthSelect) {
    dailyMonthSelect.addEventListener('change', () => {
      if (!dailyMonthSelect.value) return;
      const [year, month] = dailyMonthSelect.value.split('-').map(Number);
      if (expenseYearSelect) expenseYearSelect.value = String(year);
      if (monthSelect) monthSelect.value = String(month - 1);
      const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'short' });
      const selectedMonthYear = `${monthName}-${year}`;
      renderDailyChart(selectedMonthYear);
      renderSummary(monthlyData);
      renderDailyItems(selectedMonthYear, null);
      populateDaySelectFromMonth(year, month - 1);
    });
  }

  // Collapsible behavior for monthly page sections
  (function setupCollapsibles() {
    const sections = document.querySelectorAll('.collapsible');
    sections.forEach(section => {
      const header = section.querySelector('.collapsible-header');
      if (!header) return;
      const chev = header.querySelector('.chev');
      // default open state: data-default-open attribute or open on desktop
      const defaultOpen = section.getAttribute('data-default-open') === 'true';
      const isMobile = window.matchMedia('(max-width:800px)').matches;
      if (isMobile) {
        if (defaultOpen) section.classList.add('open');
        else section.classList.remove('open');
      } else {
        section.classList.add('open');
      }
      // set initial chevron
      if (chev) chev.textContent = section.classList.contains('open') ? '▲' : '▼';

      header.addEventListener('click', () => {
        section.classList.toggle('open');
        if (chev) chev.textContent = section.classList.contains('open') ? '▲' : '▼';
      });
      header.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          section.classList.toggle('open');
          if (chev) chev.textContent = section.classList.contains('open') ? '▲' : '▼';
        }
      });
    });
  })();

  // initial load
  await loadEntries();
});
