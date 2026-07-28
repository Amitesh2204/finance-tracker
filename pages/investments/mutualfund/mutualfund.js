// mutualfund.js - Mutual Fund page with PouchDB + CouchDB sync and month-year filter

document.addEventListener('DOMContentLoaded', async () => {
  const investedCard = document.getElementById('totalInvested');
  const growthCard = document.getElementById('totalGrowth');
  const tableBody = document.querySelector('#mutualFundTable tbody');
  const monthYearSelect = document.getElementById('monthYearSelect');

  let totalInvested = 0;
  let totalGrowth = 0;
  let monthlyData = {}; // { "Jul-2026": { invested: X, profit: Y } }

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
      const growthPct = d.profit && d.invested ? ((d.profit / d.invested) * 100).toFixed(2) : "0.00";
      return `<tr>
        <td>${m}</td>
        <td>Mutual Fund</td>
        <td>${formatINR(d.invested)}</td>
        <td>${formatINR(d.profit)}</td>
        <td>${growthPct}%</td>
      </tr>`;
    }).join('');
  }

  function renderChart(selectedYear = "2026") {
    const ctx = document.getElementById('mutualFundChart').getContext('2d');
    if (window.mfChart) window.mfChart.destroy();

    const months = ["Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun"];
    const investedData = months.map(m => {
      const key = `${m}-${selectedYear}`;
      return monthlyData[key]?.invested || 0;
    });
    const profitData = months.map(m => {
      const key = `${m}-${selectedYear}`;
      return monthlyData[key]?.profit || 0;
    });

    window.mfChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          { label: 'Invested', data: investedData, backgroundColor: '#3498db' },
          { label: 'Profit', data: profitData, backgroundColor: '#1abc9c' }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top' } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  // Load existing entries from DB
  async function loadEntries() {
    const entries = await window.fetchEntries().catch(() => []);
    const mfEntries = entries.filter(e => e.type === 'investment' && e.category === 'Mutual Fund');

    totalInvested = 0;
    totalGrowth = 0;
    monthlyData = {};

    mfEntries.forEach(e => {
      const d = new Date(e.date);
      const month = d.toLocaleString('default',{month:'short'});
      const year = d.getFullYear();
      const key = `${month}-${year}`;
      monthlyData[key] = monthlyData[key] || { invested:0, profit:0 };
      if (e.subtype === 'investment' || e.notes?.toLowerCase().includes('investment')) {
        monthlyData[key].invested += e.amount;
        totalInvested += e.amount;
      } else if (e.subtype === 'profit' || e.notes?.toLowerCase().includes('profit')) {
        monthlyData[key].profit += e.amount;
        totalGrowth += e.amount;
      }
    });

    updateCards();
    populateMonthYearDropdown();
    renderTable(monthYearSelect.value || null);
    renderChart("2026");
  }

  // Handle investment form
  document.getElementById('investmentForm').addEventListener('submit', async e => {
    e.preventDefault();
    const amt = parseFloat(document.getElementById('monthlyAmount').value);
    if (isNaN(amt) || amt <= 0) return;

    const d = new Date();
    const month = d.toLocaleString('default',{month:'short'});
    const year = d.getFullYear();
    const key = `${month}-${year}`;
    totalInvested += amt;
    monthlyData[key] = monthlyData[key] || { invested:0, profit:0 };
    monthlyData[key].invested += amt;

    // Save entry to DB
    const entry = {
      type: 'investment',
      category: 'Mutual Fund',
      subtype: 'investment',
      amount: amt,
      currency: 'INR',
      date: d.toISOString(),
      notes: `Mutual Fund investment for ${key}`
    };
    await window.addEntry(entry);

    updateCards();
    populateMonthYearDropdown();
    renderTable(monthYearSelect.value || null);
    renderChart(year.toString());
    e.target.reset();
  });

  // Handle profit form
  document.getElementById('profitForm').addEventListener('submit', async e => {
    e.preventDefault();
    const profit = parseFloat(document.getElementById('monthlyProfit').value);
    if (isNaN(profit) || profit <= 0) return;

    const d = new Date();
    const month = d.toLocaleString('default',{month:'short'});
    const year = d.getFullYear();
    const key = `${month}-${year}`;
    totalGrowth += profit;
    monthlyData[key] = monthlyData[key] || { invested:0, profit:0 };
    monthlyData[key].profit += profit;

    // Save entry to DB
    const entry = {
      type: 'investment',
      category: 'Mutual Fund',
      subtype: 'profit',
      amount: profit,
      currency: 'INR',
      date: d.toISOString(),
      notes: `Mutual Fund profit for ${key}`
    };
    await window.addEntry(entry);

    updateCards();
    populateMonthYearDropdown();
    renderTable(monthYearSelect.value || null);
    renderChart(year.toString());
    e.target.reset();
  });

  // Month-year dropdown change
  monthYearSelect.addEventListener('change', () => {
    const selected = monthYearSelect.value;
    renderTable(selected);
  });

  // Initial load
  loadEntries();
});
