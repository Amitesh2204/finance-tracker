document.addEventListener('DOMContentLoaded', async () => {
  const totalExpenseEl = document.getElementById('totalMonthlyExpense');
  const highestMonthEl = document.getElementById('highestExpenseMonth');
  const averageExpenseEl = document.getElementById('averageExpense');
  const monthSelect = document.getElementById('expenseMonthSelect'); // new month selector
  const tableBody = document.querySelector('#monthlyExpenseTable tbody');

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

  function renderDailyChart(selectedMonthYear) {
    const canvas = document.getElementById('monthlyExpenseChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const ctx = canvas.getContext('2d');
    if (window.monthlyExpenseChart && typeof window.monthlyExpenseChart.destroy === 'function') {
      window.monthlyExpenseChart.destroy();
    }

    // Filter entries for the selected month-year
    const dailyEntries = expenseEntries.filter(entry => {
      const key = getMonthYearKey(entry.date);
      return key === selectedMonthYear;
    });

    // Group by day and category
    const grouped = {};
    dailyEntries.forEach(entry => {
      const d = new Date(entry.date);
      const day = d.getDate();
      const category = entry.category || 'Expense';
      grouped[day] = grouped[day] || {};
      grouped[day][category] = (grouped[day][category] || 0) + (Number(entry.amount) || 0);
    });

    const days = Array.from({ length: 31 }, (_, i) => i + 1);
    const categories = [...new Set(dailyEntries.map(e => e.category || 'Expense'))];

    const datasets = categories.map(cat => {
      return {
        label: cat,
        data: days.map(day => grouped[day]?.[cat] || 0),
        borderWidth: 1,
        backgroundColor: cat === 'Monthly Expense' ? '#e74c3c' : '#3498db'
      };
    });

    window.monthlyExpenseChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: days,
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } }
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

  async function loadEntries() {
    if (typeof window.fetchEntries !== 'function') {
      console.error('fetchEntries is not defined');
      return;
    }

    const entries = await window.fetchEntries().catch(() => []);
    expenseEntries = entries.filter(entry => String(entry.type || '').toLowerCase() === 'expense');

    monthlyData = {};
    expenseEntries.forEach(entry => {
      const amount = Number(entry.amount) || 0;
      const key = getMonthYearKey(entry.date);
      if (!key) return;
      monthlyData[key] = monthlyData[key] || { total: 0, days: 0 };
      monthlyData[key].total += amount;
      monthlyData[key].days += 1;
    });

    const monthYears = [...new Set(expenseEntries.map(entry => getMonthYearKey(entry.date)))].filter(Boolean);
    monthSelect.innerHTML = '';
    if (!monthYears.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No data';
      monthSelect.appendChild(option);
    } else {
      monthYears.forEach(m => {
        const option = document.createElement('option');
        option.value = m;
        option.textContent = m;
        monthSelect.appendChild(option);
      });
    }

    const selectedMonthYear = monthSelect.value || monthYears[monthYears.length - 1] || null;
    if (selectedMonthYear) {
      monthSelect.value = selectedMonthYear;
      renderSummary(monthlyData);
      renderDailyChart(selectedMonthYear);
      const year = selectedMonthYear.split('-')[1];
      renderTable(year);
    }
  }

  document.getElementById('monthlyExpenseForm').addEventListener('submit', async event => {
    event.preventDefault();
    const amount = parseFloat(document.getElementById('monthlyExpenseAmount').value);
    const date = document.getElementById('monthlyExpenseDate').value || new Date().toISOString();

    if (Number.isNaN(amount) || amount <= 0) return;

    // Determine category: default or custom
    const categorySelect = document.getElementById('monthlyExpenseCategory');
    let category = categorySelect.value;
    if (category === 'custom') {
      const customValue = document.getElementById('customCategoryInput').value.trim();
      category = customValue || 'Custom';
    }

    const entry = {
      type: 'expense',
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
    document.getElementById('customCategoryWrapper').style.display = 'none';
  });

  monthSelect.addEventListener('change', () => {
    renderDailyChart(monthSelect.value);
    const year = monthSelect.value.split('-')[1];
    renderTable(year);
  });

  loadEntries();
});
