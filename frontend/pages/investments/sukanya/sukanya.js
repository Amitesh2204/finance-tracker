// sukanya.js - Sukanya Yojana page with PouchDB + CouchDB sync and month-year filter
// NOTE: Requires db.js to be loaded first

document.addEventListener('DOMContentLoaded', async () => {
  const investedCard = document.getElementById('sukanyaTotalInvested');
  const growthCard = document.getElementById('sukanyaTotalGrowth');
  const tableBody = document.querySelector('#sukanyaTable tbody');
  const monthYearSelect = document.getElementById('sukanyaMonthYearSelect');
  const yearSelect = document.getElementById('sukanyaYearSelect');

  let totalInvested = 0;
  let totalGrowth = 0;
  let monthlyData = {}; // { "Aug-2026": { invested: X, profit: Y } }

  function formatINR(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
  }

  function updateCards() {
    investedCard.textContent = formatINR(totalInvested);
    growthCard.textContent = formatINR(totalGrowth);
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
      tableBody.innerHTML = '<tr><td colspan="5">No data yet</td></tr>';
      return;
    }
    const filtered = selectedMonthYear ? [selectedMonthYear] : months;
    tableBody.innerHTML = filtered.map(m => {
      const d = monthlyData[m];
      const invested = d.invested || 0;
      const profit = d.profit || 0;
      const growthPct = invested > 0 ? ((profit / invested) * 100).toFixed(2) : "0.00";
      return `<tr>
        <td>${m}</td>
        <td>Sukanya Yojana</td>
        <td>${formatINR(invested)}</td>
        <td>${formatINR(profit)}</td>
        <td>${growthPct}%</td>
      </tr>`;
    }).join('');
  }

  function renderChart(selectedYear) {
    const canvas = document.getElementById('sukanyaGrowthChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (window.sukanyaChart && typeof window.sukanyaChart.destroy === 'function') {
      window.sukanyaChart.destroy();
    }

    const months = ["Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun"];
    const investedData = months.map(m => {
      const key = `${m}-${selectedYear}`;
      return monthlyData[key]?.invested || 0;
    });

    window.sukanyaChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          { label: 'Invested', data: investedData, backgroundColor: '#9b59b6' }
        ]
      },
      options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
  }

  // Populate year selector for Sukanya Growth
  function populateSukanyaYearDropdown(entries) {
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
    const sukanyaEntries = entries.filter(e => e.type === 'investment' && e.category === 'Sukanya Yojana');

    totalInvested = 0;
    totalGrowth = 0;
    monthlyData = {};

    sukanyaEntries.forEach(e => {
      const d = new Date(e.date);
      const month = d.toLocaleString('default',{month:'short'});
      const year = d.getFullYear();
      const key = `${month}-${year}`;
      monthlyData[key] = monthlyData[key] || { invested:0, profit:0 };

      if (e.subtype === 'profit') {
        monthlyData[key].profit += Number(e.amount) || 0;
        totalGrowth += Number(e.amount) || 0;
      } else {
        monthlyData[key].invested += Number(e.amount) || 0;
        totalInvested += Number(e.amount) || 0;
      }
    });

    updateCards();
    populateMonthYearDropdown();
    renderTable(monthYearSelect.value || null);

    populateSukanyaYearDropdown(sukanyaEntries);
    const selectedYear = yearSelect.value || new Date().getFullYear();
    renderChart(selectedYear);
  }

  // Handle investment form
  document.getElementById('sukanyaInvestmentForm').addEventListener('submit', async e => {
    e.preventDefault();
    const amt = parseFloat(document.getElementById('sukanyaAmount').value);
    if (isNaN(amt) || amt <= 0) return;

    const d = new Date();
    const month = d.toLocaleString('default',{month:'short'});
    const year = d.getFullYear();
    const key = `${month}-${year}`;

    const entry = {
      type: 'investment',
      category: 'Sukanya Yojana',
      subtype: 'investment',
      amount: amt,
      currency: 'INR',
      date: d.toISOString(),
      notes: `Sukanya Yojana investment for ${key}`
    };
    await window.addEntry(entry);
    await loadEntries();

    e.target.reset();
  });

  // Handle profit form
  document.getElementById('sukanyaProfitForm').addEventListener('submit', async e => {
    e.preventDefault();
    const amt = parseFloat(document.getElementById('sukanyaProfitAmount').value);
    if (isNaN(amt) || amt <= 0) return;

    const d = new Date();
    const year = d.getFullYear();
    const entry = {
      type: 'investment',
      category: 'Sukanya Yojana',
      subtype: 'profit',
      amount: amt,
      currency: 'INR',
      date: d.toISOString(),
      notes: `Sukanya Yojana yearly profit for ${year}`
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
