document.addEventListener('DOMContentLoaded', async () => {
  const totalTripExpenseEl = document.getElementById('totalTripExpense');
  const tripCountEl = document.getElementById('tripCount');
  const averageTripExpenseEl = document.getElementById('averageTripExpense');
  const tripYearSelect = document.getElementById('tripYearSelect');
  const tripTableBody = document.querySelector('#tripExpenseTable tbody');

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let tripData = {};

  function formatINR(value) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value) || 0);
  }

  function getMonthYearKey(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.toLocaleString('default', { month: 'short' })}-${date.getFullYear()}`;
  }

  function renderSummary(entries) {
    const total = entries.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    totalTripExpenseEl.textContent = formatINR(total);
    tripCountEl.textContent = entries.length;
    averageTripExpenseEl.textContent = formatINR(entries.length ? total / entries.length : 0);
  }

  function renderChart(selectedYear) {
    const canvas = document.getElementById('tripExpenseChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const ctx = canvas.getContext('2d');
    if (window.tripExpenseChart && typeof window.tripExpenseChart.destroy === 'function') {
      window.tripExpenseChart.destroy();
    }

    const values = monthNames.map(month => {
      const key = `${month}-${selectedYear}`;
      return tripData[key] || 0;
    });

    window.tripExpenseChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: monthNames,
        datasets: [{
          label: 'Trip Expense',
          data: values,
          backgroundColor: '#e67e22'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  function renderTable(entries) {
    if (!entries.length) {
      tripTableBody.innerHTML = '<tr><td colspan="3">No data yet</td></tr>';
      return;
    }

    tripTableBody.innerHTML = entries.map(entry => `
      <tr>
        <td>${entry.name || 'Trip'}</td>
        <td>${new Date(entry.date).toLocaleDateString()}</td>
        <td>${formatINR(entry.amount || 0)}</td>
      </tr>
    `).join('');
  }

  function populateYears(values) {
    tripYearSelect.innerHTML = '';
    if (!values.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No data';
      tripYearSelect.appendChild(option);
      return;
    }

    values.sort((a, b) => a - b).forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      tripYearSelect.appendChild(option);
    });
  }

  async function loadEntries() {
    if (typeof window.fetchEntries !== 'function') return;
    const entries = await window.fetchEntries().catch(() => []);
    const tripEntries = entries.filter(entry => {
      const type = String(entry.type || '').toLowerCase();
      return type === 'trip' || (type === 'expense' && String(entry.category || '').toLowerCase().includes('trip'));
    });

    tripData = {};
    tripEntries.forEach(entry => {
      const key = getMonthYearKey(entry.date);
      if (!key) return;
      tripData[key] = (tripData[key] || 0) + (Number(entry.amount) || 0);
    });

    const years = [...new Set(tripEntries.map(entry => new Date(entry.date).getFullYear()))].filter(Boolean);
    populateYears(years);

    const selectedYear = tripYearSelect.value || years[years.length - 1] || new Date().getFullYear();
    tripYearSelect.value = selectedYear;

    renderSummary(tripEntries);
    renderChart(selectedYear);
    renderTable(tripEntries.filter(entry => new Date(entry.date).getFullYear() === Number(selectedYear)));
  }

  document.getElementById('tripExpenseForm').addEventListener('submit', async event => {
    event.preventDefault();
    const name = document.getElementById('tripExpenseName').value.trim();
    const amount = parseFloat(document.getElementById('tripExpenseAmount').value);
    const date = document.getElementById('tripExpenseDate').value || new Date().toISOString();

    if (!name || Number.isNaN(amount) || amount <= 0) return;

    const entry = {
      type: 'trip',
      category: 'Trip Expense',
      name,
      amount,
      date,
      notes: `Trip: ${name}`
    };

    if (typeof window.addEntry === 'function') {
      await window.addEntry(entry);
      await loadEntries();
    }

    event.target.reset();
  });

  tripYearSelect.addEventListener('change', () => {
    renderChart(tripYearSelect.value);
    loadEntries();
  });

  loadEntries();
});
