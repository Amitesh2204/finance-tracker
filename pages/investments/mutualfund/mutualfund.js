// mutualfund.js - dedicated logic for Mutual Fund page with PouchDB + CouchDB sync

document.addEventListener('DOMContentLoaded', async () => {
  const investedCard = document.getElementById('totalInvested');
  const growthCard = document.getElementById('totalGrowth');
  const tableBody = document.querySelector('#mutualFundTable tbody');

  let totalInvested = 0;
  let totalGrowth = 0;
  let monthlyData = {}; // { "Jul": { invested: X, profit: Y } }

  function formatINR(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
  }

  function updateCards() {
    investedCard.textContent = formatINR(totalInvested);
    growthCard.textContent = formatINR(totalGrowth);
  }

  function renderTable() {
    const months = Object.keys(monthlyData);
    if (months.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="4">No data yet</td></tr>';
      return;
    }
    tableBody.innerHTML = months.map(m => {
      const d = monthlyData[m];
      const growthPct = d.profit && d.invested ? ((d.profit / d.invested) * 100).toFixed(2) : "0.00";
      return `<tr>
        <td>Mutual Fund</td>
        <td>${formatINR(d.invested)}</td>
        <td>${formatINR(d.profit)}</td>
        <td>${growthPct}%</td>
      </tr>`;
    }).join('');
  }

  function renderChart() {
    const ctx = document.getElementById('mutualFundChart').getContext('2d');
    if (window.mfChart) window.mfChart.destroy();

    const months = ["Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun"];
    const investedData = months.map(m => monthlyData[m]?.invested || 0);
    const profitData = months.map(m => monthlyData[m]?.profit || 0);

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
    const mfEntries = entries.filter(e => e.type === 'mutualfund');
    totalInvested = 0;
    totalGrowth = 0;
    monthlyData = {};

    mfEntries.forEach(e => {
      const month = new Date(e.date).toLocaleString('default',{month:'short'});
      monthlyData[month] = monthlyData[month] || { invested:0, profit:0 };
      if (e.category === 'investment') {
        monthlyData[month].invested += e.amount;
        totalInvested += e.amount;
      } else if (e.category === 'profit') {
        monthlyData[month].profit += e.amount;
        totalGrowth += e.amount;
      }
    });

    updateCards();
    renderTable();
    renderChart();
  }

  // Handle investment form
  document.getElementById('investmentForm').addEventListener('submit', async e => {
    e.preventDefault();
    const amt = parseFloat(document.getElementById('monthlyAmount').value);
    if (isNaN(amt) || amt <= 0) return;

    const month = new Date().toLocaleString('default',{month:'short'});
    totalInvested += amt;
    monthlyData[month] = monthlyData[month] || { invested:0, profit:0 };
    monthlyData[month].invested += amt;

    // Save entry to DB
    const entry = {
      type: 'mutualfund',
      category: 'investment',
      amount: amt,
      currency: 'INR',
      date: new Date().toISOString(),
      notes: `Mutual Fund investment for ${month}`
    };
    await window.addEntry(entry);

    updateCards();
    renderTable();
    renderChart();
    e.target.reset();
  });

  // Handle profit form
  document.getElementById('profitForm').addEventListener('submit', async e => {
    e.preventDefault();
    const profit = parseFloat(document.getElementById('monthlyProfit').value);
    if (isNaN(profit) || profit <= 0) return;

    const month = new Date().toLocaleString('default',{month:'short'});
    totalGrowth += profit;
    monthlyData[month] = monthlyData[month] || { invested:0, profit:0 };
    monthlyData[month].profit += profit;

    // Save entry to DB
    const entry = {
      type: 'mutualfund',
      category: 'profit',
      amount: profit,
      currency: 'INR',
      date: new Date().toISOString(),
      notes: `Mutual Fund profit for ${month}`
    };
    await window.addEntry(entry);

    updateCards();
    renderTable();
    renderChart();
    e.target.reset();
  });

  // Initial load
  await window.syncPendingEntries();
  loadEntries();
});
