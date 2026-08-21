document.addEventListener('DOMContentLoaded', async () => {
  const totalExpenseEl = document.getElementById('totalMonthlyExpense');
  const highestMonthEl = document.getElementById('highestExpenseMonth');
  const averageExpenseEl = document.getElementById('averageExpense');
  const monthSelect = document.getElementById('expenseMonthSelect'); // month-year selector
  const tableBody = document.querySelector('#monthlyExpenseTable tbody');
  const dailyItemsTbody = document.querySelector('#dailyItemsTable tbody');

  let expenseEntries = [];
  let monthlyData = {};

  function formatINR(value) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value) || 0);
  }

  function getMonthYearKey(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.toLocaleString('default', { month: 'short' })}-${date.getFullYear()}`;
  }

  function renderSummary(values) {
    const total = Object.values(values).reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    const highest = Object.entries(values).reduce((best, [key, item]) => {
      if ((Number(item.total) || 0) > (best?.amount || 0)) {
        return { key, amount: Number(item.total) || 0 };
      }
      return best;
    }, null);

    totalExpenseEl.textContent = formatINR(total);
    highestMonthEl.textContent = highest ? highest.key : '—';
    averageExpenseEl.textContent = formatINR(total && values ? total / Object.keys(values).length : 0);
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
      }
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

    tableBody.innerHTML = rows || '<tr><td colspan="3">No data yet</td></tr>';
  }

  function renderDailyItems(selectedMonthYear) {
    if (!dailyItemsTbody) return;
    const [monShort, yearStr] = selectedMonthYear.split('-');
    const monthIndex = new Date(`${monShort} 1, ${yearStr}`).getMonth();
    const year = Number(yearStr);

    const filtered = expenseEntries
      .filter(e => {
        const d = new Date(e.date);
        return d.getFullYear() === year && d.getMonth() === monthIndex;
      })
      .sort((a,b) => new Date(a.date) - new Date(b.date));

    if (!filtered.length) {
      dailyItemsTbody.innerHTML = '<tr><td colspan="3">No purchases for selected month</td></tr>';
      return;
    }

    const rows = filtered.map(e => {
      const name = e.name || 'Item';
      const cat = e.category || e.notes || 'Expense';
      const amt = Number(e.amount) || 0;
      return `<tr><td>${name}</td><td>${cat}</td><td>${formatINR(amt)}</td></tr>`;
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

    // Build monthlyData
    monthlyData = {};
    expenseEntries.forEach(entry => {
      const amount = Number(entry.amount) || 0;
      const key = getMonthYearKey(entry.date);
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
      // set value to YYYY-MM format for input[type=month]
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      monthSelect.value = `${now.getFullYear()}-${mm}`;
    }

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
        customWrapper.style.display = 'block';
        customInput.value = val;
      }
    });
  }

  // When main category changes, show/hide custom wrapper
  if (categorySelect) {
    categorySelect.addEventListener('change', () => {
      if (categorySelect.value === 'custom') {
        customWrapper.style.display = 'block';
      } else {
        customWrapper.style.display = 'none';
        customInput.value = '';
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
      const name = (nameInput && nameInput.value) ? nameInput.value.trim() : '';
      let category = categorySelect.value;
      if (category === 'custom') {
        category = (customInput && customInput.value.trim()) ? customInput.value.trim() : 'Custom';
      }

      if (Number.isNaN(amount) || amount <= 0) return;

      const entry = {
        type: 'expense',
        name: name || 'Item',
        category,
        amount,
        date,
        notes: 'Monthly expense'
      };

      if (typeof window.addEntry === 'function') {
        await window.addEntry(entry);
        await loadEntries();
      }

      event.target.reset();
      customWrapper.style.display = 'none';
      if (subcategorySelect) subcategorySelect.value = 'none';
    });
  }

  // monthSelect change handler (input[type=month] -> YYYY-MM)
  if (monthSelect) {
    monthSelect.addEventListener('change', () => {
      if (!monthSelect.value) return;
      const [year, month] = monthSelect.value.split('-');
      const monthName = new Date(`${year}-${month}-01`).toLocaleString('default',{month:'short'});
      const selectedMonthYear = `${monthName}-${year}`;
      renderDailyChart(selectedMonthYear);
      renderTable(year);
      renderDailyItems(selectedMonthYear);
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
