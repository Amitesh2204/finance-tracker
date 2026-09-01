// monthly.js - Monthly page logic, charts, and daily items (final)
// This file preserves existing behavior and ensures categories map to canonical set
// Requires Chart.js and chartjs-plugin-datalabels (loaded in monthly HTML)

document.addEventListener('DOMContentLoaded', async () => {
  const totalExpenseEl = document.getElementById('totalMonthlyExpense');
  const highestMonthEl = document.getElementById('highestExpenseMonth');
  const averageExpenseEl = document.getElementById('averageExpense');
  const monthSelect = document.getElementById('expenseMonthSelect'); // month-year selector (input[type=month])
  const tableBody = document.querySelector('#monthlyExpenseTable tbody');
  const dailyItemsTbody = document.querySelector('#dailyItemsTable tbody');
  const yearSelect = document.getElementById('summaryYearSelect'); // new year selector for summary table
  const daySelect = document.getElementById('dayFilterSelect'); // new day selector to filter daily items

  let expenseEntries = [];
  let monthlyData = {};

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
    return `${date.toLocaleString('default', { month: 'short' })}-${date.getFullYear()}`;
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
    const selected = monthSelect && monthSelect.value ? monthSelect.value : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const [yearStr, monthStr] = selected.split('-');
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;

    const currentMonthTotal = expenseEntries.reduce((sum, entry) => {
      const date = parseLocalDateValue(entry.date);
      if (date.getFullYear() !== year || date.getMonth() !== monthIndex) return sum;
      return sum + (Number(entry.amount) || 0);
    }, 0);

    const total = Object.values(values).reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    const highest = Object.entries(values).reduce((best, [key, item]) => {
      if ((Number(item.total) || 0) > (best?.amount || 0)) {
        return { key, amount: Number(item.total) || 0 };
      }
      return best;
    }, null);

    if (totalExpenseEl) totalExpenseEl.textContent = formatINR(currentMonthTotal);
    if (highestMonthEl) highestMonthEl.textContent = highest ? highest.key : '—';
    if (averageExpenseEl) averageExpenseEl.textContent = formatINR(total && values ? total / Object.keys(values).length : 0);
  }

  function daysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  // Custom Chart.js plugin to draw totals on top of bars
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
          const y = bar.y - 6; // slightly above bar
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
      const d = new Date(entry.date);
      if (d.getFullYear() !== year || d.getMonth() !== monthIndex) return;
      const day = d.getDate();
      totalsByDay[day - 1] += Number(entry.amount) || 0;
    });

    const labels = Array.from({ length: daysCount }, (_, i) => String(i + 1));
    const dataset = {
      label: `Total per day (${selectedMonthYear})`,
      data: totalsByDay,
      backgroundColor: '#e74c3c',
      borderColor: '#c0392b',
      borderWidth: 1
    };

    window.monthlyExpenseChart = new Chart(ctx, {
      type: 'bar',
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
          y: { beginAtZero: true, ticks: { callback: v => formatINR(v) } }
        }
      },
      plugins: [drawBarTotalsPlugin]
    });
  }

  function renderTable(selectedYear) {
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const rows = monthNames.map(month => {
      const key = `${month}-${selectedYear}`;
      const value = monthlyData[key] || { total: 0, days: 0 };
      const averagePerDay = value.days ? (Number(value.total) / Number(value.days)) || 0 : 0;

      return `
        <tr>
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
        const d = new Date(e.date);
        if (d.getFullYear() !== year || d.getMonth() !== monthIndex) return false;
        if (selectedDay) return d.getDate() === Number(selectedDay);
        return true;
      })
      .sort((a,b) => new Date(a.date) - new Date(b.date));

    if (!filtered.length) {
      dailyItemsTbody.innerHTML = '<tr><td colspan="5">No purchases for selected month/day</td></tr>';
      return;
    }

    const rows = filtered.map(e => {
      const name = e.name || 'Item';
      const cat = normalizeCategory(e.category || e.notes || 'Expense');
      const bank = e.bank || 'ICICI';
      const amt = Number(e.amount) || 0;
      const dateStr = new Date(e.date).toLocaleDateString();
      return `<tr><td>${name}</td><td>${cat}</td><td>${bank}</td><td>${dateStr}</td><td>${formatINR(amt)}</td></tr>`;
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
    expenseEntries.forEach(entry => {
      const amount = Number(entry.amount) || 0;
      const key = getMonthYearKey(parseLocalDateValue(entry.date));
      if (!key) return;
      monthlyData[key] = monthlyData[key] || { total: 0, days: 0 };
      monthlyData[key].total += amount;
      monthlyData[key].days += 1;
    });

    // Default to current month-year
    const now = new Date();
    const defaultMonthYear = `${now.toLocaleString('default',{month:'short'})}-${now.getFullYear()}`;

    // populate monthSelect with available months (or current month)
    const months = Object.keys(monthlyData).sort((a,b) => {
      const [ma, ya] = a.split('-'); const [mb, yb] = b.split('-');
      const da = new Date(`${ma} 1, ${ya}`), db = new Date(`${mb} 1, ${yb}`);
      return db - da;
    });
    // ensure current month present
    if (!months.includes(defaultMonthYear)) months.unshift(defaultMonthYear);

    // set monthSelect value to current month
    if (monthSelect) {
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      monthSelect.value = `${now.getFullYear()}-${mm}`;
    }

    // populate yearSelect for summary table
    if (yearSelect) {
      const years = Array.from(new Set(Object.keys(monthlyData).map(k => k.split('-')[1]))).sort((a,b) => b - a);
      if (!years.length) years.push(String(now.getFullYear()));
      yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join(''); 
      yearSelect.value = String(now.getFullYear());
    }

    // populate daySelect (will be updated on month change)
    populateDaySelectFromMonth(now.getFullYear(), now.getMonth());

    renderSummary(monthlyData);
    renderDailyChart(defaultMonthYear);
    renderTable(now.getFullYear());
    renderDailyItems(defaultMonthYear);
  }

  // Form handling: add name and subcategory logic
  const form = document.getElementById('monthlyExpenseForm');
  const categorySelect = document.getElementById('monthlyExpenseCategory');
  const subcategorySelect = document.getElementById('monthlyExpenseSubcategory');
  const customWrapper = document.getElementById('customCategoryWrapper');
  const customInput = document.getElementById('customCategoryInput');
  const nameInput = document.getElementById('monthlyExpenseName');

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
        notes: 'Monthly expense'
      };

      if (typeof window.addEntry === 'function') {
        await window.addEntry(entry);
        await loadEntries();
      }

      event.target.reset();
      if (bankSelect) bankSelect.value = 'ICICI';
      if (customWrapper) customWrapper.style.display = 'none';
      if (subcategorySelect) subcategorySelect.value = 'none';
    });
  }

  // monthSelect change handler (input[type=month] -> YYYY-MM)
  function populateDaySelectFromMonth(year, monthIndex) {
    if (!daySelect) return;
    const daysCount = daysInMonth(year, monthIndex);
    const options = ['<option value="all">All days</option>']
      .concat(Array.from({ length: daysCount }, (_, i) => `<option value="${i+1}">${i+1}</option>`))
      .join('');
    daySelect.innerHTML = options;
    daySelect.value = 'all';
  }

  if (monthSelect) {
    monthSelect.addEventListener('change', () => {
      if (!monthSelect.value) return;
      const [year, month] = monthSelect.value.split('-');
      const monthName = new Date(`${year}-${month}-01`).toLocaleString('default',{month:'short'});
      const selectedMonthYear = `${monthName}-${year}`;
      renderDailyChart(selectedMonthYear);
      renderSummary(monthlyData);
      renderTable(year);
      renderDailyItems(selectedMonthYear);
      // update day selector
      populateDaySelectFromMonth(Number(year), Number(month) - 1);
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
      const monthVal = monthSelect && monthSelect.value ? monthSelect.value : null;
      if (!monthVal) return;
      const [year, month] = monthVal.split('-');
      const monthName = new Date(`${year}-${month}-01`).toLocaleString('default',{month:'short'});
      const selectedMonthYear = `${monthName}-${year}`;
      const dayVal = daySelect.value === 'all' ? null : daySelect.value;
      renderDailyItems(selectedMonthYear, dayVal);
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
