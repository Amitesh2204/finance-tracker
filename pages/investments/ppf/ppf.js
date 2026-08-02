// ppf.js - PPF page with PouchDB + CouchDB sync and month-year filter
// NOTE: Requires db.js to be loaded first (finance-tracker/backend/database/js/db.js)

document.addEventListener('DOMContentLoaded', async () => {
  const investedCard = document.getElementById('ppfTotalInvested');
  const tableBody = document.querySelector('#ppfTable tbody');
  const monthYearSelect = document.getElementById('ppfMonthYearSelect');
  const yearSelect = document.getElementById('ppfYearSelect');

  let totalInvested = 0;
  let monthlyData = {}; // { "Aug-2026": { invested: X } }

  function formatINR(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
  }

  function updateCards() {
    investedCard.textContent = formatINR(totalInvested);
  }

  function populateMonthYearDropdown() {
    const months = Object.keys(monthlyData);
    monthYearSelect.innerHTML = '';
    if (months.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No data';
      monthYearSelect.appendChild(opt);
      return;
    }
    months.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      monthYearSelect.appendChild(opt);
    });
  }

  function renderTable(selectedMonthYear = null) {
    const months = Object.keys(monthlyData);
    if (months.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="3">No data yet</td></tr>';
      return;
    }
    const filtered = selectedMonthYear ? [selectedMonthYear] : months;
    tableBody.innerHTML = filtered.map(m => {
      const d = monthlyData[m];
      return `<tr>
        <td>${m}</td>
        <td>PPF</td>
        <td>${formatINR(d.invested)}</td>
      </tr>`;
    }).join('');
  }

  function renderChart(selectedYear) {
    const canvas = document.getElementById('ppfGrowthChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (window.ppfChart && typeof window.ppfChart.destroy === 'function') {
      window.ppfChart.destroy();
    }

    const months = ["Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun"];
    const investedData = months.map(m => {
      const key = `${m}-${selectedYear}`;
      return monthlyData[key]?.invested || 0;
    });

    window.ppfChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          { label: 'Invested', data: investedData, backgroundColor: '#e67e22' }
        ]
      },
      options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
  }

  // Populate year selector for PPF Growth
  function populatePpfYearDropdown(entries) {
    const years = [...new Set(entries.map(e => new Date(e.date).getFullYear()))];
    yearSelect.innerHTML = '';
    if (years.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No data';
      yearSelect.appendChild(opt);
      return;
    }
    years.sort().forEach(y => {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      yearSelect.appendChild(opt);
    });
    yearSelect.addEventListener('change', () => renderChart(yearSelect.value));
  }

  async function loadEntries() {
    const entries = await window.fetchEntries().catch(() => []);
    const ppfEntries = entries.filter(e => e.type === 'investment' && e.category === 'PPF');

    totalInvested = 0;
    monthlyData = {};

    ppfEntries.forEach(e => {
      const d = new Date(e.date);
      const month = d.toLocaleString('default',{month:'short'});
      const year = d.getFullYear();
      const key = `${month}-${year}`;
      monthlyData[key] = monthlyData[key] || { invested:0 };
      monthlyData[key].invested += Number(e.amount) || 0;
      totalInvested += Number(e.amount) || 0;
    });

    updateCards();
    populateMonthYearDropdown();
    renderTable(monthYearSelect.value || null);

    populatePpfYearDropdown(ppfEntries);
    renderChart(yearSelect.value || new Date().getFullYear());
  }

  // Handle investment form
  document.getElementById('ppfInvestmentForm').addEventListener('submit', async e => {
    e.preventDefault();
    const amt = parseFloat(document.getElementById('ppfAmount').value);
    if (isNaN(amt) || amt <= 0) return;

    const d = new Date();
    const month = d.toLocaleString('default',{month:'short'});
    const year = d.getFullYear();
    const key = `${month}-${year}`;

    const entry = {
      type: 'investment',
      category: 'PPF',
      subtype: 'investment',
      amount: amt,
      currency: 'INR',
      date: d.toISOString(),
      notes: `PPF investment for ${key}`
    };
    await window.addEntry(entry);
    await loadEntries();

    e.target.reset();
  });

  // Month-year dropdown change for summary table
  monthYearSelect.addEventListener('change', () => {
    const selected = monthYearSelect.value;
    renderTable(selected);
  });

  // Initial load
  loadEntries();
});
