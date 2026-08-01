// investments.js - dedicated logic for Investments page with year-wise aggregation
// NOTE: Requires db.js to be loaded first (finance-tracker/backend/database/js/db.js)

document.addEventListener('DOMContentLoaded', async () => {
  const investmentTableBody = document.querySelector('#investmentsTable tbody');
  const savedYearSelect = document.getElementById('savedYearSelect'); // table year selector
  const categoryDetail = document.getElementById('categoryDetail');
  const detailTitle = document.getElementById('detailTitle');
  const detailContent = document.getElementById('detailContent');

  function formatINR(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
  }

  // Render Saved Investments table (aggregated year-wise for Mutual Fund)
  function renderInvestments(entries, selectedYear) {
    if (!investmentTableBody) return;

    const mfEntries = entries.filter(e => e.category === 'Mutual Fund');

    if (!mfEntries || mfEntries.length === 0) {
      investmentTableBody.innerHTML = '<tr><td colspan="3">No entries yet</td></tr>';
      return;
    }

    const yearlyTotals = {};
    mfEntries.forEach(entry => {
      const year = new Date(entry.date).getFullYear();
      if (!yearlyTotals[year]) yearlyTotals[year] = 0;
      yearlyTotals[year] += entry.amount || 0;
    });

    const displayYears = selectedYear ? [parseInt(selectedYear)] : Object.keys(yearlyTotals);

    investmentTableBody.innerHTML = displayYears.map(y => `
      <tr>
        <td>Mutual Fund</td>
        <td>${formatINR(yearlyTotals[y])}</td>
        <td>${y}</td>
      </tr>
    `).join('');
  }

  async function loadInvestments() {
    const entries = await window.fetchEntries().catch(() => []);
    const investments = entries.filter(e => e.type === 'investment');

    // Populate year selector dynamically
    const years = [...new Set(investments.map(e => new Date(e.date).getFullYear()))];
    savedYearSelect.innerHTML = '';
    years.sort().forEach(y => {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      savedYearSelect.appendChild(opt);
    });

    const selectedYearTable = savedYearSelect.value || null;
    renderInvestments(investments, selectedYearTable);

    // Totals
    const totals = { 'Mutual Fund':0, 'LIC':0, 'PPF':0, 'Sukanya Yojana':0 };
    investments.forEach(e => {
      if (totals[e.category] !== undefined) {
        totals[e.category] += e.amount || 0;
      }
    });

    document.getElementById('mutualFundTotal').textContent = formatINR(totals['Mutual Fund']);
    document.getElementById('licTotal').textContent = formatINR(totals['LIC']);
    document.getElementById('ppfTotal').textContent = formatINR(totals['PPF']);
    document.getElementById('sukanyaTotal').textContent = formatINR(totals['Sukanya Yojana']);

    // Render charts for each category
    const ctxMF = document.getElementById('mutualFundGrowthChart').getContext('2d');
    new Chart(ctxMF, {
      type: 'line',
      data: {
        labels: years,
        datasets: [{
          label: 'Mutual Fund Growth',
          data: years.map(y => investments
            .filter(e => e.category === 'Mutual Fund' && new Date(e.date).getFullYear() === y)
            .reduce((sum, e) => sum + (e.amount || 0), 0)),
          borderColor: '#1abc9c',
          backgroundColor: 'rgba(26,188,156,0.2)',
          fill: true,
          tension: 0.4
        }]
      },
      options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });

    const ctxLIC = document.getElementById('licGrowthChart').getContext('2d');
    new Chart(ctxLIC, {
      type: 'line',
      data: {
        labels: years,
        datasets: [{
          label: 'LIC Growth',
          data: years.map(y => investments
            .filter(e => e.category === 'LIC' && new Date(e.date).getFullYear() === y)
            .reduce((sum, e) => sum + (e.amount || 0), 0)),
          borderColor: '#3498db',
          backgroundColor: 'rgba(52,152,219,0.2)',
          fill: true,
          tension: 0.4
        }]
      },
      options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });

    const ctxPPF = document.getElementById('ppfGrowthChart').getContext('2d');
    new Chart(ctxPPF, {
      type: 'line',
      data: {
        labels: years,
        datasets: [{
          label: 'PPF Growth',
          data: years.map(y => investments
            .filter(e => e.category === 'PPF' && new Date(e.date).getFullYear() === y)
            .reduce((sum, e) => sum + (e.amount || 0), 0)),
          borderColor: '#e67e22',
          backgroundColor: 'rgba(230,126,34,0.2)',
          fill: true,
          tension: 0.4
        }]
      },
      options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });

    const ctxSukanya = document.getElementById('sukanyaGrowthChart').getContext('2d');
    new Chart(ctxSukanya, {
      type: 'line',
      data: {
        labels: years,
        datasets: [{
          label: 'Sukanya Yojana Growth',
          data: years.map(y => investments
            .filter(e => e.category === 'Sukanya Yojana' && new Date(e.date).getFullYear() === y)
            .reduce((sum, e) => sum + (e.amount || 0), 0)),
          borderColor: '#9b59b6',
          backgroundColor: 'rgba(155,89,182,0.2)',
          fill: true,
          tension: 0.4
        }]
      },
      options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
  }

  // Year selector changes
  if (savedYearSelect) {
    savedYearSelect.addEventListener('change', () => loadInvestments());
  }

  await loadInvestments();
});
