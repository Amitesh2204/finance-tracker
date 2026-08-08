document.addEventListener('DOMContentLoaded', async () => {
  const totalExpenseEl = document.getElementById('totalMonthlyExpense');
  const highestMonthEl = document.getElementById('highestExpenseMonth');
  const averageExpenseEl = document.getElementById('averageExpense');
  const yearSelect = document.getElementById('expenseYearSelect');
  const tableBody = document.querySelector('#monthlyExpenseTable tbody');

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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

  function renderChart(selectedYear) {
    const canvas = document.getElementById('monthlyExpenseChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const ctx = canvas.getContext('2d');
    if (window.monthlyExpenseChart && typeof window.monthlyExpenseChart.destroy === 'function') {
      window.monthlyExpenseChart.destroy();
    }

    const monthlyValues = monthNames.map(month => {
      const key = `${month}-${selectedYear}`;
      return monthlyData[key]?.total || 0;
    });

    window.monthlyExpenseChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: monthNames,
        datasets: [{
          label: 'Monthly Expense',
          data: monthlyValues,
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

  function renderTable(selectedYear) {
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

  function populateYears(values) {
    yearSelect.innerHTML = '';
    if (!values.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No data';
      yearSelect.appendChild(option);
      return;
    }

    values.sort((a, b) => a - b).forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      yearSelect.appendChild(option);
    });
  }

  async function loadEntries() {
    if (typeof window.fetchEntries !== 'function') {
      console.error('fetchEntries is not defined');
      return;
    }

    const entries = await window.fetchEntries().catch(() => []);
    const expenseEntries = entries.filter(entry => String(entry.type || '').toLowerCase() === 'expense');

    monthlyData = {};
    expenseEntries.forEach(entry => {
      const amount = Number(entry.amount) || 0;
      const key = getMonthYearKey(entry.date);
      if (!key) return;
      monthlyData[key] = monthlyData[key] || { total: 0, days: 0 };
      monthlyData[key].total += amount;
      monthlyData[key].days += 1;
    });

    const years = [...new Set(expenseEntries.map(entry => new Date(entry.date).getFullYear()))].filter(Boolean);
    populateYears(years);

    const selectedYear = yearSelect.value || years[years.length - 1] || new Date().getFullYear();
    yearSelect.value = selectedYear;
    renderSummary(monthlyData);
    renderChart(selectedYear);
    renderTable(selectedYear);
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
    // Hide custom category input after reset
    document.getElementById('customCategoryWrapper').style.display = 'none';
  });

  yearSelect.addEventListener('change', () => {
    renderChart(yearSelect.value);
    renderTable(yearSelect.value);
  });

  loadEntries();
});
