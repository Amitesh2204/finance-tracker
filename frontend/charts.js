// charts.js
// This file wires up financeChart (Budget) and recentActivityChart (Expense) using Chart.js

// Utility: fetch entries from PouchDB/Backend
async function getEntries() {
  if (window.fetchEntries) {
    return await window.fetchEntries();
  }
  return [];
}

// Finance Chart (Budget integration)
async function renderInvestmentGrowthChart(selectedYear) {
  const entries = await window.fetchEntries().catch(() => []);
  const investments = entries.filter(e => e.type === 'investment');

  // Group by month for the selected year
  const monthlyTotals = {};
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  months.forEach(m => monthlyTotals[m] = 0);

  investments.forEach(e => {
    const d = new Date(e.date);
    const year = d.getFullYear();
    if (year === parseInt(selectedYear)) {
      const month = d.toLocaleString('default', { month: 'short' });
      monthlyTotals[month] += e.amount || 0;
    }
  });

  const ctx = document.getElementById('investmentGrowthChart').getContext('2d');
  if (window.investmentChart) {
    window.investmentChart.destroy();
  }
  window.investmentChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [{
        label: `Investments in ${selectedYear}`,
        data: months.map(m => monthlyTotals[m]),
        backgroundColor: '#1abc9c'
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  // Populate year selector dynamically based on entries
  const entries = await window.fetchEntries().catch(() => []);
  const years = [...new Set(entries.map(e => new Date(e.date).getFullYear()))];
  const yearSelect = document.getElementById('yearSelect');
  years.sort().forEach(y => {
    if (!Array.from(yearSelect.options).some(opt => opt.value == y)) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      yearSelect.appendChild(opt);
    }
  });

  // Initial render
  renderInvestmentGrowthChart(yearSelect.value);

  // Update chart when year changes
  yearSelect.addEventListener('change', () => {
    renderInvestmentGrowthChart(yearSelect.value);
  });
});
