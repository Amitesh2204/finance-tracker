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
async function renderFinanceChart() {
  const ctx = document.getElementById('financeChart').getContext('2d');
  const entries = await getEntries();
  const budgetEntries = entries.filter(e => e.type === 'budget');

  // Group by month
  const monthlyTotals = {};
  budgetEntries.forEach(e => {
    const month = new Date(e.date).toLocaleString('default', { month: 'short' });
    monthlyTotals[month] = (monthlyTotals[month] || 0) + e.amount;
  });

  const labels = Object.keys(monthlyTotals);
  const data = Object.values(monthlyTotals);

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Budget',
        data,
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

// Recent Activity Chart (Expense integration)
async function renderRecentActivityChart() {
  const ctx = document.getElementById('recentActivityChart').getContext('2d');
  const entries = await getEntries();
  const expenseEntries = entries.filter(e => e.type === 'expense');

  // Last month’s expenses grouped by day
  const now = new Date();
  const lastMonth = now.getMonth() - 1;
  const monthlyExpenses = expenseEntries.filter(e => new Date(e.date).getMonth() === lastMonth);

  const dailyTotals = {};
  monthlyExpenses.forEach(e => {
    const day = new Date(e.date).getDate();
    dailyTotals[day] = (dailyTotals[day] || 0) + e.amount;
  });

  const labels = Object.keys(dailyTotals).map(d => `Day ${d}`);
  const data = Object.values(dailyTotals);

  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Expenses',
        data,
        borderColor: '#e74c3c',
        backgroundColor: 'rgba(231,76,60,0.2)',
        fill: true,
        tension: 0.3
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

// Initialize charts on DOM load
document.addEventListener('DOMContentLoaded', () => {
  renderFinanceChart();
  renderRecentActivityChart();
});
