// investments.js - dedicated logic for Investments page

document.addEventListener('DOMContentLoaded', async () => {
  const investmentForm = document.getElementById('investmentForm');
  const investmentTableBody = document.querySelector('#investmentsTable tbody');

  function renderInvestments(entries) {
    if (!investmentTableBody) return;
    if (!entries || entries.length === 0) {
      investmentTableBody.innerHTML = '<tr><td colspan="3">No investments yet</td></tr>';
      return;
    }
    investmentTableBody.innerHTML = entries.map(entry => `
      <tr>
        <td>${entry.category || entry.type}</td>
        <td>$${Number(entry.amount).toFixed(2)}</td>
        <td>${new Date(entry.date).toLocaleString()}</td>
      </tr>
    `).join('');
  }

  async function loadInvestments() {
    const entries = await window.fetchEntries().catch(() => []);
    const investments = entries.filter(e => e.type === 'investment');
    renderInvestments(investments);

    const totals = { 'Mutual Fund':0, 'LIC':0, 'PPF':0, 'Sukanya Yojana':0 };
    investments.forEach(e => {
      if (totals[e.category] !== undefined) {
        totals[e.category] += e.amount || 0;
      }
    });

    document.getElementById('mutualFundTotal').textContent = `$${totals['Mutual Fund'].toFixed(2)}`;
    document.getElementById('licTotal').textContent = `$${totals['LIC'].toFixed(2)}`;
    document.getElementById('ppfTotal').textContent = `$${totals['PPF'].toFixed(2)}`;
    document.getElementById('sukanyaTotal').textContent = `$${totals['Sukanya Yojana'].toFixed(2)}`;

    const ctx = document.getElementById('investmentGrowthChart').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: Object.keys(totals),
        datasets: [{
          label: 'Investment Growth',
          data: Object.values(totals),
          borderColor: ['#1abc9c','#3498db','#e67e22','#9b59b6'],
          backgroundColor: 'rgba(26,188,156,0.2)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: ['#1abc9c','#3498db','#e67e22','#9b59b6'],
          pointRadius: 5
        }]
      },
      options: {
        responsive: true,
        plugins: { tooltip: { enabled: true }, legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  if (investmentForm) {
    // Ensure syncPendingEntries exists before calling
    if (typeof window.syncPendingEntries === 'function') {
      await window.syncPendingEntries();
    }
    loadInvestments();

    investmentForm.addEventListener('submit', async event => {
      event.preventDefault();
      const type = document.getElementById('investmentType').value;
      const amount = parseFloat(document.getElementById('investmentAmount').value);
      if (Number.isNaN(amount) || amount <= 0) return;

      const entry = {
        type: 'investment',
        category: type,
        amount,
        date: new Date().toISOString(),
        notes: `Investment: ${type}`
      };

      if (typeof window.addEntry === 'function') {
        await window.addEntry(entry);
      }
      investmentForm.reset();
      loadInvestments();
    });
  }
});
